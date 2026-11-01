import type { ReactNode } from 'react';
import { Dartboard } from './Dartboard';
import { segmentLabel, type Segment } from './segments';
import type { SessionPlayer } from '../types';

/**
 * Geteilter Live-Screen für die Aufnahme-Spiele (501, Cricket, Shanghai).
 *
 * Gleiche Anordnung bei allen drei Spielen: oben wer dran ist, in der Mitte
 * die eine Zahl, auf die es ankommt, darunter die Scheibe. Das Spiel liefert
 * nur, was in der Mitte steht und was als Tabelle darunter erscheint.
 */
export function DartTurnScreen({
  players,
  activePlayerId,
  headline,
  subline,
  dartsThisTurn,
  dartsPerTurn,
  scoreboard,
  highlightNumber,
  onThrow,
  onUndo,
  canUndo,
  onEndTurn,
  finished,
  finishedNote,
  onFinish,
}: {
  players: SessionPlayer[];
  activePlayerId: string | null;
  /** Die große Zahl in der Mitte. */
  headline: ReactNode;
  subline?: ReactNode;
  dartsThisTurn: Array<Segment | null>;
  dartsPerTurn: number;
  scoreboard?: ReactNode;
  highlightNumber?: number | null;
  onThrow: (segment: Segment | null) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Aufnahme vorzeitig beenden (z.B. nach Bust). */
  onEndTurn?: () => void;
  finished: boolean;
  finishedNote?: ReactNode;
  onFinish: () => void;
}) {
  const active = players.find((p) => p.id === activePlayerId);
  const index = players.findIndex((p) => p.id === activePlayerId);

  return (
    <div className="flex min-h-dvh flex-col gap-2 pb-2">
      {/* Wer ist dran */}
      <div className="flex items-center justify-between">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar player={active} />
          <span className="truncate text-lg font-semibold">{active?.displayName ?? '—'}</span>
        </span>
        {players.length > 1 && (
          <span className="shrink-0 text-xs uppercase tracking-widest text-slate-500">
            {index + 1} / {players.length}
          </span>
        )}
      </div>

      {/* Die eine wichtige Zahl */}
      <div className="flex flex-col items-center justify-center py-1">
        <span
          className="font-extrabold leading-[0.85] tracking-tighter tabular-nums"
          style={{ fontSize: 'clamp(3.5rem, 22vw, 7rem)' }}
        >
          {headline}
        </span>
        {subline && <span className="mt-1 text-sm text-slate-400">{subline}</span>}
      </div>

      {/* Pfeile dieser Aufnahme */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: dartsPerTurn }, (_, i) => {
          const dart = dartsThisTurn[i];
          const thrown = i < dartsThisTurn.length;
          return (
            <span
              key={i}
              className={[
                'min-w-[3.2rem] rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums',
                thrown
                  ? dart
                    ? 'bg-surface-overlay text-slate-100'
                    : 'bg-surface-raised text-slate-500'
                  : 'border border-dashed border-surface-border text-slate-700',
              ].join(' ')}
            >
              {thrown ? (dart ? segmentLabel(dart) : '–') : '·'}
            </span>
          );
        })}
      </div>

      {scoreboard}

      {/* Eingabe */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {finished ? (
          <div className="text-center">{finishedNote}</div>
        ) : (
          <Dartboard
            onHit={onThrow}
            highlightNumber={highlightNumber ?? null}
            className="mx-auto w-full max-w-[min(96vw,28rem)]"
          />
        )}
      </div>

      {/* Fußzeile */}
      {finished ? (
        <button
          type="button"
          onClick={onFinish}
          className="w-full rounded-xl bg-accent py-4 text-base font-bold text-surface"
        >
          Zur Auswertung
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onThrow(null)}
            className="flex-1 rounded-xl bg-surface-raised py-3 text-sm font-semibold text-slate-300"
          >
            Daneben
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-xl border border-surface-border px-4 py-3 text-sm font-semibold disabled:opacity-30"
          >
            Zurück
          </button>
          {onEndTurn && (
            <button
              type="button"
              onClick={onEndTurn}
              className="rounded-xl border border-surface-border px-4 py-3 text-sm font-semibold"
            >
              Weiter
            </button>
          )}
          <button
            type="button"
            onClick={onFinish}
            className="rounded-xl border border-surface-border px-3 py-3 text-sm text-slate-400"
          >
            Ende
          </button>
        </div>
      )}
    </div>
  );
}

/** Kleines rundes Spielerbild: Foto, sonst Emoji, sonst Initiale. */
export function Avatar({
  player,
  size = 32,
}: {
  player?: SessionPlayer | null;
  size?: number;
}) {
  if (!player) return null;
  const style = {
    width: size,
    height: size,
    background: player.color ?? '#1C242E',
    fontSize: size * 0.5,
  };

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-surface"
      style={style}
      aria-hidden
    >
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (player.emoji ?? player.displayName.charAt(0).toUpperCase())
      )}
    </span>
  );
}
