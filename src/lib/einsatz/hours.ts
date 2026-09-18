// Stundenberechnung: Ist-Zeiten (UTC), Pausen, Aufteilung auf Berliner
// Kalendertage und Zeitfenster (Nacht). Schichten über Mitternacht werden
// über absolute Zeitpunkte korrekt behandelt.
import { addDaysToKey, berlinDateKey, fromBerlin, toBerlin } from "./tz";

export type Segment = { start: Date; end: Date };

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

// Netto-Arbeitsstunden = Brutto minus Pause, auf 2 Nachkommastellen
export function netHours(start: Date, end: Date, pauseMinuten: number): number {
  const gross = minutesBetween(start, end);
  const net = Math.max(0, gross - Math.max(0, pauseMinuten));
  return round2(net / 60);
}

// Zerlegt ein Intervall in Stücke je Berliner Kalendertag
export function splitByBerlinDay(start: Date, end: Date): Array<{ dateKey: string; weekday: number; minutes: number; start: Date; end: Date }> {
  const out: Array<{ dateKey: string; weekday: number; minutes: number; start: Date; end: Date }> = [];
  if (end <= start) return out;
  let cursor = start;
  let guard = 0;
  while (cursor < end && guard++ < 60) {
    const dateKey = berlinDateKey(cursor);
    const nextMidnight = fromBerlin(addDaysToKey(dateKey, 1), "00:00");
    const segEnd = nextMidnight < end ? nextMidnight : end;
    out.push({
      dateKey,
      weekday: toBerlin(cursor).weekday,
      minutes: minutesBetween(cursor, segEnd),
      start: cursor,
      end: segEnd,
    });
    cursor = segEnd;
  }
  return out;
}

function overlapMinutes(a: Segment, b: Segment): number {
  const s = Math.max(a.start.getTime(), b.start.getTime());
  const e = Math.min(a.end.getTime(), b.end.getTime());
  return e > s ? Math.round((e - s) / 60000) : 0;
}

export type TimeWindow = { von: string; bis: string }; // "HH:mm", bis <= von = über Mitternacht

// Minuten des Intervalls, die in einem täglichen Wandzeit-Fenster liegen
// (z. B. 23:00–06:00). Fenster über Mitternacht werden je Tag in zwei Stücke
// zerlegt (23:00–24:00 und 00:00–06:00).
export function minutesInWindows(start: Date, end: Date, windows: TimeWindow[]): number {
  if (end <= start || windows.length === 0) return 0;
  const firstKey = addDaysToKey(berlinDateKey(start), -1);
  const lastKey = addDaysToKey(berlinDateKey(end), 1);
  const interval: Segment = { start, end };
  let total = 0;
  let key = firstKey;
  let guard = 0;
  while (key <= lastKey && guard++ < 60) {
    for (const w of windows) {
      const segments: Segment[] = [];
      if (w.bis > w.von) {
        segments.push({ start: fromBerlin(key, w.von), end: fromBerlin(key, w.bis) });
      } else {
        // über Mitternacht: von–24:00 und 00:00–bis (am selben Tag)
        segments.push({ start: fromBerlin(key, w.von), end: fromBerlin(addDaysToKey(key, 1), "00:00") });
        if (w.bis !== "00:00") segments.push({ start: fromBerlin(key, "00:00"), end: fromBerlin(key, w.bis) });
      }
      for (const seg of segments) total += overlapMinutes(interval, seg);
    }
    key = addDaysToKey(key, 1);
  }
  return total;
}

// Brutto-Minuten je Kalendertag, gefiltert nach Prädikat (Sonntag/Feiertag)
export function minutesOnDays(start: Date, end: Date, predicate: (dateKey: string, weekday: number) => boolean): number {
  return splitByBerlinDay(start, end)
    .filter((s) => predicate(s.dateKey, s.weekday))
    .reduce((sum, s) => sum + s.minutes, 0);
}

// Pausen werden anteilig auf alle Minuten verteilt: Faktor Netto/Brutto
export function netFactor(start: Date, end: Date, pauseMinuten: number): number {
  const gross = minutesBetween(start, end);
  if (gross === 0) return 0;
  return Math.max(0, gross - Math.max(0, pauseMinuten)) / gross;
}
