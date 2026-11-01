import { z } from 'zod';
import type { GameEvent, StatsContext, StatsResult } from '../types';
import { orderedThrows, groupIntoTurns } from '../_dart/turns';
import { segmentScore, type Segment } from '../_dart/segments';

export const shanghaiConfigSchema = z.object({
  /** Bis zu welcher Zahl gespielt wird. Klassisch 7, lang 20. */
  rounds: z.number().int().min(3).max(20),
  /** Beendet Single + Double + Triple der Zielzahl das Spiel sofort? */
  shanghaiWins: z.boolean(),
  dartsPerTurn: z.number().int().min(3).max(3),
});

export type ShanghaiConfig = z.infer<typeof shanghaiConfigSchema>;

export const defaultShanghaiConfig: ShanghaiConfig = {
  rounds: 7,
  shanghaiWins: true,
  dartsPerTurn: 3,
};

export interface ShanghaiRound {
  round: number;
  target: number;
  scored: number;
  hits: number;
  /** Single, Double und Triple der Zielzahl in einer Runde. */
  shanghai: boolean;
}

export interface ShanghaiPlayerState {
  playerId: string;
  rounds: ShanghaiRound[];
  total: number;
  dartsThrown: number;
  shanghaiRound: number | null;
}

function evaluateRound(target: number, darts: Array<Segment | null>): ShanghaiRound {
  let scored = 0;
  let hits = 0;
  const rings = new Set<string>();

  for (const seg of darts) {
    if (!seg || seg.number !== target) continue;
    // Bull zählt bei Shanghai nicht, es geht nur um die Zielzahl.
    if (seg.ring === 'bull' || seg.ring === 'bullseye') continue;
    hits += 1;
    scored += segmentScore(seg);
    rings.add(seg.ring === 'single-inner' || seg.ring === 'single-outer' ? 'single' : seg.ring);
  }

  return {
    round: target,
    target,
    scored,
    hits,
    shanghai: rings.has('single') && rings.has('double') && rings.has('triple'),
  };
}

export function buildShanghaiStates(
  events: GameEvent[],
  config: ShanghaiConfig,
  playerIds: string[],
): Record<string, ShanghaiPlayerState> {
  const all = orderedThrows(events);
  const states: Record<string, ShanghaiPlayerState> = {};

  for (const playerId of playerIds) {
    const mine = all.filter((t) => t.playerId === playerId);
    const rounds: ShanghaiRound[] = [];
    let shanghaiRound: number | null = null;

    groupIntoTurns(mine, config.dartsPerTurn).forEach((turn, i) => {
      if (i >= config.rounds) return;
      const result = evaluateRound(i + 1, turn.map((t) => t.segment));
      rounds.push(result);
      if (result.shanghai && shanghaiRound === null) shanghaiRound = i + 1;
    });

    states[playerId] = {
      playerId,
      rounds,
      total: rounds.reduce((sum, r) => sum + r.scored, 0),
      dartsThrown: mine.length,
      shanghaiRound,
    };
  }

  return states;
}

/** Welche Zielzahl ist dieser Spieler gerade dran? */
export function currentTarget(
  state: ShanghaiPlayerState | undefined,
  config: ShanghaiConfig,
  openDarts: number,
): number {
  const completed = state ? Math.floor((state.dartsThrown - openDarts) / config.dartsPerTurn) : 0;
  return Math.min(completed + 1, config.rounds);
}

export function computeShanghaiStats(
  events: GameEvent[],
  config: ShanghaiConfig,
  ctx: StatsContext,
): StatsResult {
  const playerIds = ctx.players.length > 0 ? ctx.players.map((p) => p.id) : ctx.playerId ? [ctx.playerId] : [];
  const states = buildShanghaiStates(events, config, playerIds);
  const me = ctx.playerId ? states[ctx.playerId] : undefined;

  if (!me || me.dartsThrown === 0) {
    return {
      metrics: { total: 0, dartsThrown: 0, hitRate: 0, shanghai: 0, roundsPlayed: 0 },
      headline: 'Keine Würfe aufgezeichnet',
      insights: ['Keine Würfe aufgezeichnet.'],
      detail: { rounds: [] },
    };
  }

  const hits = me.rounds.reduce((sum, r) => sum + r.hits, 0);
  const hitRate = me.dartsThrown > 0 ? hits / me.dartsThrown : 0;
  const best = me.rounds.reduce<ShanghaiRound | null>(
    (b, r) => (b === null || r.scored > b.scored ? r : b),
    null,
  );
  const blanks = me.rounds.filter((r) => r.hits === 0).map((r) => r.target);

  const insights: string[] = [];
  if (me.shanghaiRound !== null) {
    insights.push(`Shanghai auf der ${me.shanghaiRound} — Single, Double und Triple in einer Runde.`);
  }
  insights.push(`${hits} von ${me.dartsThrown} Pfeilen auf der Zielzahl.`);
  if (best && best.scored > 0) insights.push(`Beste Runde: ${best.scored} Punkte auf der ${best.target}.`);
  if (blanks.length > 0) {
    insights.push(`Komplett verfehlt: ${blanks.join(', ')}.`);
  }

  return {
    metrics: {
      total: me.total,
      dartsThrown: me.dartsThrown,
      hitRate: round(hitRate, 4),
      shanghai: me.shanghaiRound !== null ? 1 : 0,
      roundsPlayed: me.rounds.length,
      bestRound: best?.scored ?? 0,
    },
    headline:
      me.shanghaiRound !== null
        ? `Shanghai auf der ${me.shanghaiRound}!`
        : `${me.total} Punkte in ${me.rounds.length} Runden`,
    insights,
    detail: { rounds: me.rounds },
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
