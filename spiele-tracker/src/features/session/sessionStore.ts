import { create } from 'zustand';
import { backend } from '@/lib/backend';
import type {
  AppendableEvent,
  GameEvent,
  SessionPlayer,
  StatsResult,
} from '@/games/types';

/**
 * Die generische Session-Hülle.
 *
 * Sie kennt kein einziges Spiel. Sie legt die Session an, vergibt tMs, führt
 * die Teilnehmerliste, puffert Events lokal und schreibt sie asynchron nach
 * Supabase. Ein Spiel ruft append(), setActivePlayer() und finish().
 *
 * Warum lokal puffern: neben der Dartscheibe ist das WLAN oft mies. Der
 * Live-Screen darf nie auf eine Netzwerkantwort warten, und ein Wurf darf
 * nicht verloren gehen, nur weil gerade ein Request hängt.
 *
 * Mehrspieler läuft über ein Handy, das herumgereicht wird (Entscheidung vom
 * 30.10.). Es gibt deshalb bewusst keine Geräte-Synchronisierung: wer am
 * Abwurfpunkt steht, ist reiner Zustand dieses einen Geräts.
 */

export interface LocalEvent extends GameEvent {
  /** Lokale, monoton steigende ID. Existiert schon vor dem Serverschreiben. */
  localId: number;
  /** Serverseitige ID, sobald geschrieben. */
  id?: number;
  /** true, sobald die Zeile in der Datenbank liegt. */
  persisted: boolean;
  /** Korrekturziel, solange dessen Server-ID noch fehlt. */
  correctsLocalId?: number;
}

export type SessionPhase = 'idle' | 'starting' | 'running' | 'finishing' | 'finished' | 'error';

interface StartOptions {
  gameId: string;
  config: unknown;
  /** Mindestens einer. Die Reihenfolge ist die Spielreihenfolge. */
  players: SessionPlayer[];
  /** Wer die Session anlegt – das ist der angemeldete Nutzer am Gerät. */
  createdBy: string;
  groupId?: string | null;
  tags?: string[];
}

interface SessionState {
  phase: SessionPhase;
  sessionId: string | null;
  gameId: string | null;
  config: unknown;
  players: SessionPlayer[];
  activePlayerId: string | null;
  events: LocalEvent[];
  statsByPlayer: Record<string, StatsResult>;
  error: string | null;
  /** Anzahl noch nicht geschriebener Events – fürs UI ("3 ausstehend"). */
  pendingCount: number;

  start: (options: StartOptions) => Promise<string | null>;
  append: (event: AppendableEvent) => void;
  correct: (targetId: number | undefined, patch: AppendableEvent) => void;
  setActivePlayer: (playerId: string) => void;
  finish: (statsByPlayer: Record<string, StatsResult>) => Promise<void>;
  reset: () => void;
}

/**
 * Zeitbasis. performance.now() statt Date.now(), weil es monoton ist – eine
 * Systemzeitkorrektur mitten in der Session darf die Zeitstatistiken nicht
 * verschieben.
 *
 * tMs zählt über die ganze Session, auch über Spielerwechsel hinweg. Wo ein
 * Spiel pro Spieler eine eigene Uhr braucht (Round the Clock auf Zeit),
 * markiert es den Beginn mit einem eigenen Event und rechnet in computeStats
 * relativ dazu. So bleibt das Log eine durchgehende Zeitachse.
 */
let startPerf = 0;
let localIdCounter = 0;
let clientSeqCounter = 0;

let flushTimer: number | undefined;
let flushing = false;

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: 'idle',
  sessionId: null,
  gameId: null,
  config: null,
  players: [],
  activePlayerId: null,
  events: [],
  statsByPlayer: {},
  error: null,
  pendingCount: 0,

  start: async ({ gameId, config, players, createdBy, groupId, tags }) => {
    if (players.length === 0) {
      set({ phase: 'error', error: 'Ohne Spieler lässt sich keine Session starten.' });
      return null;
    }

    set({
      phase: 'starting',
      error: null,
      events: [],
      statsByPlayer: {},
      pendingCount: 0,
    });
    localIdCounter = 0;
    clientSeqCounter = 0;

    const now = new Date();
    let sessionId: string;
    try {
      sessionId = await backend.sessions.create({
        gameId,
        groupId: groupId ?? null,
        createdBy,
        config,
        startedAt: now.toISOString(),
        // Lokale Zeit ohne Zone plus Offset: die Tageszeit-Auswertung fragt
        // "war das eine Session um 22 Uhr abends", nicht "um 20 Uhr UTC".
        localStartedAt: toLocalTimestamp(now),
        tzOffsetMinutes: -now.getTimezoneOffset(),
      });
      await backend.sessions.addPlayers(
        sessionId,
        players.map((p) => p.id),
      );
      await backend.sessions.addTags(sessionId, normaliseTags(tags ?? []));
    } catch (e) {
      set({ phase: 'error', error: (e as Error).message });
      return null;
    }

    startPerf = performance.now();
    set({
      phase: 'running',
      sessionId,
      gameId,
      config,
      players,
      activePlayerId: players[0].id,
    });
    scheduleFlush();
    return sessionId;
  },

  append: (event) => {
    const { sessionId, activePlayerId, phase } = get();
    if (!sessionId || (phase !== 'running' && phase !== 'finishing')) return;

    const local: LocalEvent = {
      localId: ++localIdCounter,
      sessionId,
      // Ohne ausdrückliche Angabe gehört ein Event dem, der gerade wirft.
      playerId: event.playerId !== undefined ? event.playerId : activePlayerId,
      // Wenn ein Spiel selbst einen Zeitpunkt mitgibt, gilt der. Die
      // Spracherkennung nutzt das, um den Zeitpunkt des ersten
      // Zwischenergebnisses zu setzen statt den des finalen.
      tMs: Math.max(0, Math.round(event.tMs ?? performance.now() - startPerf)),
      type: event.type,
      payload: event.payload ?? {},
      source: event.source ?? 'system',
      voidsTarget: event.voidsTarget ?? false,
      clientSeq: ++clientSeqCounter,
      persisted: false,
    };

    set((state) => ({
      events: [...state.events, local],
      pendingCount: state.pendingCount + 1,
    }));
    scheduleFlush();
  },

  correct: (targetId, patch) => {
    const { events } = get();
    // targetId darf die Server-ID oder die lokale ID sein – das Spiel soll
    // sich nicht darum kümmern müssen, ob schon geschrieben wurde.
    const target = events.find((e) => e.id === targetId || e.localId === targetId);

    get().append({
      ...patch,
      // Die Korrektur erbt den Zeitpunkt und den Spieler des Originals, sonst
      // verschieben sich sämtliche Zeitstatistiken.
      tMs: patch.tMs ?? target?.tMs,
      playerId: patch.playerId ?? target?.playerId,
    });

    if (!target) return;

    set((state) => {
      const events = [...state.events];
      const i = events.length - 1;
      events[i] = {
        ...events[i],
        correctsEventId: target.id ?? null,
        correctsLocalId: target.localId,
      };
      return { events };
    });
  },

  setActivePlayer: (playerId) => {
    const { activePlayerId, players } = get();
    if (playerId === activePlayerId) return;
    if (!players.some((p) => p.id === playerId)) return;

    // Der Wechsel gehört ins Log, sonst lässt sich später nicht
    // rekonstruieren, wer wann am Abwurfpunkt stand.
    get().append({
      type: 'player_change',
      source: 'system',
      payload: { from: activePlayerId, to: playerId },
      playerId,
    });
    set({ activePlayerId: playerId });
  },

  finish: async (statsByPlayer) => {
    const { sessionId } = get();
    set({ phase: 'finishing', statsByPlayer });
    if (!sessionId) {
      set({ phase: 'finished' });
      return;
    }

    await flushEvents();

    let error: string | null = null;
    try {
      await backend.sessions.finish(sessionId);
      await backend.sessions.saveResults(
        Object.entries(statsByPlayer).map(([playerId, stats]) => ({
          sessionId,
          playerId,
          stats,
          statsVersion: STATS_VERSION,
        })),
      );
    } catch (e) {
      error = (e as Error).message;
    }

    stopFlush();
    set({ phase: 'finished', error });
  },

  reset: () => {
    stopFlush();
    set({
      phase: 'idle',
      sessionId: null,
      gameId: null,
      config: null,
      players: [],
      activePlayerId: null,
      events: [],
      statsByPlayer: {},
      error: null,
      pendingCount: 0,
    });
  },
}));

/**
 * Version der Statistik-Berechnung. Wird mitgeschrieben, damit sich später
 * erkennen lässt, welche Ergebnisse mit einer veralteten Formel entstanden
 * sind und neu gerechnet werden müssen.
 */
export const STATS_VERSION = 1;

function scheduleFlush() {
  if (flushTimer !== undefined) return;
  flushTimer = window.setInterval(() => void flushEvents(), 1500);
}

function stopFlush() {
  if (flushTimer !== undefined) {
    window.clearInterval(flushTimer);
    flushTimer = undefined;
  }
}

/**
 * Schreibt alle noch nicht persistierten Events. Bei einem Fehler bleiben sie
 * im Puffer und werden beim nächsten Lauf erneut versucht – der Live-Screen
 * merkt davon nichts.
 */
async function flushEvents(): Promise<void> {
  if (flushing) return;
  const state = useSessionStore.getState();
  const pending = state.events.filter((e) => !e.persisted);
  if (pending.length === 0) return;

  flushing = true;
  try {
    const ids = await backend.events.append(
      pending.map((e) => ({
        sessionId: e.sessionId,
        playerId: e.playerId,
        tMs: e.tMs,
        type: e.type,
        payload: e.payload as Record<string, unknown>,
        source: e.source,
        // Zeigt die Korrektur auf ein Event, das inzwischen geschrieben
        // wurde, holen wir uns dessen Server-ID jetzt nach.
        correctsEventId: resolveCorrectsId(e, state.events),
        voidsTarget: e.voidsTarget ?? false,
        clientSeq: e.clientSeq ?? null,
      })),
    );

    useSessionStore.setState((current) => {
      const byLocalId = new Map(pending.map((e, i) => [e.localId, ids[i]]));
      const events = current.events.map((e) =>
        byLocalId.has(e.localId) ? { ...e, id: byLocalId.get(e.localId), persisted: true } : e,
      );
      return { events, pendingCount: events.filter((e) => !e.persisted).length };
    });
  } catch {
    // Absichtlich still: nächster Versuch in 1,5 s. Die Events bleiben im
    // Puffer, der Live-Screen merkt nichts davon.
  } finally {
    flushing = false;
  }
}

function resolveCorrectsId(event: LocalEvent, all: LocalEvent[]): number | null {
  if (event.correctsEventId) return event.correctsEventId;
  if (event.correctsLocalId === undefined) return null;
  return all.find((e) => e.localId === event.correctsLocalId)?.id ?? null;
}

/** 'YYYY-MM-DDTHH:mm:ss' in lokaler Zeit, ohne Zonenangabe. */
function toLocalTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Tags vereinheitlichen: klein, getrimmt, ohne Dubletten. */
export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, 32);
    if (tag) seen.add(tag);
  }
  return [...seen];
}
