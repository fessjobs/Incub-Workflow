import type { GameDefinition } from '../types';
import { defaultX01Config, x01ConfigSchema, type X01Config } from './config';
import { computeX01Stats } from './rules';
import { X01Play } from './Play';
import { X01Setup, X01Result } from './Screens';

export const x01Game: GameDefinition<X01Config> = {
  id: 'x01',
  name: '501',
  description: 'Von 501 auf null. Double Out. Der Klassiker.',
  icon: '🎱',
  minPlayers: 1,
  maxPlayers: 8,

  configSchema: x01ConfigSchema,
  defaultConfig: defaultX01Config,

  SetupComponent: X01Setup,
  PlayComponent: X01Play,
  ResultComponent: X01Result,

  computeStats: computeX01Stats,

  leaderboards: [
    {
      id: 'average',
      name: 'Bester Average',
      metric: 'average3',
      direction: 'desc',
      format: { kind: 'number', decimals: 1 },
      description: 'Punkte pro drei Pfeile.',
    },
    {
      id: 'best-turn',
      name: 'Höchste Aufnahme',
      metric: 'bestTurn',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
    },
    {
      id: 'fewest-darts',
      name: 'Schnellstes Leg',
      metric: 'dartsToFinish',
      direction: 'asc',
      format: { kind: 'number', unit: 'Pfeile' },
      description: 'Nur für gewonnene Legs.',
    },
    {
      id: 'one-eighties',
      name: 'Meiste 180er',
      metric: 'oneEighties',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
    },
  ],

  xpFormula: (result) => {
    const base = Math.round(result.metrics.average3 * 4);
    const win = result.metrics.won === 1 ? 200 : 0;
    const tonBonus = result.metrics.tons * 20 + result.metrics.oneEighties * 60;
    return base + win + tonBonus;
  },

  playerCardAttributes: [
    { id: 'scoring', short: 'SCO', name: 'Scoring', metric: 'average3', worst: 20, best: 90 },
    { id: 'finishing', short: 'FIN', name: 'Finish', metric: 'checkoutRate', worst: 0, best: 0.5 },
    { id: 'power', short: 'PWR', name: 'Power', metric: 'bestTurn', worst: 40, best: 180 },
    { id: 'control', short: 'CTR', name: 'Kontrolle', metric: 'busts', worst: 6, best: 0 },
  ],
  confidentAfterSessions: 10,
};
