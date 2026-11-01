import type { GameDefinition } from '../types';
import {
  cricketConfigSchema,
  computeCricketStats,
  defaultCricketConfig,
  type CricketConfig,
} from './rules';
import { CricketPlay, CricketSetup, CricketResult } from './Screens';

export const cricketGame: GameDefinition<CricketConfig> = {
  id: 'cricket',
  name: 'Cricket',
  description: '20 bis 15 und Bull zumachen. Mit Cutthroat-Variante.',
  icon: '🦗',
  minPlayers: 1,
  maxPlayers: 6,

  configSchema: cricketConfigSchema,
  defaultConfig: defaultCricketConfig,

  SetupComponent: CricketSetup,
  PlayComponent: CricketPlay,
  ResultComponent: CricketResult,

  computeStats: computeCricketStats,

  leaderboards: [
    {
      id: 'mpr',
      name: 'Marks pro Runde',
      metric: 'marksPerRound',
      direction: 'desc',
      format: { kind: 'number', decimals: 2 },
      description: 'Die Kennzahl, an der Cricket gemessen wird.',
    },
    {
      id: 'points',
      name: 'Meiste Punkte',
      metric: 'points',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
    },
    {
      id: 'wins',
      name: 'Siege',
      metric: 'won',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
    },
  ],

  xpFormula: (result) => {
    const base = Math.round(result.metrics.marksPerRound * 60);
    const closing = result.metrics.closedNumbers * 15;
    const win = result.metrics.won === 1 ? 180 : 0;
    return base + closing + win;
  },

  playerCardAttributes: [
    { id: 'marks', short: 'MPR', name: 'Trefferdichte', metric: 'marksPerRound', worst: 0.5, best: 3 },
    { id: 'closing', short: 'ZU', name: 'Zumachen', metric: 'closedNumbers', worst: 1, best: 7 },
    { id: 'scoring', short: 'PKT', name: 'Punkten', metric: 'points', worst: 0, best: 200 },
  ],
  confidentAfterSessions: 10,
};
