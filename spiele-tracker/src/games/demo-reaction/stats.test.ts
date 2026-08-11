import { describe, expect, it } from 'vitest';
import { computeReactionStats } from './stats';
import { defaultReactionConfig } from './config';
import type { GameEvent } from '../types';

function ev(tMs: number, type: string): GameEvent {
  return { sessionId: 's', playerId: 'p', tMs, type, payload: {}, source: 'system' };
}

const config = { ...defaultReactionConfig, rounds: 3 };

describe('computeReactionStats', () => {
  it('rechnet die Reaktionszeit als Abstand zum vorangegangenen Signal', () => {
    const stats = computeReactionStats(
      [ev(1000, 'signal'), ev(1300, 'tap'), ev(2000, 'signal'), ev(2500, 'tap')],
      config,
    );
    expect(stats.detail.reactions).toEqual([300, 500]);
    expect(stats.metrics.avgReactionMs).toBe(400);
    expect(stats.metrics.bestReactionMs).toBe(300);
    expect(stats.metrics.worstReactionMs).toBe(500);
  });

  it('ignoriert Taps ohne offenes Signal', () => {
    const stats = computeReactionStats([ev(500, 'tap'), ev(1000, 'signal'), ev(1200, 'tap')], config);
    expect(stats.detail.reactions).toEqual([200]);
  });

  it('zählt Fehlstarts und verwirft das offene Signal', () => {
    const stats = computeReactionStats(
      [ev(1000, 'signal'), ev(1100, 'early'), ev(1500, 'tap')],
      config,
    );
    expect(stats.metrics.falseStarts).toBe(1);
    expect(stats.detail.reactions).toEqual([]);
  });

  it('sortiert unsortiert eintreffende Events nach tMs', () => {
    const stats = computeReactionStats([ev(1300, 'tap'), ev(1000, 'signal')], config);
    expect(stats.detail.reactions).toEqual([300]);
  });

  it('nutzt clientSeq als Tiebreaker bei identischem tMs', () => {
    const signal: GameEvent = { ...ev(1000, 'signal'), clientSeq: 1 };
    const tap: GameEvent = { ...ev(1000, 'tap'), clientSeq: 2 };
    const stats = computeReactionStats([tap, signal], config);
    expect(stats.detail.reactions).toEqual([0]);
  });

  it('markiert completed erst, wenn alle Durchgänge gespielt sind', () => {
    const two = computeReactionStats(
      [ev(0, 'signal'), ev(100, 'tap'), ev(200, 'signal'), ev(300, 'tap')],
      config,
    );
    expect(two.metrics.completed).toBe(0);

    const three = computeReactionStats(
      [
        ev(0, 'signal'),
        ev(100, 'tap'),
        ev(200, 'signal'),
        ev(300, 'tap'),
        ev(400, 'signal'),
        ev(500, 'tap'),
      ],
      config,
    );
    expect(three.metrics.completed).toBe(1);
  });

  it('kommt mit einem leeren Log klar', () => {
    const stats = computeReactionStats([], config);
    expect(stats.metrics.roundsCompleted).toBe(0);
    expect(stats.metrics.avgReactionMs).toBe(0);
    expect(stats.headline).toBe('Keine gültige Reaktion');
  });

  it('ist eine reine Funktion – gleiche Eingabe, gleiches Ergebnis', () => {
    const events = [ev(1000, 'signal'), ev(1250, 'tap')];
    expect(computeReactionStats(events, config)).toEqual(computeReactionStats(events, config));
  });

  it('verändert das übergebene Event-Array nicht', () => {
    const events = [ev(1300, 'tap'), ev(1000, 'signal')];
    computeReactionStats(events, config);
    expect(events.map((e) => e.tMs)).toEqual([1300, 1000]);
  });
});
