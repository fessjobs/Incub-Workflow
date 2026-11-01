import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ACHIEVEMENTS,
  evaluateAchievements,
  type CareerStats,
} from './evaluate';
import type { StatsResult } from '@/games/types';

const emptyCareer: CareerStats = { sessionsPlayed: 0, byGame: {}, best: {}, totals: {} };

function stats(metrics: Record<string, number>): StatsResult {
  return { metrics, headline: '', insights: [], detail: {} };
}

describe('evaluateAchievements', () => {
  it('schaltet frei, wenn die Regel zutrifft', () => {
    const got = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'x01',
      session: stats({ oneEighties: 1, busts: 3, average3: 40, won: 0, bestTurn: 180 }),
      career: emptyCareer,
      already: new Set(),
    });
    expect(got.map((a) => a.id)).toContain('x01_180');
    expect(got.map((a) => a.id)).toContain('x01_ton');
  });

  it('meldet nichts doppelt', () => {
    const got = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'x01',
      session: stats({ oneEighties: 1 }),
      career: emptyCareer,
      already: new Set(['x01_180']),
    });
    expect(got.map((a) => a.id)).not.toContain('x01_180');
  });

  it('hält Auszeichnungen anderer Spiele raus', () => {
    const got = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'cricket',
      session: stats({ oneEighties: 5, marksPerRound: 0.5, closedNumbers: 1 }),
      career: emptyCareer,
      already: new Set(),
    });
    expect(got.map((a) => a.id)).not.toContain('x01_180');
  });

  it('wertet Karriere-Regeln gegen die Gesamtzahl der Sessions', () => {
    const got = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'x01',
      session: null,
      career: { ...emptyCareer, sessionsPlayed: 10 },
      already: new Set(),
    });
    expect(got.map((a) => a.id)).toEqual(
      expect.arrayContaining(['first_session', 'sessions_10']),
    );
  });

  it('versteht lte, damit auch kleine Werte Auszeichnungen geben', () => {
    // "Ohne Bust" ist eine eq-0-Regel – sie darf nicht bei drei Busts greifen.
    const mitBusts = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'x01',
      session: stats({ busts: 3 }),
      career: emptyCareer,
      already: new Set(),
    });
    expect(mitBusts.map((a) => a.id)).not.toContain('x01_clean');

    const ohneBusts = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'x01',
      session: stats({ busts: 0 }),
      career: emptyCareer,
      already: new Set(),
    });
    expect(ohneBusts.map((a) => a.id)).toContain('x01_clean');
  });

  it('ignoriert Regeln, deren Metrik die Session gar nicht liefert', () => {
    const got = evaluateAchievements(BUILT_IN_ACHIEVEMENTS, {
      gameId: 'shanghai',
      session: stats({ total: 50 }),
      career: emptyCareer,
      already: new Set(),
    });
    expect(got.map((a) => a.id)).not.toContain('shanghai_hit');
  });

  it('kommt mit einer leeren Regelliste klar', () => {
    expect(
      evaluateAchievements([], {
        gameId: 'x01',
        session: stats({ won: 1 }),
        career: emptyCareer,
        already: new Set(),
      }),
    ).toEqual([]);
  });
});
