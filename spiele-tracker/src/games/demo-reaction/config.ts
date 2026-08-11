import { z } from 'zod';

export const reactionConfigSchema = z.object({
  /** Wie viele Durchgänge gespielt werden. */
  rounds: z.number().int().min(3).max(20),
  /** Zufällige Wartezeit vor dem Signal, in Millisekunden. */
  minDelayMs: z.number().int().min(300).max(5000),
  maxDelayMs: z.number().int().min(300).max(10000),
});

export type ReactionConfig = z.infer<typeof reactionConfigSchema>;

export const defaultReactionConfig: ReactionConfig = {
  rounds: 5,
  minDelayMs: 800,
  maxDelayMs: 2600,
};
