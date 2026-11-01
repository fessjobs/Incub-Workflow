import type { StatsResult } from '@/games/types';

/**
 * Auswertung der deklarativen Achievement-Regeln.
 *
 * Eine Regel ist Daten, kein Code — genau die Form, die auch in der Tabelle
 * `public.achievements` steht:
 *
 *   { scope: 'session', metric: 'hitRate', op: 'gte', value: 0.5, gameId: 'dart-clock' }
 *
 * `scope: 'session'` prüft gegen das Ergebnis einer Session, `scope: 'career'`
 * gegen die aufsummierten Werte über alle Sessions.
 */

export interface AchievementRule {
  scope: 'session' | 'career';
  metric: string;
  op: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value: number;
  gameId?: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  rule: AchievementRule;
}

export interface CareerStats {
  sessionsPlayed: number;
  /** Je Spiel: wie viele Sessions. */
  byGame: Record<string, number>;
  /** Bestwerte je Metrik, über alle Sessions. */
  best: Record<string, number>;
  totals: Record<string, number>;
}

function compare(actual: number, op: AchievementRule['op'], expected: number): boolean {
  switch (op) {
    case 'gte':
      return actual >= expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'lt':
      return actual < expected;
    case 'eq':
      return actual === expected;
    default:
      return false;
  }
}

/**
 * Welche Auszeichnungen trifft diese Session?
 *
 * `already` sind die bereits freigeschalteten — die werden nicht erneut
 * gemeldet, sonst feiert die App bei jeder Session dasselbe.
 */
export function evaluateAchievements(
  defs: AchievementDef[],
  input: {
    gameId: string;
    session: StatsResult | null;
    career: CareerStats;
    already: Set<string>;
  },
): AchievementDef[] {
  const unlocked: AchievementDef[] = [];

  for (const def of defs) {
    if (input.already.has(def.id)) continue;
    const rule = def.rule;
    if (rule.gameId && rule.gameId !== input.gameId) continue;

    if (rule.scope === 'session') {
      const value = input.session?.metrics[rule.metric];
      if (typeof value === 'number' && compare(value, rule.op, rule.value)) {
        unlocked.push(def);
      }
    } else {
      const value = careerValue(input.career, rule.metric, rule.gameId);
      if (typeof value === 'number' && compare(value, rule.op, rule.value)) {
        unlocked.push(def);
      }
    }
  }

  return unlocked;
}

function careerValue(career: CareerStats, metric: string, gameId?: string): number | undefined {
  if (metric === 'sessionsPlayed') {
    return gameId ? (career.byGame[gameId] ?? 0) : career.sessionsPlayed;
  }
  if (metric.startsWith('best.')) return career.best[metric.slice(5)];
  if (metric.startsWith('total.')) return career.totals[metric.slice(6)];
  return career.best[metric] ?? career.totals[metric];
}

/**
 * Die mitgelieferten Auszeichnungen.
 *
 * Im echten Betrieb kommen sie aus der Datenbank (Tabelle `achievements`),
 * im Testmodus aus dieser Liste. Beide haben dieselbe Form, damit nichts
 * umgeschrieben werden muss, wenn Supabase dazukommt.
 */
export const BUILT_IN_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_session',
    name: 'Erster Wurf',
    description: 'Erste Session überhaupt abgeschlossen.',
    icon: '🎯',
    xpReward: 50,
    rule: { scope: 'career', metric: 'sessionsPlayed', op: 'gte', value: 1 },
  },
  {
    id: 'sessions_10',
    name: 'Stammgast',
    description: '10 Sessions gespielt.',
    icon: '📅',
    xpReward: 150,
    rule: { scope: 'career', metric: 'sessionsPlayed', op: 'gte', value: 10 },
  },
  {
    id: 'x01_win',
    name: 'Ausgecheckt',
    description: 'Ein Leg 501 gewonnen.',
    icon: '🏁',
    xpReward: 150,
    rule: { scope: 'session', metric: 'won', op: 'eq', value: 1, gameId: 'x01' },
  },
  {
    id: 'x01_180',
    name: 'Hundertachtzig!',
    description: 'Drei Triple-20 in einer Aufnahme.',
    icon: '💥',
    xpReward: 400,
    rule: { scope: 'session', metric: 'oneEighties', op: 'gte', value: 1, gameId: 'x01' },
  },
  {
    id: 'x01_ton',
    name: 'Ton',
    description: 'Eine Aufnahme mit 100 Punkten oder mehr.',
    icon: '💯',
    xpReward: 120,
    rule: { scope: 'session', metric: 'bestTurn', op: 'gte', value: 100, gameId: 'x01' },
  },
  {
    id: 'x01_average_60',
    name: 'Vereinsniveau',
    description: 'Average von 60 oder mehr über ein ganzes Leg.',
    icon: '📈',
    xpReward: 300,
    rule: { scope: 'session', metric: 'average3', op: 'gte', value: 60, gameId: 'x01' },
  },
  {
    id: 'x01_clean',
    name: 'Ohne Bust',
    description: 'Ein Leg ganz ohne Bust gespielt.',
    icon: '🧊',
    xpReward: 100,
    rule: { scope: 'session', metric: 'busts', op: 'eq', value: 0, gameId: 'x01' },
  },
  {
    id: 'cricket_mpr_2',
    name: 'Marksmaschine',
    description: 'Zwei Marks pro Runde bei Cricket.',
    icon: '🦗',
    xpReward: 200,
    rule: { scope: 'session', metric: 'marksPerRound', op: 'gte', value: 2, gameId: 'cricket' },
  },
  {
    id: 'cricket_all_closed',
    name: 'Alles dicht',
    description: 'Alle sieben Zahlen bei Cricket zugemacht.',
    icon: '🔒',
    xpReward: 250,
    rule: { scope: 'session', metric: 'closedNumbers', op: 'gte', value: 7, gameId: 'cricket' },
  },
  {
    id: 'shanghai_hit',
    name: 'Shanghai',
    description: 'Single, Double und Triple der Zielzahl in einer Runde.',
    icon: '🏮',
    xpReward: 500,
    rule: { scope: 'session', metric: 'shanghai', op: 'gte', value: 1, gameId: 'shanghai' },
  },
  {
    id: 'clock_finish',
    name: 'Die Uhr geschlagen',
    description: 'Alle 20 Zahlen innerhalb des Zeitlimits.',
    icon: '🕛',
    xpReward: 300,
    rule: { scope: 'session', metric: 'completed', op: 'eq', value: 1, gameId: 'dart-clock' },
  },
  {
    id: 'clock_accuracy',
    name: 'Scharfschütze',
    description: 'Trefferquote von 50 % bei Round the Clock.',
    icon: '🔍',
    xpReward: 200,
    rule: { scope: 'session', metric: 'hitRate', op: 'gte', value: 0.5, gameId: 'dart-clock' },
  },
];
