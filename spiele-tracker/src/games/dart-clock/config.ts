import { z } from 'zod';

export const dartClockConfigSchema = z.object({
  /** Zeitlimit je Spieler in Sekunden. */
  timeLimitSec: z.number().int().min(30).max(600),
  /** Pfeile, bevor gezogen werden muss. */
  arrowsPerRound: z.number().int().min(1).max(12),
  /** Höchste Zielzahl. 20 heißt: nach der 20 ist Schluss. */
  highestTarget: z.number().int().min(5).max(20),
});

export type DartClockConfig = z.infer<typeof dartClockConfigSchema>;

/**
 * Entschieden am 30.10.: 120 Sekunden, immer 6 Pfeile, nach der 20 ist
 * Schluss (kein Bull als Abschluss).
 */
export const defaultDartClockConfig: DartClockConfig = {
  timeLimitSec: 120,
  arrowsPerRound: 6,
  highestTarget: 20,
};

/** Breite der Zeitfenster in der Auswertung. */
export const WINDOW_MS = 10_000;
