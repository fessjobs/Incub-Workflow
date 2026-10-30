import { useEffect, useMemo, useRef, useState } from 'react';
import type { GamePlayProps } from '../types';
import { Dartboard } from '../_dart/Dartboard';
import { segmentLabel, type Segment } from '../_dart/segments';
import type { DartClockConfig } from './config';

type Mode = 'board' | 'quick';

/**
 * Der Live-Screen.
 *
 * Gebaut für die Bedienung mit dem Daumen, neben der Scheibe, bei
 * Partyraumlicht: Zielzahl riesig, Countdown aus 2,5 m lesbar, nichts zum
 * Scrollen. Die Eingabe ist das Tap-Board (Entscheidung vom 30.10.), der
 * Treffer/Daneben-Modus ist die schnelle Alternative ohne Abweichungsdaten.
 */
export function DartClockPlay({
  config,
  events,
  append,
  correct,
  elapsedMs,
  finish,
  players,
  activePlayerId,
  setActivePlayer,
}: GamePlayProps<DartClockConfig>) {
  const [mode, setMode] = useState<Mode>('board');
  const [correcting, setCorrecting] = useState<number | null>(null);
  const runStartedRef = useRef(false);

  const me = activePlayerId;
  const playerIndex = players.findIndex((p) => p.id === me);
  const isLastPlayer = playerIndex === players.length - 1;

  /** Nur die Events des aktuellen Durchgangs. */
  const runStartMs = useMemo(() => {
    const starts = events.filter((e) => e.type === 'run_start' && e.playerId === me);
    return starts.length > 0 ? starts[starts.length - 1].tMs : null;
  }, [events, me]);

  const myThrows = useMemo(
    () =>
      events.filter(
        (e) =>
          e.type === 'throw' &&
          e.playerId === me &&
          runStartMs !== null &&
          e.tMs >= runStartMs &&
          // Korrigierte Würfe nicht doppelt zählen.
          !events.some((other) => other.correctsEventId === e.id && e.id !== undefined),
      ),
    [events, me, runStartMs],
  );

  const hits = myThrows.filter((e) => {
    const p = e.payload as { target?: number; hit?: { number?: number } | null };
    return p.hit?.number !== undefined && p.hit.number === p.target;
  });

  const target = Math.min(hits.length + 1, config.highestTarget);
  const done = hits.length >= config.highestTarget;
  const arrowsThrown = myThrows.length % config.arrowsPerRound;
  const retrieving =
    myThrows.length > 0 && arrowsThrown === 0 && !done;

  const runElapsed = runStartMs === null ? 0 : Math.max(0, elapsedMs - runStartMs);
  const remainingMs = Math.max(0, config.timeLimitSec * 1000 - runElapsed);
  const timeUp = remainingMs === 0;

  // Der Durchgang des aktuellen Spielers beginnt beim ersten Rendern.
  useEffect(() => {
    if (runStartedRef.current || !me) return;
    runStartedRef.current = true;
    append({ type: 'run_start', source: 'system', payload: { playerId: me } });
  }, [append, me]);

  // Ziehphase protokollieren, sobald der letzte Pfeil einer Runde liegt.
  const retrievalLogged = useRef(false);
  useEffect(() => {
    if (retrieving && !retrievalLogged.current) {
      retrievalLogged.current = true;
      append({ type: 'retrieval_start', source: 'system' });
    }
  }, [retrieving, append]);

  // Zeit abgelaufen oder durchgespielt: Durchgang schließen.
  const runEndedRef = useRef(false);
  useEffect(() => {
    if (runEndedRef.current) return;
    if (!timeUp && !done) return;
    runEndedRef.current = true;
    append({
      type: 'run_end',
      source: 'system',
      payload: { reason: done ? 'completed' : 'time' },
    });
  }, [timeUp, done, append]);

  function record(segment: Segment | null) {
    if (timeUp || done) return;

    // Der erste Wurf nach dem Ziehen beendet die Ziehphase.
    if (retrieving) {
      append({ type: 'retrieval_end', source: 'system' });
      retrievalLogged.current = false;
    }

    append({
      type: 'throw',
      source: mode === 'board' ? 'tap' : 'quick',
      payload: {
        target,
        hit: segment ? { number: segment.number, ring: segment.ring } : null,
      },
    });
  }

  function recordQuick(isHit: boolean) {
    if (timeUp || done) return;
    if (retrieving) {
      append({ type: 'retrieval_end', source: 'system' });
      retrievalLogged.current = false;
    }
    append({
      type: 'throw',
      source: 'quick',
      payload: {
        target,
        // Treffer ohne Feldangabe: die Zielzahl ist bekannt, der Ring nicht.
        hit: isHit ? { number: target, ring: null } : null,
      },
    });
  }

  function applyCorrection(eventId: number | undefined, number: number | null) {
    const original = myThrows.find((e) => e.id === eventId || e.localId === eventId);
    const originalTarget = (original?.payload as { target?: number })?.target ?? target;
    correct(eventId, {
      type: 'throw',
      source: 'manual',
      payload: {
        target: originalTarget,
        hit: number === null ? null : { number, ring: null },
      },
    });
    setCorrecting(null);
  }

  function nextPlayer() {
    const next = players[playerIndex + 1];
    if (!next) return;
    runStartedRef.current = false;
    runEndedRef.current = false;
    retrievalLogged.current = false;
    setActivePlayer(next.id);
  }

  const chips = myThrows.slice(-8);

  return (
    <div className="flex min-h-dvh flex-col gap-2 pb-2">
      {/* Kopfzeile: Uhr und Pfeilzähler */}
      <div className="flex items-baseline justify-between">
        <span
          className={[
            'font-bold tabular-nums leading-none tracking-tight',
            remainingMs <= 20_000 ? 'text-bad' : 'text-slate-100',
          ].join(' ')}
          style={{ fontSize: 'clamp(2.5rem, 13vw, 4rem)' }}
        >
          {formatClock(remainingMs)}
        </span>
        <span className="text-sm uppercase tracking-widest text-slate-400">
          Pfeil {arrowsThrown} / {config.arrowsPerRound}
        </span>
      </div>

      {players.length > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="truncate text-accent">
            {players[playerIndex]?.displayName ?? '—'}
          </span>
          <span className="text-slate-500">
            Spieler {playerIndex + 1} / {players.length}
          </span>
        </div>
      )}

      {/* Zielzahl */}
      <div className="flex flex-col items-center justify-center py-1">
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Ziel</span>
        <span
          className="font-extrabold leading-[0.85] tracking-tighter tabular-nums"
          style={{ fontSize: 'clamp(4.5rem, 26vw, 9rem)' }}
        >
          {done ? '✓' : target}
        </span>
      </div>

      {/* Fortschritt 1 bis 20 */}
      <div className="grid grid-cols-20 gap-[2px]" style={{ gridTemplateColumns: 'repeat(20, 1fr)' }}>
        {Array.from({ length: config.highestTarget }, (_, i) => (
          <span
            key={i}
            className={[
              'h-2 rounded-sm',
              i < hits.length ? 'bg-good' : i === hits.length ? 'bg-accent' : 'bg-surface-border',
            ].join(' ')}
          />
        ))}
      </div>

      {retrieving && (
        <div className="rounded-xl bg-warn px-4 py-2 text-center font-bold text-surface">
          Pfeile ziehen
        </div>
      )}

      {/* Eingabe */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {timeUp || done ? (
          <div className="text-center">
            <p className="text-2xl font-bold">{done ? 'Durchgespielt!' : 'Zeit abgelaufen'}</p>
            <p className="mt-1 text-slate-400">
              {hits.length} von {config.highestTarget} Zahlen
            </p>
          </div>
        ) : mode === 'board' ? (
          <Dartboard
            onHit={record}
            highlightNumber={target}
            className="mx-auto w-full max-w-[min(96vw,28rem)]"
          />
        ) : (
          <div className="grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => recordQuick(true)}
              className="rounded-2xl bg-good py-12 text-2xl font-bold text-surface"
            >
              Treffer
            </button>
            <button
              type="button"
              onClick={() => recordQuick(false)}
              className="rounded-2xl bg-surface-raised py-12 text-2xl font-bold text-slate-300"
            >
              Daneben
            </button>
          </div>
        )}
      </div>

      {/* Erkannte Würfe als Chips, jeder antippbar zum Korrigieren */}
      {chips.length > 0 && !timeUp && !done && (
        <div className="flex flex-wrap gap-1">
          {chips.map((e) => {
            const p = e.payload as { target?: number; hit?: { number?: number } | null };
            const isHit = p.hit?.number !== undefined && p.hit.number === p.target;
            const id = e.id ?? (e as { localId?: number }).localId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCorrecting(correcting === id ? null : (id ?? null))}
                className={[
                  'rounded-lg px-2 py-1 text-sm tabular-nums',
                  isHit ? 'bg-good text-surface' : 'bg-surface-raised text-slate-300',
                ].join(' ')}
              >
                {p.hit?.number ?? '–'}
              </button>
            );
          })}
        </div>
      )}

      {correcting !== null && (
        <div className="rounded-xl border border-surface-border bg-surface-raised p-2">
          <p className="mb-2 text-xs text-slate-400">Wurf korrigieren</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => applyCorrection(correcting, n)}
                className="rounded-lg bg-surface-overlay py-2 text-sm tabular-nums"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyCorrection(correcting, null)}
              className="col-span-2 rounded-lg bg-surface-overlay py-2 text-sm"
            >
              daneben
            </button>
          </div>
        </div>
      )}

      {/* Fußzeile */}
      <div className="flex gap-2">
        {!timeUp && !done && (
          <button
            type="button"
            onClick={() => setMode(mode === 'board' ? 'quick' : 'board')}
            className="flex-1 rounded-xl border border-surface-border py-3 text-sm font-semibold"
          >
            {mode === 'board' ? 'Schnellmodus' : 'Board'}
          </button>
        )}

        {(timeUp || done) && !isLastPlayer ? (
          <button
            type="button"
            onClick={nextPlayer}
            className="flex-1 rounded-xl bg-accent py-3 text-base font-bold text-surface"
          >
            Weiter: {players[playerIndex + 1]?.displayName}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className={[
              'flex-1 rounded-xl py-3 text-sm font-semibold',
              timeUp || done
                ? 'bg-accent text-surface'
                : 'border border-surface-border text-slate-300',
            ].join(' ')}
          >
            {timeUp || done ? 'Zur Auswertung' : 'Abbrechen'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Nur der Vollständigkeit halber exportiert – erleichtert Tests. */
export { segmentLabel };
