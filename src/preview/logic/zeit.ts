// Zeitrechnung für die Stundentabelle: Eingaben tolerant lesen („7“, „730“,
// „7.30“, „7h30“), Schichten über Mitternacht erkennen, mehrere Pausen.
import type { Pause } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function normalizeTime(input: string): string | null {
  let t = input.trim().toLowerCase().replace(/uhr/g, "").replace(/[.,h]/g, ":").trim();
  t = t.replace(/:+$/, "");
  if (t === "") return null;
  let h: number;
  let m: number;
  if (/^\d{1,2}:\d{1,2}$/.test(t)) {
    [h, m] = t.split(":").map(Number);
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2));
    m = Number(t.slice(-2));
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    m = 0;
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Ende vor oder gleich Beginn heißt: nach Mitternacht
export function istUeberMitternacht(start: string, ende: string): boolean {
  return Boolean(start && ende) && minutes(ende) <= minutes(start);
}

export function bruttoMinuten(start: string, ende: string): number {
  if (!start || !ende) return 0;
  const s = minutes(start);
  let e = minutes(ende);
  if (e <= s) e += 1440;
  return e - s;
}

export function pauseMinuten(pausen: Pause[]): number {
  let sum = 0;
  for (const p of pausen) {
    if (!p.von || !p.bis) continue;
    const v = minutes(p.von);
    let b = minutes(p.bis);
    if (b <= v) b += 1440;
    sum += b - v;
  }
  return sum;
}

export function nettoMinuten(start: string, ende: string, pausen: Pause[]): number {
  return Math.max(0, bruttoMinuten(start, ende) - pauseMinuten(pausen));
}

// Dezimalstunden auf zwei Stellen, wie sie in zvoove stehen
export function dezimal(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

export function gesamtzeit(start: string, ende: string, pausen: Pause[]): number {
  return dezimal(nettoMinuten(start, ende, pausen));
}

// Tag als fortlaufende Zahl, unabhängig von Zeitzonen
export function tagNummer(datum: string): number {
  const [y, m, d] = datum.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function addTage(datum: string, tage: number): string {
  const [y, m, d] = datum.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + tage));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Absolute Minuten seit Epoche – für Ruhezeit und Überschneidung
export function absStart(datum: string, start: string): number {
  return tagNummer(datum) * 1440 + minutes(start);
}

export function absEnde(datum: string, start: string, ende: string): number {
  return absStart(datum, start) + bruttoMinuten(start, ende);
}

export function formatDatumDE(datum: string): string {
  const [y, m, d] = datum.split("-");
  return `${d}.${m}.${y}`;
}

export function formatDezimal(n: number, stellen = 2): string {
  return n.toFixed(stellen).replace(".", ",");
}

export function formatEuro(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}
