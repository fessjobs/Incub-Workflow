import { z } from 'zod';
import type { GameEvent, StatsContext, StatsResult } from '../types';
import { orderedThrows, groupIntoTurns } from '../_dart/turns';
import type { Segment } from '../_dart/segments';

export const cricketConfigSchema = z.object({
  /**
   * Cutthroat: Punkte gehen an die Gegner statt an einen selbst, und es
   * gewinnt, wer am Ende am wenigsten hat.
   */
  cutthroat: z.boolean(),
  dartsPerTurn: z.number().int().min(1).max(6),
});

export type CricketConfig = z.infer<typeof cricketConfigSchema>;

export const defaultCricketConfig: CricketConfig = {
  cutthroat: false,
  dartsPerTurn: 3,
};

/** Die Zahlen, um die bei Cricket gespielt wird. 25 steht für Bull. */
export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;
export type CricketNumber = (typeof CRICKET_NUMBERS)[number];

/** Wie viele Marks bringt ein Feld? Triple drei, Double zwei, sonst eins. */
export function marksFor(segment: Segment | null): { number: CricketNumber; marks: number } | null {
  if (!segment) return null;

  if (segment.ring === 'bullseye') return { number: 25, marks: 2 };
  if (segment.ring === 'bull') return { number: 25, marks: 1 };

  const n = segment.number as CricketNumber;
  if (!CRICKET_NUMBERS.includes(n)) return null;

  if (segment.ring === 'triple') return { number: n, marks: 3 };
  if (segment.ring === 'double') return { number: n, marks: 2 };
  return { number: n, marks: 1 };
}

export interface CricketPlayerState {
  playerId: string;
  /** Marks je Zahl, bei 3 ist die Zahl zu. */
  marks: Record<number, number>;
  points: number;
  closedAll: boolean;
  dartsThrown: number;
  totalMarks: number;
}

/**
 * Spielstand aus dem Log.
 *
 * Regel: Punkte gibt es nur für Marks auf einer Zahl, die man selbst zu hat
 * und mindestens ein Gegner noch offen. Bei Cutthroat gehen diese Punkte an
 * alle Gegner, die die Zahl noch offen haben.
 */
export function buildCricketStates(
  events: GameEvent[],
  config: CricketConfig,
  playerIds: string[],
): Record<string, CricketPlayerState> {
  const states: Record<string, CricketPlayerState> = {};
  for (const id of playerIds) {
    states[id] = {
      playerId: id,
      marks: Object.fromEntries(CRICKET_NUMBERS.map((n) => [n, 0])),
      points: 0,
      closedAll: false,
      dartsThrown: 0,
      totalMarks: 0,
    };
  }

  // Chronologisch über alle Spieler hinweg – der Reihenfolge nach, weil es
  // darauf ankommt, wer eine Zahl zuerst zumacht.
  for (const dart of orderedThrows(events)) {
    const state = dart.playerId ? states[dart.playerId] : undefined;
    if (!state) continue;
    state.dartsThrown += 1;

    const hit = marksFor(dart.segment);
    if (!hit) continue;

    let left = hit.marks;
    const open = 3 - state.marks[hit.number];
    const toClose = Math.min(open, left);
    state.marks[hit.number] += toClose;
    state.totalMarks += toClose;
    left -= toClose;

    // Überzählige Marks auf einer zugemachten Zahl bringen Punkte.
    if (left > 0 && state.marks[hit.number] >= 3) {
      const opponents = playerIds.filter(
        (id) => id !== state.playerId && states[id].marks[hit.number] < 3,
      );
      if (opponents.length > 0) {
        const value = hit.number * left;
        if (config.cutthroat) {
          for (const id of opponents) states[id].points += value;
        } else {
          state.points += value;
        }
      }
    }
  }

  for (const id of playerIds) {
    states[id].closedAll = CRICKET_NUMBERS.every((n) => states[id].marks[n] >= 3);
  }

  return states;
}

/** Hat jemand gewonnen? Alle Zahlen zu und die beste Punktzahl. */
export function cricketWinner(
  states: Record<string, CricketPlayerState>,
  config: CricketConfig,
  playerIds: string[],
): string | null {
  const done = playerIds.filter((id) => states[id].closedAll);
  if (done.length === 0) return null;

  const others = playerIds.filter((id) => id !== done[0]);
  const best = done[0];
  const ok = others.every((id) =>
    config.cutthroat ? states[best].points <= states[id].points : states[best].points >= states[id].points,
  );
  return ok ? best : null;
}

export function computeCricketStats(
  events: GameEvent[],
  config: CricketConfig,
  ctx: StatsContext,
): StatsResult {
  const playerIds = ctx.players.length > 0 ? ctx.players.map((p) => p.id) : ctx.playerId ? [ctx.playerId] : [];
  const states = buildCricketStates(events, config, playerIds);
  const me = ctx.playerId ? states[ctx.playerId] : undefined;

  if (!me || me.dartsThrown === 0) {
    return {
      metrics: { dartsThrown: 0, marksPerRound: 0, points: 0, closedNumbers: 0, won: 0 },
      headline: 'Keine Würfe aufgezeichnet',
      insights: ['Keine Würfe aufgezeichnet.'],
      detail: { marks: {} },
    };
  }

  const rounds = Math.max(1, Math.ceil(me.dartsThrown / config.dartsPerTurn));
  const mpr = me.totalMarks / rounds;
  const closed = CRICKET_NUMBERS.filter((n) => me.marks[n] >= 3).length;
  const winner = cricketWinner(states, config, playerIds);

  const mine = orderedThrows(events).filter((t) => t.playerId === ctx.playerId);
  const perTurnMarks = groupIntoTurns(mine, config.dartsPerTurn).map((turn) =>
    turn.reduce((sum, d) => sum + (marksFor(d.segment)?.marks ?? 0), 0),
  );

  const insights: string[] = [];
  insights.push(`${closed} von 7 Zahlen zugemacht.`);
  if (mpr >= 2) insights.push(`${mpr.toFixed(2)} Marks pro Runde — solides Scoring.`);
  if (winner === ctx.playerId) insights.push('Spiel gewonnen.');
  const weakest = CRICKET_NUMBERS.filter((n) => me.marks[n] === 0);
  if (weakest.length > 0 && weakest.length < 7) {
    insights.push(
      `Noch gar nicht getroffen: ${weakest.map((n) => (n === 25 ? 'Bull' : n)).join(', ')}.`,
    );
  }

  return {
    metrics: {
      dartsThrown: me.dartsThrown,
      marksPerRound: round(mpr, 2),
      totalMarks: me.totalMarks,
      points: me.points,
      closedNumbers: closed,
      won: winner === ctx.playerId ? 1 : 0,
    },
    headline: winner === ctx.playerId
      ? `Gewonnen mit ${me.points} Punkten`
      : `${closed}/7 zu, ${me.points} Punkte`,
    insights,
    detail: { marks: me.marks, perTurnMarks, cutthroat: config.cutthroat },
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
