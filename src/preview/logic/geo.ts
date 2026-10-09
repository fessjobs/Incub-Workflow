// Demo-Geocoding: eine kleine Tabelle statt eines Dienstes. Das genügt, um
// Entfernung, Fahrzeit und Pool im Prototyp zu zeigen. In der echten
// Umsetzung ersetzt ein Geocoding-Dienst diese Datei (Entscheidung offen).
import type { Pool } from "./types";

export interface Ort {
  name: string;
  lat: number;
  lng: number;
}

// Erste zwei Ziffern der PLZ → Ort; 557 überschreibt für Idar-Oberstein
const PLZ_ORTE: Record<string, Ort> = {
  "70": { name: "Stuttgart", lat: 48.7758, lng: 9.1829 },
  "71": { name: "Böblingen", lat: 48.6827, lng: 9.0118 },
  "72": { name: "Reutlingen", lat: 48.4914, lng: 9.2043 },
  "73": { name: "Göppingen", lat: 48.7033, lng: 9.652 },
  "74": { name: "Heilbronn", lat: 49.1427, lng: 9.2109 },
  "75": { name: "Pforzheim", lat: 48.8922, lng: 8.6946 },
  "76": { name: "Karlsruhe", lat: 49.0069, lng: 8.4037 },
  "68": { name: "Mannheim", lat: 49.4875, lng: 8.466 },
  "69": { name: "Heidelberg", lat: 49.3988, lng: 8.6724 },
  "60": { name: "Frankfurt", lat: 50.1109, lng: 8.6821 },
  "63": { name: "Offenbach", lat: 50.1055, lng: 8.7612 },
  "64": { name: "Darmstadt", lat: 49.8728, lng: 8.6512 },
  "65": { name: "Wiesbaden", lat: 50.0826, lng: 8.2398 },
  "55": { name: "Mainz", lat: 49.9929, lng: 8.2473 },
  "66": { name: "Saarbrücken", lat: 49.2402, lng: 6.9969 },
  "54": { name: "Trier", lat: 49.7596, lng: 6.6439 },
  "50": { name: "Köln", lat: 50.9375, lng: 6.9603 },
  "40": { name: "Düsseldorf", lat: 51.2277, lng: 6.7735 },
  "44": { name: "Dortmund", lat: 51.5136, lng: 7.4653 },
  "45": { name: "Essen", lat: 51.4556, lng: 7.0116 },
  "47": { name: "Duisburg", lat: 51.4344, lng: 6.7623 },
  "53": { name: "Bonn", lat: 50.7374, lng: 7.0982 },
  "89": { name: "Ulm", lat: 48.4011, lng: 9.9876 },
  "97": { name: "Würzburg", lat: 49.7913, lng: 9.9534 },
};

export const POOLS: Record<Pool, Ort> = {
  Stuttgart: { name: "Stuttgart", lat: 48.7758, lng: 9.1829 },
  Mannheim: { name: "Mannheim", lat: 49.4875, lng: 8.466 },
  Frankfurt: { name: "Frankfurt", lat: 50.1109, lng: 8.6821 },
  "Idar-Oberstein": { name: "Idar-Oberstein", lat: 49.7127, lng: 7.3088 },
  NRW: { name: "Düsseldorf (NRW)", lat: 51.2277, lng: 6.7735 },
};

export function geocodePlz(plz: string): Ort | null {
  const p = plz.trim();
  if (!/^\d{5}$/.test(p)) return null;
  if (p.startsWith("557")) return { name: "Idar-Oberstein", lat: 49.7127, lng: 7.3088 };
  return PLZ_ORTE[p.slice(0, 2)] ?? null;
}

export function distanzKm(a: Ort, b: Ort): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Grobe Fahrzeit mit dem Auto: Luftlinie × Umwegfaktor, Landstraßen-/Autobahnmix
export function fahrminuten(a: Ort, b: Ort): number {
  const km = distanzKm(a, b) * 1.25;
  return Math.round((km / 85) * 60 + 4);
}

export function naechsterPool(ort: Ort): { pool: Pool; minuten: number } {
  let best: { pool: Pool; minuten: number } | null = null;
  for (const [pool, poolOrt] of Object.entries(POOLS) as Array<[Pool, Ort]>) {
    const minuten = fahrminuten(ort, poolOrt);
    if (!best || minuten < best.minuten) best = { pool, minuten };
  }
  return best as { pool: Pool; minuten: number };
}

// Fahrzeit zu allen Pools – wird beim Fragebogen einmal berechnet und gespeichert
export function poolZeiten(ort: Ort): Record<Pool, number> {
  const out = {} as Record<Pool, number>;
  for (const [pool, poolOrt] of Object.entries(POOLS) as Array<[Pool, Ort]>) out[pool] = fahrminuten(ort, poolOrt);
  return out;
}
