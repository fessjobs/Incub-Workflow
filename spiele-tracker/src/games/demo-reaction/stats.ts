import type { GameEvent, StatsResult } from '../types';
import type { ReactionConfig } from './config';

/**
 * Auswertung ausschließlich aus dem Event-Log.
 *
 * Relevante Events:
 *   signal  – das Signal erschien
 *   tap     – der Spieler hat getippt
 *   early   – der Spieler war zu früh (Fehlstart)
 *
 * Ein tap gehört zum letzten signal davor. Die Reaktionszeit ist die Differenz
 * der tMs-Werte. Genau dieses Muster nutzt später auch das Dart-Spiel.
 */
export function computeReactionStats(events: GameEvent[], config: ReactionConfig): StatsResult {
  const ordered = [...events].sort(
    (a, b) => a.tMs - b.tMs || (a.clientSeq ?? 0) - (b.clientSeq ?? 0),
  );

  const reactions: number[] = [];
  let openSignalAt: number | null = null;
  let falseStarts = 0;

  for (const event of ordered) {
    switch (event.type) {
      case 'signal':
        openSignalAt = event.tMs;
        break;
      case 'tap':
        if (openSignalAt !== null) {
          reactions.push(event.tMs - openSignalAt);
          openSignalAt = null;
        }
        break;
      case 'early':
        falseStarts += 1;
        openSignalAt = null;
        break;
      default:
        break;
    }
  }

  const rounds = reactions.length;
  const best = rounds > 0 ? Math.min(...reactions) : 0;
  const worst = rounds > 0 ? Math.max(...reactions) : 0;
  const avg = rounds > 0 ? reactions.reduce((sum, v) => sum + v, 0) / rounds : 0;
  const spread = standardDeviation(reactions);

  const insights: string[] = [];
  if (rounds === 0) {
    insights.push('Keine gültige Reaktion aufgezeichnet.');
  } else {
    if (falseStarts > 0) {
      insights.push(
        `${falseStarts} ${falseStarts === 1 ? 'Fehlstart' : 'Fehlstarts'} – etwas zu eifrig.`,
      );
    }
    if (spread < 40 && rounds >= 3) {
      insights.push('Sehr gleichmäßige Reaktionszeiten.');
    } else if (spread > 120) {
      insights.push('Die Reaktionszeiten schwanken stark.');
    }
    if (rounds >= config.rounds) {
      insights.push('Alle Durchgänge abgeschlossen.');
    }
  }

  return {
    metrics: {
      avgReactionMs: round(avg),
      bestReactionMs: best,
      worstReactionMs: worst,
      consistencyMs: round(spread),
      falseStarts,
      roundsCompleted: rounds,
      completed: rounds >= config.rounds ? 1 : 0,
    },
    headline:
      rounds > 0
        ? `Ø ${Math.round(avg)} ms, beste ${best} ms`
        : 'Keine gültige Reaktion',
    insights,
    detail: { reactions },
  };
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
