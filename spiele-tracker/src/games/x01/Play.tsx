import { useMemo } from 'react';
import type { GamePlayProps } from '../types';
import { DartTurnScreen, Avatar } from '../_dart/DartTurnScreen';
import { currentTurnThrows, orderedThrows } from '../_dart/turns';
import { segmentScore, type Segment } from '../_dart/segments';
import { buildStates, playTurn } from './rules';
import type { X01Config } from './config';

/**
 * Der Spielstand wird bei jedem Rendern aus dem Log neu gerechnet. Bei ein
 * paar hundert Würfen ist das billig, und dafür kann nichts auseinanderlaufen –
 * "Zurück" stellt den richtigen Stand automatisch wieder her.
 */
export function X01Play({
  config,
  events,
  append,
  players,
  activePlayerId,
  setActivePlayer,
  finish,
}: GamePlayProps<X01Config>) {
  const playerIds = players.map((p) => p.id);
  const states = useMemo(
    () => buildStates(events, config, playerIds),
    [events, config, playerIds.join()],
  );

  const all = useMemo(() => orderedThrows(events), [events]);
  const openDarts = currentTurnThrows(all, activePlayerId, config.dartsPerTurn);

  const me = activePlayerId ? states[activePlayerId] : undefined;
  const scoreBeforeTurn = useMemo(() => {
    if (!me) return config.startScore;
    const completed = Math.floor((me.dartsThrown - openDarts.length) / config.dartsPerTurn);
    const done = me.turns.slice(0, completed);
    return done.length > 0 ? done[done.length - 1].after : config.startScore;
  }, [me, openDarts.length, config]);

  const open = playTurn(scoreBeforeTurn, openDarts, config);
  const winner = players.find((p) => states[p.id]?.finished);
  const turnOver =
    open.bust || open.checkout || openDarts.length >= config.dartsPerTurn;

  function handleThrow(segment: Segment | null) {
    if (winner) return;
    append({
      type: 'throw',
      source: 'tap',
      payload: {
        segment: segment ? { number: segment.number, ring: segment.ring } : null,
        value: segment ? segmentScore(segment) : 0,
      },
    });
  }

  function handleUndo() {
    const mine = all.filter((t) => t.playerId === activePlayerId);
    const last = mine[mine.length - 1];
    if (!last) return;
    // Append-only: der Wurf wird nicht gelöscht, sondern gestrichen.
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

  const remaining = open.bust ? scoreBeforeTurn : open.after;

  return (
    <DartTurnScreen
      players={players}
      activePlayerId={activePlayerId}
      headline={open.checkout ? '0' : remaining}
      subline={
        open.bust ? (
          <span className="font-semibold text-bad">Bust — Aufnahme zählt nicht</span>
        ) : open.checkout ? (
          <span className="font-semibold text-good">Ausgecheckt!</span>
        ) : (
          <>
            {checkoutHint(remaining, config)} · Aufnahme {open.scored}
          </>
        )
      }
      dartsThisTurn={openDarts.map((t) => t.segment)}
      dartsPerTurn={config.dartsPerTurn}
      scoreboard={
        players.length > 1 ? (
          <ul className="space-y-1">
            {players.map((p) => {
              const s = states[p.id];
              return (
                <li
                  key={p.id}
                  className={[
                    'flex items-center gap-2 rounded-lg px-2 py-1 text-sm',
                    p.id === activePlayerId ? 'bg-surface-raised' : '',
                  ].join(' ')}
                >
                  <Avatar player={p} size={22} />
                  <span className="flex-1 truncate">{p.displayName}</span>
                  <span className="tabular-nums text-slate-400">
                    Ø {s ? averageOf(s, config) : '–'}
                  </span>
                  <span className="w-12 text-right font-semibold tabular-nums">
                    {s?.remaining ?? config.startScore}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null
      }
      onThrow={handleThrow}
      onUndo={handleUndo}
      canUndo={all.some((t) => t.playerId === activePlayerId)}
      onEndTurn={turnOver && players.length > 1 && !winner ? nextPlayer : undefined}
      finished={Boolean(winner)}
      finishedNote={
        winner ? (
          <>
            <p className="text-2xl font-bold">{winner.displayName} gewinnt</p>
            <p className="mt-1 text-slate-400">
              {states[winner.id]?.dartsToFinish} Pfeile
            </p>
          </>
        ) : null
      }
      onFinish={finish}
    />
  );
}

function averageOf(
  state: ReturnType<typeof buildStates>[string],
  config: X01Config,
): string {
  if (state.dartsThrown === 0) return '–';
  const scored = config.startScore - state.remaining;
  return ((scored / state.dartsThrown) * 3).toFixed(0);
}

/** Ein kurzer Finish-Hinweis für die üblichen Reste. */
function checkoutHint(remaining: number, config: X01Config): string {
  if (!config.doubleOut) return `${remaining} übrig`;
  if (remaining > 170) return `${remaining} übrig`;
  if (remaining % 2 === 0 && remaining <= 40) return `Finish: D${remaining / 2}`;
  const known: Record<number, string> = {
    170: 'T20 T20 Bull',
    167: 'T20 T19 Bull',
    164: 'T20 T18 Bull',
    161: 'T20 T17 Bull',
    160: 'T20 T20 D20',
    100: 'T20 D20',
    81: 'T19 D12',
    60: '20 D20',
    50: 'Bull',
  };
  return known[remaining] ? `Finish: ${known[remaining]}` : `${remaining} übrig`;
}
