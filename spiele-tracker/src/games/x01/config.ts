import { z } from 'zod';

export const x01ConfigSchema = z.object({
  /** Startpunktzahl: 301, 501, 701 … */
  startScore: z.number().int().min(101).max(1001),
  /** Muss mit einem Doppel oder Bullseye beendet werden? */
  doubleOut: z.boolean(),
  /** Muss ein Doppel die Aufnahme eröffnen? Selten gespielt, deshalb aus. */
  doubleIn: z.boolean(),
  dartsPerTurn: z.number().int().min(1).max(6),
});

export type X01Config = z.infer<typeof x01ConfigSchema>;

export const defaultX01Config: X01Config = {
  startScore: 501,
  doubleOut: true,
  doubleIn: false,
  dartsPerTurn: 3,
};
