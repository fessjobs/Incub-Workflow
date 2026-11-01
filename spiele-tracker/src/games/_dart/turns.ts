import type { GameEvent } from '../types';
import type { Segment } from './segments';

/**
 * Geteilte Rundenlogik für alle Dartspiele mit festem Aufnahme-Rhythmus
 * (501, Cricket, Shanghai): drei Pfeile, dann ist der Nächste dran.
 *
 * Round the Clock nutzt das bewusst nicht — dort läuft eine Uhr pro Spieler
 * statt einer Aufnahme pro Runde.
 */

export interface DartThrow {
  eventId: number | undefined;
  playerId: string | null;
  segment: Segment | null;
  tMs: number;
}

export function readThrow(event: GameEvent): DartThrow | null {
  if (event.type !== 'throw') return null;
  const payload = event.payload as { segment?: { number: number; ring: string } | null };
  const seg = payload.segment;
  return {
    eventId: event.id ?? event.localId,
    playerId: event.playerId,
    segment: seg ? { number: seg.number, ring: seg.ring as Segment['ring'] } : null,
    tMs: event.tMs,
  };
}

/**
 * Alle Würfe in Reihenfolge, Korrekturen und zurückgenommene Würfe
 * herausgerechnet.
 *
 * Zurücknehmen heißt im append-only Log nicht löschen, sondern ein
 * Streich-Event anhängen (`voidsTarget`). Deshalb muss hier gefiltert werden.
 */
export function orderedThrows(events: GameEvent[]): DartThrow[] {
  const voided = new Set<number>();
  for (const e of events) {
    if (e.voidsTarget && e.correctsEventId != null) voided.add(e.correctsEventId);
    if (e.voidsTarget && e.payload && typeof e.payload.voidsLocalId === 'number') {
      voided.add(e.payload.voidsLocalId as number);
    }
  }

  return events
    .slice()
    .sort((a, b) => a.tMs - b.tMs || (a.clientSeq ?? 0) - (b.clientSeq ?? 0))
    .filter((e) => e.type === 'throw' && !e.voidsTarget)
    .filter((e) => {
      const id = e.id ?? e.localId;
      return id === undefined || !voided.has(id);
    })
    .map(readThrow)
    .filter((t): t is DartThrow => t !== null);
}

/**
 * Die Würfe der laufenden Aufnahme des aktuellen Spielers.
 *
 * Ist die Aufnahme gerade voll geworden, kommen genau diese Pfeile zurück und
 * nicht ein leeres Array. Zwei Gründe: man will nach dem dritten Pfeil noch
 * sehen, was man geworfen hat, und die Oberfläche muss "Aufnahme fertig" von
 * "neue Aufnahme" unterscheiden können, um den Weiter-Knopf zu zeigen.
 *
 * Der nächste Wurf beginnt automatisch eine neue Aufnahme, weil der Rest der
 * Division dann wieder bei eins steht.
 */
export function currentTurnThrows(
  throws: DartThrow[],
  playerId: string | null,
  dartsPerTurn: number,
): DartThrow[] {
  const mine = throws.filter((t) => t.playerId === playerId);
  if (mine.length === 0) return [];
  const inTurn = mine.length % dartsPerTurn;
  const take = inTurn === 0 ? dartsPerTurn : inTurn;
  return mine.slice(mine.length - take);
}

/** Wie viele vollständige Aufnahmen hat dieser Spieler geworfen? */
export function completedTurns(
  throws: DartThrow[],
  playerId: string | null,
  dartsPerTurn: number,
): number {
  return Math.floor(throws.filter((t) => t.playerId === playerId).length / dartsPerTurn);
}

/** Würfe eines Spielers in Aufnahmen zerlegt. */
export function groupIntoTurns(throws: DartThrow[], dartsPerTurn: number): DartThrow[][] {
  const turns: DartThrow[][] = [];
  for (let i = 0; i < throws.length; i += dartsPerTurn) {
    turns.push(throws.slice(i, i + dartsPerTurn));
  }
  return turns;
}
