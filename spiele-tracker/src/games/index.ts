import { registerGame } from './registry';
import { demoReactionGame } from './demo-reaction';

/**
 * Die einzige Stelle, an der Spiele eingehängt werden.
 * Ein neues Spiel: Ordner unter src/games/ anlegen, hier importieren,
 * hier registrieren. Sonst nichts – siehe src/games/README.md.
 */
let initialised = false;

export function initGames(): void {
  if (initialised) return;
  initialised = true;

  registerGame(demoReactionGame);
  // registerGame(dartClockGame);  ← kommt in Block 3
}

export * from './types';
export { getGame, requireGame, listGames } from './registry';
