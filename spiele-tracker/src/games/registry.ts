import type { AnyGameDefinition, GameDefinition } from './types';

/**
 * Registry aller Spiele. Ein neues Spiel wird ausschließlich hier
 * eingehängt – siehe src/games/README.md.
 */

const registry = new Map<string, AnyGameDefinition>();

export function registerGame<TConfig>(definition: GameDefinition<TConfig>): void {
  if (registry.has(definition.id)) {
    throw new Error(`Spiel "${definition.id}" ist bereits registriert.`);
  }
  assertValidDefinition(definition as AnyGameDefinition);
  registry.set(definition.id, definition as AnyGameDefinition);
}

export function getGame(id: string): AnyGameDefinition | undefined {
  return registry.get(id);
}

/** Wirft, statt undefined zu liefern – für Stellen, die ohne Spiel nicht weiterkönnen. */
export function requireGame(id: string): AnyGameDefinition {
  const game = registry.get(id);
  if (!game) {
    throw new Error(
      `Unbekanntes Spiel "${id}". Registriert sind: ${[...registry.keys()].join(', ') || '(keins)'}`,
    );
  }
  return game;
}

export function listGames(): AnyGameDefinition[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Nur für Tests: setzt die Registry zurück. */
export function resetRegistry(): void {
  registry.clear();
}

/**
 * Fängt die Fehler ab, die man beim Anlegen eines Spiels typischerweise macht.
 * Lieber beim Start laut scheitern als später mit kaputten Ranglisten leben.
 */
function assertValidDefinition(d: AnyGameDefinition): void {
  const problems: string[] = [];

  if (!d.id.trim()) problems.push('id ist leer');
  if (!/^[a-z0-9-]+$/.test(d.id)) {
    problems.push(`id "${d.id}" darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten`);
  }
  if (!d.name.trim()) problems.push('name ist leer');
  if (d.minPlayers < 1) problems.push('minPlayers muss mindestens 1 sein');
  if (d.maxPlayers < d.minPlayers) problems.push('maxPlayers ist kleiner als minPlayers');

  const parsed = d.configSchema.safeParse(d.defaultConfig);
  if (!parsed.success) {
    problems.push(`defaultConfig passt nicht zum configSchema: ${parsed.error.message}`);
  }

  const seen = new Set<string>();
  for (const lb of d.leaderboards) {
    if (seen.has(lb.id)) problems.push(`Rangliste "${lb.id}" ist doppelt`);
    seen.add(lb.id);
  }

  if (problems.length > 0) {
    throw new Error(`Spiel "${d.id}" ist nicht gültig:\n- ${problems.join('\n- ')}`);
  }
}
