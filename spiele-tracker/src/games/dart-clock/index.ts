import type { GameDefinition } from '../types';
import {
  defaultDartClockConfig,
  dartClockConfigSchema,
  type DartClockConfig,
} from './config';
import { computeDartClockStats } from './stats';
import { DartClockSetup } from './Setup';
import { DartClockPlay } from './Play';
import { DartClockResult } from './Result';

/**
 * Round the Clock auf Zeit.
 *
 * Die 1 bis 20 in aufsteigender Reihenfolge treffen, jedes Feld zählt.
 * Mehrere Spieler laufen nacheinander am selben Gerät, jeder mit eigener Uhr.
 */
export const dartClockGame: GameDefinition<DartClockConfig> = {
  id: 'dart-clock',
  name: 'Round the Clock',
  description: '1 bis 20 auf Zeit. Jedes Feld zählt — Single, Double, Triple.',
  icon: '🎯',
  minPlayers: 1,
  maxPlayers: 8,

  configSchema: dartClockConfigSchema,
  defaultConfig: defaultDartClockConfig,

  SetupComponent: DartClockSetup,
  PlayComponent: DartClockPlay,
  ResultComponent: DartClockResult,

  computeStats: computeDartClockStats,

  leaderboards: [
    {
      id: 'numbers-cleared',
      name: 'Weiteste Zahl',
      metric: 'numbersCleared',
      direction: 'desc',
      format: { kind: 'number', decimals: 0 },
      description: 'Wie viele der 20 Zahlen innerhalb des Limits fielen.',
    },
    {
      id: 'time-to-complete',
      name: 'Schnellste Runde',
      metric: 'timeToCompleteMs',
      direction: 'asc',
      format: { kind: 'duration' },
      description: 'Nur für Sessions, in denen alle 20 Zahlen fielen.',
    },
    {
      id: 'hit-rate',
      name: 'Beste Trefferquote',
      metric: 'hitRate',
      direction: 'desc',
      format: { kind: 'percent', decimals: 1 },
    },
    {
      id: 'throughput',
      name: 'Höchste Wurffrequenz',
      metric: 'throwsPerMinute',
      direction: 'desc',
      format: { kind: 'perMinute', decimals: 1 },
      description: 'Würfe pro Minute reiner Wurfzeit, ohne Pfeileholen.',
    },
    {
      id: 'retrieval',
      name: 'Schnellstes Pfeileholen',
      metric: 'avgRetrievalMs',
      direction: 'asc',
      format: { kind: 'duration' },
    },
  ],

  xpFormula: (result) => {
    const base = 20 * result.metrics.numbersCleared;
    const completionBonus = result.metrics.completed === 1 ? 250 : 0;
    // Präzision zählt mehr als Hektik: ein Treffer aus zwei Würfen ist
    // wertvoller als drei Treffer aus zwölf.
    const accuracyBonus = Math.round(200 * result.metrics.hitRate);
    return base + completionBonus + accuracyBonus;
  },

  playerCardAttributes: [
    { id: 'speed', short: 'SPD', name: 'Tempo', metric: 'throwsPerMinute', worst: 8, best: 40 },
    { id: 'precision', short: 'PRÄ', name: 'Präzision', metric: 'hitRate', worst: 0.08, best: 0.6 },
    { id: 'reach', short: 'REI', name: 'Reichweite', metric: 'numbersCleared', worst: 3, best: 20 },
    {
      id: 'handling',
      short: 'HAN',
      name: 'Handling',
      metric: 'avgRetrievalMs',
      worst: 20000,
      best: 5000,
    },
  ],
  confidentAfterSessions: 10,
};
