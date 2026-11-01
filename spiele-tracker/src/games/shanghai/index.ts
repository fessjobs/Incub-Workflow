import type { GameDefinition } from '../types';
import {
  computeShanghaiStats,
  defaultShanghaiConfig,
  shanghaiConfigSchema,
  type ShanghaiConfig,
} from './rules';
import { ShanghaiPlay, ShanghaiSetup, ShanghaiResult } from './Screens';

export const shanghaiGame: GameDefinition<ShanghaiConfig> = {
  id: 'shanghai',
  name: 'Shanghai',
  description: 'Runde für Runde auf die nächste Zahl. Single, Double und Triple gewinnt sofort.',
  icon: '🏮',
  minPlayers: 1,
  maxPlayers: 8,

  configSchema: shanghaiConfigSchema,
  defaultConfig: defaultShanghaiConfig,

  SetupComponent: ShanghaiSetup,
  PlayComponent: ShanghaiPlay,
  ResultComponent: ShanghaiResult,

  computeStats: computeShanghaiStats,

  leaderboards: [
    {
      id: 'total',
      name: 'Höchste Punktzahl',
      metric: 'total',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
    },
    {
      id: 'hit-rate',
      name: 'Beste Trefferquote',
      metric: 'hitRate',
      direction: 'desc',
      format: { kind: 'percent', decimals: 1 },
    },
    {
      id: 'shanghai',
      name: 'Shanghais',
      metric: 'shanghai',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
      description: 'Single, Double und Triple der Zielzahl in einer Runde.',
    },
  ],

  xpFormula: (result) =>
    Math.round(result.metrics.total * 1.5) +
    (result.metrics.shanghai === 1 ? 300 : 0) +
    Math.round(result.metrics.hitRate * 150),

  playerCardAttributes: [
    { id: 'precision', short: 'PRÄ', name: 'Präzision', metric: 'hitRate', worst: 0.1, best: 0.7 },
    { id: 'scoring', short: 'PKT', name: 'Punkten', metric: 'total', worst: 20, best: 180 },
  ],
  confidentAfterSessions: 10,
};
