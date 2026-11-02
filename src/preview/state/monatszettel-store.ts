"use client";
// Zustand des Monatszettel-Prototyps: nur im Browser (sessionStorage), getrennt vom übrigen Prototyp-Zustand.
// Nichts davon erreicht einen Server oder eine Datenbank.
import { useSyncExternalStore } from "react";
import { STANDARD_VORLAGE, beispielDaten, type MonatsKunde, type MonatsZettel } from "../logic/monatszettel";
import type { Crew } from "../logic/types";

export interface MzZustand {
  zettel: MonatsZettel[];
  kunden: MonatsKunde[];
  vorlage: string;
  // Zuletzt gewählter Kunde und Monat im Dashboard
  auswahlKunde: string;
  auswahlMonat: string;
}

const KEY = "pv-monatszettel-v1";
let zustand: MzZustand | null = null;
const lauscher = new Set<() => void>();

function lesen(): MzZustand | null {
  try {
    const roh = window.sessionStorage.getItem(KEY);
    return roh ? (JSON.parse(roh) as MzZustand) : null;
  } catch {
    return null;
  }
}

function speichern(): void {
  try {
    if (zustand) window.sessionStorage.setItem(KEY, JSON.stringify(zustand));
  } catch {
    // Speicher voll oder gesperrt: der Zustand bleibt im Tab erhalten
  }
}

export function startZustand(crew: Crew[], heute: string): MzZustand {
  const b = beispielDaten(crew, heute);
  return { zettel: b.zettel, kunden: b.kunden, vorlage: STANDARD_VORLAGE, auswahlKunde: b.kunden[0]?.kunde ?? "", auswahlMonat: b.kunden[0]?.monat ?? heute.slice(0, 7) };
}

function benachrichtige(): void {
  speichern();
  for (const l of lauscher) l();
}

export function setzeMz(fn: (z: MzZustand) => MzZustand): void {
  if (!zustand) return;
  zustand = fn(zustand);
  benachrichtige();
}

export function initialisiereMz(crew: Crew[], heute: string, zuruecksetzen = false): void {
  if (zuruecksetzen) {
    zustand = startZustand(crew, heute);
    benachrichtige();
    return;
  }
  if (zustand) return;
  zustand = lesen() ?? startZustand(crew, heute);
  benachrichtige();
}

function abonnieren(l: () => void): () => void {
  lauscher.add(l);
  return () => lauscher.delete(l);
}

// null, solange der Browser-Zustand noch nicht geladen ist (Server-Rendering)
export function useMz(): MzZustand | null {
  return useSyncExternalStore(abonnieren, () => zustand, () => null);
}
