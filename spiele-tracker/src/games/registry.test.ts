import { describe, expect, it, beforeEach } from 'vitest';
import { z } from 'zod';
import { getGame, listGames, registerGame, requireGame, resetRegistry } from './registry';
import type { GameDefinition } from './types';

const noopComponent = () => null;

function makeGame(overrides: Partial<GameDefinition<{ n: number }>> = {}) {
  const base: GameDefinition<{ n: number }> = {
    id: 'test-game',
    name: 'Testspiel',
    description: 'nur für Tests',
    icon: '🧪',
    minPlayers: 1,
    maxPlayers: 4,
    configSchema: z.object({ n: z.number() }),
    defaultConfig: { n: 1 },
    SetupComponent: noopComponent,
    PlayComponent: noopComponent,
    ResultComponent: noopComponent,
    computeStats: () => ({ metrics: {}, headline: '', insights: [], detail: {} }),
    leaderboards: [],
    xpFormula: () => 0,
  };
  return { ...base, ...overrides };
}

describe('game registry', () => {
  beforeEach(() => resetRegistry());

  it('registriert ein Spiel und gibt es wieder heraus', () => {
    const game = makeGame();
    registerGame(game);
    expect(getGame('test-game')).toBe(game);
  });

  it('sortiert die Liste alphabetisch nach Anzeigename', () => {
    registerGame(makeGame({ id: 'zebra', name: 'Zebra' }));
    registerGame(makeGame({ id: 'anton', name: 'Anton' }));
    registerGame(makeGame({ id: 'oebel', name: 'Öbel' }));
    expect(listGames().map((g) => g.name)).toEqual(['Anton', 'Öbel', 'Zebra']);
  });

  it('lehnt eine doppelte id ab', () => {
    registerGame(makeGame());
    expect(() => registerGame(makeGame())).toThrow(/bereits registriert/);
  });

  it('lehnt eine id mit Großbuchstaben oder Leerzeichen ab', () => {
    expect(() => registerGame(makeGame({ id: 'Dart Clock' }))).toThrow(/Kleinbuchstaben/);
  });

  it('lehnt eine defaultConfig ab, die nicht zum Schema passt', () => {
    expect(() =>
      // @ts-expect-error – genau dieser Fehler soll zur Laufzeit auffallen
      registerGame(makeGame({ defaultConfig: { n: 'eins' } })),
    ).toThrow(/defaultConfig passt nicht/);
  });

  it('lehnt maxPlayers kleiner als minPlayers ab', () => {
    expect(() => registerGame(makeGame({ minPlayers: 4, maxPlayers: 2 }))).toThrow(
      /maxPlayers ist kleiner/,
    );
  });

  it('lehnt doppelte Ranglisten-ids ab', () => {
    expect(() =>
      registerGame(
        makeGame({
          leaderboards: [
            { id: 'x', name: 'A', metric: 'a', direction: 'desc' },
            { id: 'x', name: 'B', metric: 'b', direction: 'desc' },
          ],
        }),
      ),
    ).toThrow(/doppelt/);
  });

  it('requireGame nennt die registrierten Spiele, wenn eins fehlt', () => {
    registerGame(makeGame({ id: 'vorhanden' }));
    expect(() => requireGame('fehlt')).toThrow(/vorhanden/);
  });
});
