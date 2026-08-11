import type { GameDefinition } from '../types';
import { defaultReactionConfig, reactionConfigSchema, type ReactionConfig } from './config';
import { computeReactionStats } from './stats';
import { ReactionSetup } from './Setup';
import { ReactionPlay } from './Play';
import { ReactionResult } from './Result';

/**
 * Demo-Spiel – der Beweis, dass das Plugin-System trägt.
 *
 * Es ist bewusst trivial und hat mit Dart nichts zu tun. Wenn Ranglisten,
 * Logbuch und Profile dieses Spiel korrekt anzeigen, ohne es zu kennen, ist
 * die Architektur in Ordnung. Kann später ersatzlos gelöscht werden.
 */
export const demoReactionGame: GameDefinition<ReactionConfig> = {
  id: 'demo-reaction',
  name: 'Reaktionstest (Demo)',
  description: 'Tippen, sobald das Feld grün wird. Dient nur als Architektur-Nachweis.',
  icon: '⚡',
  minPlayers: 1,
  maxPlayers: 1,

  configSchema: reactionConfigSchema,
  defaultConfig: defaultReactionConfig,

  SetupComponent: ReactionSetup,
  PlayComponent: ReactionPlay,
  ResultComponent: ReactionResult,

  computeStats: computeReactionStats,

  leaderboards: [
    {
      id: 'best-reaction',
      name: 'Schnellste Reaktion',
      metric: 'bestReactionMs',
      direction: 'asc',
      format: { kind: 'number', unit: 'ms' },
      description: 'Der schnellste einzelne Tap.',
    },
    {
      id: 'avg-reaction',
      name: 'Bester Durchschnitt',
      metric: 'avgReactionMs',
      direction: 'asc',
      format: { kind: 'number', unit: 'ms', decimals: 0 },
    },
    {
      id: 'consistency',
      name: 'Gleichmäßigkeit',
      metric: 'consistencyMs',
      direction: 'asc',
      format: { kind: 'number', unit: 'ms', decimals: 0 },
      description: 'Standardabweichung über alle Durchgänge – kleiner ist besser.',
    },
  ],

  xpFormula: (result) => {
    if (result.metrics.roundsCompleted === 0) return 0;
    const base = 10 * result.metrics.roundsCompleted;
    // Unter 250 ms gibt es Bonus, linear bis 0 bei 500 ms.
    const speedBonus = Math.max(0, Math.round((500 - result.metrics.avgReactionMs) / 5));
    const penalty = 5 * result.metrics.falseStarts;
    return Math.max(0, base + speedBonus - penalty);
  },

  playerCardAttributes: [
    { id: 'speed', short: 'SPD', name: 'Reflexe', metric: 'avgReactionMs', worst: 600, best: 180 },
    {
      id: 'consistency',
      short: 'KON',
      name: 'Konstanz',
      metric: 'consistencyMs',
      worst: 200,
      best: 10,
    },
  ],
  minSessionsForCard: 5,
};
