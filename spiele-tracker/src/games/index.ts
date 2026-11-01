import { registerGame } from './registry';
import { demoReactionGame } from './demo-reaction';
import { dartClockGame } from './dart-clock';
import { x01Game } from './x01';
import { cricketGame } from './cricket';
import { shanghaiGame } from './shanghai';

/**
 * Die einzige Stelle, an der Spiele eingehängt werden.
 * Ein neues Spiel: Ordner unter src/games/ anlegen, hier importieren,
 * hier registrieren. Sonst nichts – siehe src/games/README.md.
 */
let initialised = false;

export function initGames(): void {
  if (initialised) return;
  initialised = true;

  registerGame(x01Game);
  registerGame(cricketGame);
  registerGame(shanghaiGame);
  registerGame(dartClockGame);
  registerGame(demoReactionGame);
}

export * from './types';
export { getGame, requireGame, listGames } from './registry';
