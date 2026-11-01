import { useMemo } from 'react';
import type { GamePlayProps, GameSetupProps, GameResultProps } from '../types';
import { DartTurnScreen, Avatar } from '../_dart/DartTurnScreen';
import { currentTurnThrows, orderedThrows } from '../_dart/turns';
import type { Segment } from '../_dart/segments';
import {
  CRICKET_NUMBERS,
  buildCricketStates,
  cricketWinner,
  marksFor,
  type CricketConfig,
} from './rules';

const MARK_SYMBOL = ['', '/', '✕', '⊗'];

export function CricketPlay({
  config,
  events,
  append,
  players,
  activePlayerId,
  setActivePlayer,
  finish,
}: GamePlayProps<CricketConfig>) {
  const playerIds = players.map((p) => p.id);
  const states = useMemo(
    () => buildCricketStates(events, config, playerIds),
    [events, config, playerIds.join()],
  );
  const all = useMemo(() => orderedThrows(events), [events]);
  const openDarts = currentTurnThrows(all, activePlayerId, config.dartsPerTurn);
  const winnerId = cricketWinner(states, config, playerIds);
  const winner = players.find((p) => p.id === winnerId);
  const me = activePlayerId ? states[activePlayerId] : undefined;

  function handleThrow(segment: Segment | null) {
    if (winnerId) return;
    append({
      type: 'throw',
      source: 'tap',
      payload: {
        segment: segment ? { number: segment.number, ring: segment.ring } : null,
        marks: marksFor(segment)?.marks ?? 0,
      },
    });
  }

  function handleUndo() {
    const mine = all.filter((t) => t.playerId === activePlayerId);
    const last = mine[mine.length - 1];
    if (!last) return;
    append({
      type: 'throw',
      source: 'manual',
      voidsTarget: true,
      payload: { voidsLocalId: last.eventId },
    });
  }

  function nextPlayer() {
    if (players.length < 2) return;
    const i = players.findIndex((p) => p.id === activePlayerId);
    setActivePlayer(players[(i + 1) % players.length].id);
  }

  const turnMarks = openDarts.reduce((sum, d) => sum + (marksFor(d.segment)?.marks ?? 0), 0);
  const turnOver = openDarts.length >= config.dartsPerTurn;

  return (
    <DartTurnScreen
      players={players}
      activePlayerId={activePlayerId}
      headline={me?.points ?? 0}
      subline={
        <>
          {config.cutthroat ? 'Cutthroat — wenig Punkte sind gut' : 'Punkte'} · diese Aufnahme{' '}
          {turnMarks} {turnMarks === 1 ? 'Mark' : 'Marks'}
        </>
      }
      dartsThisTurn={openDarts.map((t) => t.segment)}
      dartsPerTurn={config.dartsPerTurn}
      scoreboard={
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="py-1 text-left font-normal">Spieler</th>
                {CRICKET_NUMBERS.map((n) => (
                  <th key={n} className="py-1 font-normal">
                    {n === 25 ? 'B' : n}
                  </th>
                ))}
                <th className="py-1 font-normal">Pkt</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const s = states[p.id];
                return (
                  <tr
                    key={p.id}
                    className={p.id === activePlayerId ? 'bg-surface-raised' : undefined}
                  >
                    <td className="py-1 text-left">
                      <span className="flex items-center gap-1.5">
                        <Avatar player={p} size={18} />
                        <span className="max-w-[5rem] truncate text-xs">{p.displayName}</span>
                      </span>
                    </td>
                    {CRICKET_NUMBERS.map((n) => (
                      <td
                        key={n}
                        className={s?.marks[n] >= 3 ? 'py-1 text-good' : 'py-1 text-slate-400'}
                      >
                        {MARK_SYMBOL[Math.min(3, s?.marks[n] ?? 0)] || '·'}
                      </td>
                    ))}
                    <td className="py-1 font-semibold">{s?.points ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
      onThrow={handleThrow}
      onUndo={handleUndo}
      canUndo={all.some((t) => t.playerId === activePlayerId)}
      onEndTurn={turnOver && players.length > 1 && !winnerId ? nextPlayer : undefined}
      finished={Boolean(winnerId)}
      finishedNote={
        winner ? (
          <>
            <p className="text-2xl font-bold">{winner.displayName} gewinnt</p>
            <p className="mt-1 text-slate-400">{states[winner.id]?.points} Punkte</p>
          </>
        ) : null
      }
      onFinish={finish}
    />
  );
}

export function CricketSetup({
  config,
  onConfigChange,
  onStart,
  starting,
}: GameSetupProps<CricketConfig>) {
  return (
    <div className="space-y-6">
      <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-raised p-4">
        <span>
          <span className="block font-semibold">Cutthroat</span>
          <span className="block text-sm text-slate-400">
            Punkte gehen an die Gegner. Es gewinnt, wer am Ende am wenigsten hat.
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.cutthroat}
          onChange={(e) => onConfigChange({ ...config, cutthroat: e.target.checked })}
          className="h-6 w-6 shrink-0 accent-accent"
        />
      </label>

      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-surface disabled:opacity-50"
      >
        {starting ? 'Session wird angelegt …' : 'Los'}
      </button>

      <p className="text-sm text-slate-500">
        Gespielt wird um 20 bis 15 und Bull. Drei Marks machen eine Zahl zu;
        Triple zählt drei, Double zwei, Bullseye zwei.
      </p>
    </div>
  );
}

export function CricketResult({ stats }: GameResultProps<CricketConfig>) {
  const marks = (stats.detail.marks as Record<number, number> | undefined) ?? {};

  return (
    <div className="space-y-6">
      <p className="text-xl font-semibold">{stats.headline}</p>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Marks pro Runde" value={stats.metrics.marksPerRound.toFixed(2)} />
        <Tile label="Punkte" value={String(stats.metrics.points)} />
        <Tile label="Zahlen zu" value={`${stats.metrics.closedNumbers} / 7`} />
        <Tile label="Pfeile" value={String(stats.metrics.dartsThrown)} />
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Marks je Zahl</h2>
        <ul className="space-y-1">
          {CRICKET_NUMBERS.map((n) => (
            <li key={n} className="flex items-center gap-3">
              <span className="w-8 text-right text-sm tabular-nums text-slate-400">
                {n === 25 ? 'Bull' : n}
              </span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={[
                      'h-4 w-4 rounded-sm',
                      (marks[n] ?? 0) > i ? 'bg-good' : 'bg-surface-raised',
                    ].join(' ')}
                  />
                ))}
              </span>
              {(marks[n] ?? 0) > 3 && (
                <span className="text-xs text-slate-500">+{marks[n] - 3} Punkte-Marks</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {stats.insights.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-400">
          {stats.insights.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
