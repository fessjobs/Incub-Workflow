import type { GameEvent, StatsContext, StatsResult } from '../types';
import { ringDistance, signedRingDistance, verticalPosition } from '../_dart/segments';
import { WINDOW_MS, type DartClockConfig } from './config';

/**
 * Auswertung von „Round the Clock auf Zeit", ausschließlich aus dem Event-Log.
 *
 * Events, die dieses Spiel schreibt:
 *   run_start        – der Durchgang dieses Spielers beginnt
 *   throw            – ein Wurf: { target, hit: {number, ring} | null }
 *   retrieval_start  – nach dem letzten Pfeil einer Runde
 *   retrieval_end    – beim ersten Wurf der Folgerunde
 *   run_end          – Zeit abgelaufen oder alle Zahlen geschafft
 *
 * Alle Zeiten werden relativ zum run_start des jeweiligen Spielers gerechnet,
 * nicht relativ zum Sessionstart. Bei mehreren Spielern an einem Handy läuft
 * tMs durch, jeder Durchgang beginnt aber bei null.
 */

export interface ThrowRecord {
  /** Millisekunden seit Beginn des eigenen Durchgangs. */
  tMs: number;
  target: number;
  /** Getroffene Zahl, oder null bei „daneben" / Draht / aus. */
  hitNumber: number | null;
  ring: string | null;
  isHit: boolean;
  /** Abstand in Segmenten auf dem Kranz, oder null wenn nicht messbar. */
  errorSegments: number | null;
  /** Positiv im Uhrzeigersinn. */
  signedError: number | null;
}

export interface WindowBucket {
  /** Sekunde, an der das Fenster beginnt. */
  fromSec: number;
  throws: number;
  hits: number;
  hitRate: number;
}

export interface TargetStat {
  target: number;
  throws: number;
  cleared: boolean;
}

function toThrowRecord(event: GameEvent, runStart: number): ThrowRecord | null {
  if (event.type !== 'throw') return null;
  const payload = event.payload as {
    target?: number;
    hit?: { number?: number; ring?: string } | null;
  };
  const target = typeof payload.target === 'number' ? payload.target : 0;
  const hitNumber =
    payload.hit && typeof payload.hit.number === 'number' && payload.hit.number > 0
      ? payload.hit.number
      : null;
  const isHit = hitNumber !== null && hitNumber === target;

  // Abweichung nur dort, wo sie bekannt ist. Im Treffer/Daneben-Modus gibt es
  // keine getroffene Zahl – dann bleibt das Feld leer statt zu raten.
  const errorSegments = !isHit && hitNumber !== null ? ringDistance(target, hitNumber) : null;

  return {
    tMs: Math.max(0, event.tMs - runStart),
    target,
    hitNumber,
    ring: payload.hit?.ring ?? null,
    isHit,
    errorSegments: errorSegments !== null && errorSegments >= 0 ? errorSegments : null,
    signedError: !isHit && hitNumber !== null ? signedRingDistance(target, hitNumber) : null,
  };
}

export function computeDartClockStats(
  events: GameEvent[],
  config: DartClockConfig,
  ctx: StatsContext,
): StatsResult {
  const mine = events
    .filter((e) => ctx.playerId === null || e.playerId === ctx.playerId)
    .sort((a, b) => a.tMs - b.tMs || (a.clientSeq ?? 0) - (b.clientSeq ?? 0));

  const runStart = mine.find((e) => e.type === 'run_start')?.tMs ?? mine[0]?.tMs ?? 0;
  const runEnd = mine.find((e) => e.type === 'run_end');

  const throws = mine
    .map((e) => toThrowRecord(e, runStart))
    .filter((t): t is ThrowRecord => t !== null);

  const hits = throws.filter((t) => t.isHit);
  const limitMs = config.timeLimitSec * 1000;

  // --- Fortschritt -------------------------------------------------------
  const numbersCleared = hits.length;
  const completed = numbersCleared >= config.highestTarget;
  const timeToComplete = completed ? hits[config.highestTarget - 1]?.tMs ?? null : null;

  // --- Zeitfenster -------------------------------------------------------
  const windowCount = Math.ceil(limitMs / WINDOW_MS);
  const windows: WindowBucket[] = Array.from({ length: windowCount }, (_, i) => ({
    fromSec: (i * WINDOW_MS) / 1000,
    throws: 0,
    hits: 0,
    hitRate: 0,
  }));
  for (const t of throws) {
    const i = Math.min(windowCount - 1, Math.floor(t.tMs / WINDOW_MS));
    if (i < 0) continue;
    windows[i].throws += 1;
    if (t.isHit) windows[i].hits += 1;
  }
  for (const w of windows) {
    w.hitRate = w.throws > 0 ? w.hits / w.throws : 0;
  }

  // --- Ziehzeiten --------------------------------------------------------
  // Dauer zwischen dem letzten Wurf einer Runde und dem ersten der nächsten.
  const retrievals: number[] = [];
  let openRetrieval: number | null = null;
  for (const e of mine) {
    if (e.type === 'retrieval_start') {
      openRetrieval = e.tMs;
    } else if (e.type === 'retrieval_end' && openRetrieval !== null) {
      retrievals.push(Math.max(0, e.tMs - openRetrieval));
      openRetrieval = null;
    }
  }
  const retrievalTotal = retrievals.reduce((sum, v) => sum + v, 0);
  const avgRetrieval = retrievals.length > 0 ? retrievalTotal / retrievals.length : 0;

  // --- Zeitbudget --------------------------------------------------------
  const elapsed = runEnd
    ? Math.max(0, runEnd.tMs - runStart)
    : throws.length > 0
      ? throws[throws.length - 1].tMs
      : 0;
  const activeMs = Math.max(0, elapsed - retrievalTotal);
  const retrievalShare = elapsed > 0 ? retrievalTotal / elapsed : 0;
  const throwsPerMinute = activeMs > 0 ? (throws.length / activeMs) * 60_000 : 0;

  // --- Fehler-Range ------------------------------------------------------
  const errors = throws
    .map((t) => t.errorSegments)
    .filter((d): d is number => d !== null);
  const avgError = errors.length > 0 ? errors.reduce((s, v) => s + v, 0) / errors.length : 0;
  const errorHistogram = Array.from({ length: 11 }, (_, d) => ({
    distance: d,
    count: errors.filter((e) => e === d).length,
  }));
  /** Würfe ganz ohne Feld – daneben, Draht, aus. */
  const offBoard = throws.filter((t) => !t.isHit && t.hitNumber === null).length;

  // --- Richtungs-Bias ----------------------------------------------------
  const signed = throws
    .map((t) => t.signedError)
    .filter((d): d is number => d !== null);
  const avgSigned = signed.length > 0 ? signed.reduce((s, v) => s + v, 0) / signed.length : 0;

  const verticalDeltas = throws
    .filter((t) => !t.isHit && t.hitNumber !== null)
    .map((t) => verticalPosition(t.hitNumber as number) - verticalPosition(t.target));
  const avgVertical =
    verticalDeltas.length > 0
      ? verticalDeltas.reduce((s, v) => s + v, 0) / verticalDeltas.length
      : 0;

  // --- Würfe je Zielzahl -------------------------------------------------
  const perTarget: TargetStat[] = [];
  for (let target = 1; target <= config.highestTarget; target++) {
    const attempts = throws.filter((t) => t.target === target);
    if (attempts.length === 0) continue;
    perTarget.push({
      target,
      throws: attempts.length,
      cleared: attempts.some((t) => t.isHit),
    });
  }

  // --- Heatmap -----------------------------------------------------------
  const heatmap: Record<string, number> = {};
  for (const t of throws) {
    if (t.hitNumber === null) continue;
    const key = `${t.hitNumber}-${t.ring ?? 'unbekannt'}`;
    heatmap[key] = (heatmap[key] ?? 0) + 1;
  }

  // --- Insights ----------------------------------------------------------
  const insights = buildInsights({
    throws: throws.length,
    numbersCleared,
    completed,
    highestTarget: config.highestTarget,
    avgSigned,
    avgVertical,
    avgRetrieval,
    retrievalShare,
    perTarget,
    avgError,
    offBoard,
    hasErrorData: errors.length > 0,
  });

  return {
    metrics: {
      numbersCleared,
      completed: completed ? 1 : 0,
      throws: throws.length,
      hits: hits.length,
      hitRate: throws.length > 0 ? round(hits.length / throws.length, 4) : 0,
      throwsPerMinute: round(throwsPerMinute, 2),
      avgRetrievalMs: round(avgRetrieval, 0),
      retrievalShare: round(retrievalShare, 4),
      activeMs: Math.round(activeMs),
      avgErrorSegments: round(avgError, 3),
      offBoard,
      // Nur gesetzt, wenn wirklich durchgespielt – sonst wäre es eine
      // Bestzeit, die niemand erreicht hat.
      timeToCompleteMs: timeToComplete ?? 0,
    },
    headline: completed
      ? `Alle ${config.highestTarget} in ${formatSec(timeToComplete ?? 0)}`
      : `Bis zur ${Math.min(numbersCleared + 1, config.highestTarget)} gekommen`,
    insights,
    detail: {
      windows,
      retrievals,
      errorHistogram,
      perTarget,
      heatmap,
      throwList: throws,
      avgSigned: round(avgSigned, 3),
      avgVertical: round(avgVertical, 3),
      elapsedMs: Math.round(elapsed),
    },
  };
}

function buildInsights(d: {
  throws: number;
  numbersCleared: number;
  completed: boolean;
  highestTarget: number;
  avgSigned: number;
  avgVertical: number;
  avgRetrieval: number;
  retrievalShare: number;
  perTarget: TargetStat[];
  avgError: number;
  offBoard: number;
  hasErrorData: boolean;
}): string[] {
  const out: string[] = [];

  if (d.throws === 0) return ['Keine Würfe aufgezeichnet.'];

  if (d.completed) {
    out.push(`Alle ${d.highestTarget} Zahlen innerhalb des Limits geschafft.`);
  } else {
    out.push(`${d.numbersCleared} von ${d.highestTarget} Zahlen geschafft.`);
  }

  // Richtungs-Bias nur behaupten, wenn er deutlich genug ist.
  if (d.hasErrorData && Math.abs(d.avgSigned) >= 0.6) {
    out.push(
      d.avgSigned > 0
        ? 'Fehlwürfe liegen überwiegend im Uhrzeigersinn neben dem Ziel.'
        : 'Fehlwürfe liegen überwiegend gegen den Uhrzeigersinn neben dem Ziel.',
    );
  }
  if (d.hasErrorData && Math.abs(d.avgVertical) >= 0.25) {
    out.push(
      d.avgVertical > 0 ? 'Die Würfe ziehen tendenziell nach oben.' : 'Die Würfe ziehen tendenziell nach unten.',
    );
  }
  if (d.hasErrorData && d.avgError > 0) {
    out.push(`Im Schnitt ${d.avgError.toFixed(1)} Segmente neben dem Ziel.`);
  }

  if (d.retrievalShare >= 0.3) {
    out.push(
      `${Math.round(d.retrievalShare * 100)} % der Zeit gingen fürs Pfeileholen drauf — da liegt mehr drin als im Werfen.`,
    );
  } else if (d.avgRetrieval > 0 && d.avgRetrieval < 8000) {
    out.push(`Zügig am Board: im Schnitt ${(d.avgRetrieval / 1000).toFixed(1)} s pro Ziehgang.`);
  }

  // Angstzahlen: deutlich über dem Durchschnitt.
  if (d.perTarget.length >= 4) {
    const avg = d.perTarget.reduce((s, t) => s + t.throws, 0) / d.perTarget.length;
    const hard = d.perTarget
      .filter((t) => t.throws >= Math.max(3, avg * 2))
      .map((t) => t.target);
    if (hard.length > 0) {
      out.push(
        `Hängengeblieben bei: ${hard.join(', ')} — deutlich mehr Würfe als bei den übrigen Zahlen.`,
      );
    }
  }

  if (d.offBoard > 0) {
    out.push(`${d.offBoard} Würfe ohne Feld (daneben, Draht oder aus).`);
  }

  return out;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function formatSec(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
