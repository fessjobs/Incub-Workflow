/**
 * Das Segmentmodell eines Dartboards.
 *
 * Geteilte Grundlage für alle Dart-Spiele. Hier steht bewusst keine
 * Spielregel — nur, wie ein Board aufgebaut ist.
 */

/** Die Zahlen im Uhrzeigersinn, beginnend oben bei der 20. */
export const BOARD_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export type Ring = 'single-inner' | 'triple' | 'single-outer' | 'double' | 'bull' | 'bullseye';

/** Ein getroffenes Feld. `number` ist 0 für Bull und Bullseye. */
export interface Segment {
  number: number;
  ring: Ring;
}

export const BULL: Segment = { number: 0, ring: 'bull' };
export const BULLSEYE: Segment = { number: 0, ring: 'bullseye' };

/** Punktwert nach normalen Dartregeln. */
export function segmentScore(seg: Segment): number {
  switch (seg.ring) {
    case 'bullseye':
      return 50;
    case 'bull':
      return 25;
    case 'double':
      return seg.number * 2;
    case 'triple':
      return seg.number * 3;
    default:
      return seg.number;
  }
}

export function segmentLabel(seg: Segment): string {
  switch (seg.ring) {
    case 'bullseye':
      return 'Bullseye';
    case 'bull':
      return 'Bull';
    case 'double':
      return `D${seg.number}`;
    case 'triple':
      return `T${seg.number}`;
    default:
      return String(seg.number);
  }
}

/** Position einer Zahl auf dem Kranz, oder -1 für Bull. */
export function ringIndex(number: number): number {
  return BOARD_ORDER.indexOf(number as (typeof BOARD_ORDER)[number]);
}

/**
 * Abstand zweier Zahlen in Segmenten auf dem Kranz — nicht die numerische
 * Differenz.
 *
 * Das ist der Kern der Fehler-Range-Statistik: Wer auf die 20 zielt und die 1
 * trifft, lag ein Segment daneben, nicht neunzehn. Wer die 19 trifft, lag
 * sieben Segmente daneben, obwohl die Zahl nah aussieht.
 *
 * Ergebnis liegt zwischen 0 und 10. Bull zählt nicht mit (-1), weil es keine
 * Position auf dem Kranz hat.
 */
export function ringDistance(a: number, b: number): number {
  const ia = ringIndex(a);
  const ib = ringIndex(b);
  if (ia < 0 || ib < 0) return -1;
  const raw = Math.abs(ia - ib);
  return Math.min(raw, BOARD_ORDER.length - raw);
}

/**
 * Wie ringDistance, aber mit Richtung: positiv im Uhrzeigersinn, negativ
 * gegen den Uhrzeigersinn. Grundlage für den Richtungs-Bias ("streut
 * systematisch nach rechts").
 *
 * Bei genau gegenüberliegenden Zahlen (Abstand 10) ist die Richtung nicht
 * definiert; dort kommt 10 zurück.
 */
export function signedRingDistance(from: number, to: number): number {
  const ia = ringIndex(from);
  const ib = ringIndex(to);
  if (ia < 0 || ib < 0) return 0;

  let diff = ib - ia;
  const n = BOARD_ORDER.length;
  if (diff > n / 2) diff -= n;
  if (diff < -n / 2) diff += n;
  return diff;
}

/**
 * Liegt die Zahl auf der oberen oder unteren Hälfte des Boards?
 * Die 20 steht oben, die 3 unten. Für die Aussage "zieht nach unten".
 */
export function verticalHalf(number: number): 'oben' | 'unten' | 'mitte' {
  const i = ringIndex(number);
  if (i < 0) return 'mitte';
  // Winkel der Sektormitte, 0° = oben, im Uhrzeigersinn.
  const angle = i * 18;
  if (angle === 90 || angle === 270) return 'mitte';
  return angle < 90 || angle > 270 ? 'oben' : 'unten';
}

/**
 * Winkel der Sektormitte in Grad, 0° = oben, im Uhrzeigersinn wachsend.
 * Basis für die Frage, ob Fehlwürfe eher oben oder unten landen.
 */
export function sectorAngleDeg(number: number): number {
  const i = ringIndex(number);
  return i < 0 ? 0 : i * 18;
}

/**
 * Höhe einer Zahl auf dem Board: 1 ist ganz oben (20), -1 ganz unten (3).
 * Die Differenz zweier Werte sagt, ob ein Fehlwurf höher oder tiefer lag.
 */
export function verticalPosition(number: number): number {
  return Math.cos((sectorAngleDeg(number) * Math.PI) / 180);
}

/** Nachbarn einer Zahl auf dem Kranz, gegen und im Uhrzeigersinn. */
export function neighbours(number: number): [number, number] {
  const i = ringIndex(number);
  const n = BOARD_ORDER.length;
  if (i < 0) return [0, 0];
  return [BOARD_ORDER[(i - 1 + n) % n], BOARD_ORDER[(i + 1) % n]];
}

/**
 * Alle 82 antippbaren Felder: 20 Zahlen mal vier Ringe, plus Bull und
 * Bullseye.
 */
export function allSegments(): Segment[] {
  const out: Segment[] = [];
  for (const number of BOARD_ORDER) {
    out.push({ number, ring: 'single-inner' });
    out.push({ number, ring: 'triple' });
    out.push({ number, ring: 'single-outer' });
    out.push({ number, ring: 'double' });
  }
  out.push(BULL, BULLSEYE);
  return out;
}

/** Maße eines Wettkampfboards in Millimetern, vom Mittelpunkt aus. */
export const BOARD_MM = {
  bullseye: 6.35,
  bull: 15.9,
  tripleInner: 99,
  tripleOuter: 107,
  doubleInner: 162,
  doubleOuter: 170,
} as const;
