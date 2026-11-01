import { useMemo } from 'react';
import type { GamePlayProps, GameSetupProps, GameResultProps } from '../types';
import { DartTurnScreen, Avatar } from '../_dart/DartTurnScreen';
import { currentTurnThrows, orderedThrows } from '../_dart/turns';
import { segmentScore, type Segment } from '../_dart/segments';
import {
  buildShanghaiStates,
  currentTarget,
  type ShanghaiConfig,
  type ShanghaiRound,
} from './rules';

export function ShanghaiPlay({
  config,
  events,
  append,
  players,
  activePlayerId,
  setActivePlayer,
  finish,
}: GamePlayProps<ShanghaiConfig>) {
  const playerIds = players.map((p) => p.id);
  const states = useMemo(
    () => buildShanghaiStates(events, config, playerIds),
    [events, config, playerIds.join()],
  );
  const all = useMemo(() => orderedThrows(events), [events]);
  const openDarts = currentTurnThrows(all, activePlayerId, config.dartsPerTurn);
  const me = activePlayerId ? states[activePlayerId] : undefined;
  const target = currentTarget(me, config, openDarts.length);

  const shanghaiHit = config.shanghaiWins && me?.shanghaiRound != null;
  const allDone = players.every(
    (p) => (states[p.id]?.rounds.length ?? 0) >= config.rounds,
  );
  const over = shanghaiHit || allDone;

  function handleThrow(segment: Segment | null) {
    if (over) return;
    append({
      type: 'throw',
      source: 'tap',
      payload: {
        segment: segment ? { number: segment.number, ring: segment.ring } : null,
        target,
        value: segment && segment.number === target ? segmentScore(segment) : 0,
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

  const turnScore = openDarts.reduce(
    (sum, d) => sum + (d.segment && d.segment.number === target ? segmentScore(d.segment) : 0),
    0,
  );
  const leader = [...players].sort(
    (a, b) => (states[b.id]?.total ?? 0) - (states[a.id]?.total ?? 0),
  )[0];

  return (
    <DartTurnScreen
      players={players}
      activePlayerId={activePlayerId}
      headline={target}
      subline={
        <>
          {/* Die Rundennummer ist bei Shanghai dieselbe wie die Zielzahl –
              sie darf nicht getrennt gerechnet werden, sonst laufen sie
              auseinander. */}
          Runde {target} von {config.rounds} · diese Runde {turnScore} Punkte · gesamt{' '}
          {me?.total ?? 0}
        </>
      }
      dartsThisTurn={openDarts.map((t) => t.segment)}
      dartsPerTurn={config.dartsPerTurn}
      highlightNumber={target}
      scoreboard={
        players.length > 1 ? (
          <ul className="space-y-1">
            {players.map((p) => (
              <li
                key={p.id}
                className={[
                  'flex items-center gap-2 rounded-lg px-2 py-1 text-sm',
                  p.id === activePlayerId ? 'bg-surface-raised' : '',
                ].join(' ')}
              >
                <Avatar player={p} size={22} />
                <span className="flex-1 truncate">{p.displayName}</span>
                <span className="text-xs text-slate-500">
                  R{states[p.id]?.rounds.length ?? 0}
                </span>
                <span className="w-10 text-right font-semibold tabular-nums">
                  {states[p.id]?.total ?? 0}
                </span>
              </li>
            ))}
          </ul>
        ) : null
      }
      onThrow={handleThrow}
      onUndo={handleUndo}
      canUndo={all.some((t) => t.playerId === activePlayerId)}
      onEndTurn={
        openDarts.length >= config.dartsPerTurn && players.length > 1 && !over
          ? nextPlayer
          : undefined
      }
      finished={over}
      finishedNote={
        <>
          <p className="text-2xl font-bold">
            {shanghaiHit ? 'Shanghai!' : `${leader?.displayName} führt`}
          </p>
          <p className="mt-1 text-slate-400">
            {shanghaiHit
              ? `${players.find((p) => states[p.id]?.shanghaiRound != null)?.displayName} beendet das Spiel sofort`
              : `${states[leader?.id ?? '']?.total ?? 0} Punkte`}
          </p>
        </>
      }
      onFinish={finish}
    />
  );
}

export function ShanghaiSetup({
  config,
  onConfigChange,
  onStart,
  starting,
}: GameSetupProps<ShanghaiConfig>) {
  return (
    <div className="space-y-6">
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Bis zur Zahl</span>
        <input
          type="range"
          min={3}
          max={20}
          value={config.rounds}
          onChange={(e) => onConfigChange({ ...config, rounds: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <span className="mt-1 block text-2xl font-semibold tabular-nums">{config.rounds}</span>
      </label>

      <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-raised p-4">
        <span>
          <span className="block font-semibold">Shanghai beendet sofort</span>
          <span className="block text-sm text-slate-400">
            Single, Double und Triple der Zielzahl in einer Runde gewinnt auf der Stelle.
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.shanghaiWins}
          onChange={(e) => onConfigChange({ ...config, shanghaiWins: e.target.checked })}
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
    </div>
  );
}

export function ShanghaiResult({ stats }: GameResultProps<ShanghaiConfig>) {
  const rounds = (stats.detail.rounds as ShanghaiRound[] | undefined) ?? [];
  const max = Math.max(1, ...rounds.map((r) => r.scored));

  return (
    <div className="space-y-6">
      <p className="text-xl font-semibold">{stats.headline}</p>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Punkte" value={String(stats.metrics.total)} />
        <Tile label="Trefferquote" value={`${Math.round(stats.metrics.hitRate * 100)} %`} />
        <Tile label="Beste Runde" value={String(stats.metrics.bestRound)} />
        <Tile label="Runden" value={String(stats.metrics.roundsPlayed)} />
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Punkte je Runde</h2>
        <ul className="space-y-1">
          {rounds.map((r) => (
            <li key={r.round} className="flex items-center gap-3">
              <span className="w-6 text-right text-sm tabular-nums text-slate-500">{r.target}</span>
              <span className="h-5 flex-1 rounded bg-surface-raised">
                <span
                  className="block h-full rounded"
                  style={{
                    width: `${(r.scored / max) * 100}%`,
                    background: r.shanghai ? '#F59E0B' : r.scored === 0 ? '#E11D48' : '#0891B2',
                  }}
                />
              </span>
              <span className="w-8 text-right text-sm tabular-nums">{r.scored}</span>
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
