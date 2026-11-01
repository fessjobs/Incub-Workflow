import { segmentScore, type Segment } from '../_dart/segments';
import { groupIntoTurns, orderedThrows, type DartThrow } from '../_dart/turns';
import type { GameEvent, StatsContext, StatsResult } from '../types';
import type { X01Config } from './config';

/**
 * Die Regellogik von 501 — getrennt von React, damit sie testbar bleibt.
 *
 * Der ganze Spielstand wird aus dem Event-Log neu berechnet, nie nebenher
 * mitgeführt. Das ist mehr Rechenarbeit pro Wurf (ein paar Dutzend Einträge),
 * dafür kann der Zustand nicht auseinanderlaufen — und ein zurückgenommener
 * Wurf stellt automatisch den richtigen Punktestand wieder her.
 */

export interface TurnOutcome {
  /** Punktestand vor der Aufnahme. */
  before: number;
  /** Punktestand danach. */
  after: number;
  /** Summe der geworfenen Punkte (0 bei Bust). */
  scored: number;
  bust: boolean;
  /** Die Aufnahme hat das Spiel beendet. */
  checkout: boolean;
  /** Tatsächlich geworfene Pfeile, inklusive dem, der bustete oder auscheckte. */
  dartsUsed: number;
  darts: DartThrow[];
}

export interface PlayerState {
  playerId: string;
  remaining: number;
  turns: TurnOutcome[];
  /** Zahl der geworfenen Pfeile, Bust-Aufnahmen eingeschlossen. */
  dartsThrown: number;
  finished: boolean;
  /** Pfeile bis zum Checkout, nur wenn gewonnen. */
  dartsToFinish: number | null;
}

function isDouble(seg: Segment | null): boolean {
  if (!seg) return false;
  return seg.ring === 'double' || seg.ring === 'bullseye';
}

/**
 * Spielt eine Aufnahme durch und sagt, wie sie ausging.
 *
 * Bust in drei Fällen: unter null, genau eins übrig (nicht mehr auf ein
 * Doppel auszuwerfen), oder null erreicht ohne Doppel bei doubleOut. Nach
 * einem Bust zählt die ganze Aufnahme nicht — auch die Pfeile davor.
 */
export function playTurn(before: number, darts: DartThrow[], config: X01Config): TurnOutcome {
  let score = before;
  let bust = false;
  let checkout = false;
  let dartsUsed = 0;

  for (const dart of darts) {
    dartsUsed += 1;
    const value = dart.segment ? segmentScore(dart.segment) : 0;
    const next = score - value;

    if (next < 0 || (config.doubleOut && next === 1)) {
      bust = true;
      break;
    }
    if (next === 0) {
      if (config.doubleOut && !isDouble(dart.segment)) {
        bust = true;
        break;
      }
      score = 0;
      checkout = true;
      break;
    }
    score = next;
  }

  return {
    before,
    after: bust ? before : score,
    scored: bust ? 0 : before - score,
    bust,
    checkout,
    dartsUsed,
    darts,
  };
}

/** Spielstand aller Spieler aus dem Log. */
export function buildStates(
  events: GameEvent[],
  config: X01Config,
  playerIds: string[],
): Record<string, PlayerState> {
  const all = orderedThrows(events);
  const states: Record<string, PlayerState> = {};

  for (const playerId of playerIds) {
    const mine = all.filter((t) => t.playerId === playerId);
    const turns: TurnOutcome[] = [];
    let remaining = config.startScore;
    let finished = false;
    let dartsToFinish: number | null = null;
    let dartsBeforeTurn = 0;

    for (const group of groupIntoTurns(mine, config.dartsPerTurn)) {
      if (finished) break;
      const outcome = playTurn(remaining, group, config);
      turns.push(outcome);
      remaining = outcome.after;
      if (outcome.checkout) {
        finished = true;
        dartsToFinish = dartsBeforeTurn + outcome.dartsUsed;
      }
      dartsBeforeTurn += group.length;
    }

    states[playerId] = {
      playerId,
      remaining,
      turns,
      dartsThrown: mine.length,
      finished,
      dartsToFinish,
    };
  }

  return states;
}

/**
 * Wie viele Pfeile darf der Spieler in der laufenden Aufnahme noch werfen?
 * Nach einem Bust ist die Aufnahme sofort vorbei.
 */
export function dartsLeftInTurn(
  state: PlayerState | undefined,
  config: X01Config,
  openDarts: DartThrow[],
): number {
  if (!state) return config.dartsPerTurn;
  const outcome = playTurn(stateBeforeOpenTurn(state, config), openDarts, config);
  if (outcome.bust || outcome.checkout) return 0;
  return config.dartsPerTurn - openDarts.length;
}

function stateBeforeOpenTurn(state: PlayerState, config: X01Config): number {
  const complete = Math.floor(state.dartsThrown / config.dartsPerTurn);
  const done = state.turns.slice(0, complete);
  return done.length > 0 ? done[done.length - 1].after : config.startScore;
}

export function computeX01Stats(
  events: GameEvent[],
  config: X01Config,
  ctx: StatsContext,
): StatsResult {
  const playerIds = ctx.players.length > 0
    ? ctx.players.map((p) => p.id)
    : ctx.playerId
      ? [ctx.playerId]
      : [];
  const states = buildStates(events, config, playerIds);
  const me = ctx.playerId ? states[ctx.playerId] : undefined;

  if (!me || me.dartsThrown === 0) {
    return {
      metrics: { dartsThrown: 0, average3: 0, averageDart: 0, remaining: config.startScore, won: 0 },
      headline: 'Keine Würfe aufgezeichnet',
      insights: ['Keine Würfe aufgezeichnet.'],
      detail: { turns: [] },
    };
  }

  const scoredPoints = config.startScore - me.remaining;
  const averageDart = me.dartsThrown > 0 ? scoredPoints / me.dartsThrown : 0;
  const average3 = averageDart * 3;

  const turnScores = me.turns.map((t) => t.scored);
  const best = turnScores.length > 0 ? Math.max(...turnScores) : 0;
  const tons = turnScores.filter((s) => s >= 100).length;
  const oneEighties = turnScores.filter((s) => s === 180).length;
  const busts = me.turns.filter((t) => t.bust).length;

  // Checkout-Quote: Aufnahmen, in denen ein Finish möglich war, gegen die,
  // in denen es gelang. Unter 170 ist ein Finish theoretisch möglich.
  const chances = me.turns.filter((t) => t.before <= 170).length;
  const checkoutRate = chances > 0 ? (me.finished ? 1 : 0) / chances : 0;

  const insights: string[] = [];
  if (me.finished) {
    insights.push(`Ausgecheckt mit ${me.dartsToFinish} Pfeilen.`);
  } else {
    insights.push(`${me.remaining} Punkte übrig.`);
  }
  if (oneEighties > 0) insights.push(`${oneEighties} × 180 geworfen.`);
  else if (best >= 100) insights.push(`Beste Aufnahme: ${best} Punkte.`);
  if (busts > 0) {
    insights.push(
      `${busts} ${busts === 1 ? 'Bust' : 'Busts'} — die Aufnahme war jeweils komplett verloren.`,
    );
  }
  if (average3 >= 60) insights.push('Starker Average, das ist Vereinsniveau.');

  return {
    metrics: {
      dartsThrown: me.dartsThrown,
      average3: round(average3, 2),
      averageDart: round(averageDart, 2),
      bestTurn: best,
      tons,
      oneEighties,
      busts,
      remaining: me.remaining,
      won: me.finished ? 1 : 0,
      dartsToFinish: me.dartsToFinish ?? 0,
      checkoutRate: round(checkoutRate, 4),
    },
    headline: me.finished
      ? `Gewonnen mit ${me.dartsToFinish} Pfeilen`
      : `${me.remaining} übrig, Average ${average3.toFixed(1)}`,
    insights,
    detail: {
      turns: me.turns.map((t) => ({
        before: t.before,
        scored: t.scored,
        after: t.after,
        bust: t.bust,
        darts: t.darts.map((d) => (d.segment ? d.segment : null)),
      })),
      turnScores,
    },
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
