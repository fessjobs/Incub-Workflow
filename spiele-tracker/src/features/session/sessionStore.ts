import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { AppendableEvent, GameEvent, StatsResult } from '@/games/types';
import type { Json } from '@/lib/database.types';

/**
 * Die generische Session-Hülle.
 *
 * Sie kennt kein einziges Spiel. Sie legt die Session an, vergibt tMs, puffert
 * Events lokal und schreibt sie asynchron nach Supabase. Ein Spiel ruft nur
 * append() und finish() – alles andere passiert hier.
 *
 * Warum lokal puffern: neben der Dartscheibe ist das WLAN oft mies. Der
 * Live-Screen darf nie auf eine Netzwerkantwort warten, und ein Wurf darf
 * nicht verloren gehen, nur weil gerade ein Request hängt.
 */

export interface LocalEvent extends GameEvent {
  /** Lokale, monoton steigende ID. Existiert schon vor dem Serverschreiben. */
  localId: number;
  /** Serverseitige ID, sobald geschrieben. */
  id?: number;
  /** true, sobald die Zeile in der Datenbank liegt. */
  persisted: boolean;
}

export type SessionPhase = 'idle' | 'starting' | 'running' | 'finishing' | 'finished' | 'error';

interface StartOptions {
  gameId: string;
  config: unknown;
  playerId: string;
  groupId?: string | null;
  tags?: string[];
}

interface SessionState {
  phase: SessionPhase;
  sessionId: string | null;
  gameId: string | null;
  config: unknown;
  playerId: string | null;
  events: LocalEvent[];
  stats: StatsResult | null;
  error: string | null;
  /** Anzahl noch nicht geschriebener Events – fürs UI ("3 ausstehend"). */
  pendingCount: number;

  start: (options: StartOptions) => Promise<string | null>;
  append: (event: AppendableEvent) => void;
  correct: (targetId: number | undefined, patch: AppendableEvent) => void;
  finish: (stats: StatsResult) => Promise<void>;
  reset: () => void;
  /** Nur für Tests: erlaubt das Setzen eines Startpunkts. */
  _debugSetEvents: (events: LocalEvent[]) => void;
}

/**
 * Zeitbasis. performance.now() statt Date.now(), weil es monoton ist – eine
 * Systemzeitkorrektur mitten in der Session darf die Zeitstatistiken nicht
 * verschieben.
 */
let startPerf = 0;
let localIdCounter = 0;
let clientSeqCounter = 0;

/** Läuft im Hintergrund und schreibt gepufferte Events weg. */
let flushTimer: number | undefined;
let flushing = false;

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: 'idle',
  sessionId: null,
  gameId: null,
  config: null,
  playerId: null,
  events: [],
  stats: null,
  error: null,
  pendingCount: 0,

  start: async ({ gameId, config, playerId, groupId, tags }) => {
    set({ phase: 'starting', error: null, events: [], stats: null, pendingCount: 0 });
    localIdCounter = 0;
    clientSeqCounter = 0;

    const now = new Date();
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        game_id: gameId,
        group_id: groupId ?? null,
        created_by: playerId,
        config: config as Json,
        status: 'running',
        started_at: now.toISOString(),
        // Lokale Zeit ohne Zone plus Offset: die Tageszeit-Auswertung fragt
        // "war das eine Session um 22 Uhr abends", nicht "um 20 Uhr UTC".
        local_started_at: toLocalTimestamp(now),
        tz_offset_minutes: -now.getTimezoneOffset(),
      })
      .select()
      .single();

    if (error || !data) {
      set({ phase: 'error', error: error?.message ?? 'Session konnte nicht angelegt werden.' });
      return null;
    }

    await supabase.from('session_players').insert({ session_id: data.id, player_id: playerId });

    const cleanTags = normaliseTags(tags ?? []);
    if (cleanTags.length > 0) {
      await supabase
        .from('session_tags')
        .insert(cleanTags.map((tag) => ({ session_id: data.id, tag })));
    }

    startPerf = performance.now();
    set({
      phase: 'running',
      sessionId: data.id,
      gameId,
      config,
      playerId,
    });
    scheduleFlush();
    return data.id;
  },

  append: (event) => {
    const { sessionId, playerId, phase } = get();
    if (!sessionId || (phase !== 'running' && phase !== 'finishing')) return;

    const local: LocalEvent = {
      localId: ++localIdCounter,
      sessionId,
      playerId: event.playerId ?? playerId,
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
      // Die Korrektur erbt den Zeitpunkt des Originals, sonst verschieben sich
      // sämtliche Zeitstatistiken.
      tMs: patch.tMs ?? target?.tMs,
    });

    if (target) {
      // Verknüpfung erst beim Flush setzen, wenn die Server-ID des Originals
      // bekannt ist. Bis dahin merken wir sie uns lokal.
      const correction = get().events[get().events.length - 1];
      correction.correctsEventId = target.id ?? null;
      (correction as LocalEvent & { correctsLocalId?: number }).correctsLocalId = target.localId;
    }
  },

  finish: async (stats) => {
    const { sessionId, playerId } = get();
    set({ phase: 'finishing', stats });
    if (!sessionId) {
      set({ phase: 'finished' });
      return;
    }

    await flushEvents();

    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (playerId) {
      await supabase.from('session_results').upsert({
        session_id: sessionId,
        player_id: playerId,
        stats: stats as unknown as Json,
        stats_version: STATS_VERSION,
        computed_at: new Date().toISOString(),
      });
    }

    stopFlush();
    set({ phase: 'finished', error: error?.message ?? null });
  },

  reset: () => {
    stopFlush();
    set({
      phase: 'idle',
      sessionId: null,
      gameId: null,
      config: null,
      playerId: null,
      events: [],
      stats: null,
      error: null,
      pendingCount: 0,
    });
  },

  _debugSetEvents: (events) => set({ events }),
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
    const rows = pending.map((e) => ({
      session_id: e.sessionId,
      player_id: e.playerId,
      t_ms: e.tMs,
      type: e.type,
      payload: e.payload as Json,
      source: e.source,
      // Zeigt die Korrektur auf ein Event, das inzwischen geschrieben wurde,
      // holen wir uns dessen Server-ID jetzt nach.
      corrects_event_id: resolveCorrectsId(e, state.events),
      voids_target: e.voidsTarget ?? false,
      client_seq: e.clientSeq ?? null,
    }));

    const { data, error } = await supabase.from('game_events').insert(rows).select('id');
    if (error || !data) {
      // Absichtlich still: nächster Versuch in 1,5 s.
      return;
    }

    useSessionStore.setState((current) => {
      const byLocalId = new Map(pending.map((e, i) => [e.localId, data[i]?.id]));
      const events = current.events.map((e) =>
        byLocalId.has(e.localId)
          ? { ...e, id: byLocalId.get(e.localId), persisted: true }
          : e,
      );
      return { events, pendingCount: events.filter((e) => !e.persisted).length };
    });
  } finally {
    flushing = false;
  }
}

function resolveCorrectsId(event: LocalEvent, all: LocalEvent[]): number | null {
  if (event.correctsEventId) return event.correctsEventId;
  const localRef = (event as LocalEvent & { correctsLocalId?: number }).correctsLocalId;
  if (localRef === undefined) return null;
  return all.find((e) => e.localId === localRef)?.id ?? null;
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
