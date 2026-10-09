// Gültigkeit und Pflicht der Unterweisungen (Modul C).
// 12 Monate gültig, Erinnerung 14 Tage vorher, Quiz ab 80 %.
import type { Taetigkeit, UnterweisungAck } from "./types";
import { addTage, tagNummer } from "./zeit";

export const GUELTIG_MONATE = 12;
export const ERINNERUNG_TAGE = 14;
export const QUIZ_SCHWELLE = 0.8;

export type ModulId = "grund" | "stagehand" | "catering" | "stapler" | "hoehe" | "elektrik" | "einlass" | "brandschutz";

export const MODUL_IDS: ModulId[] = ["grund", "stagehand", "catering", "stapler", "hoehe", "elektrik", "einlass", "brandschutz"];

// Welche Module für welche Tätigkeit Pflicht sind (Plan, Abschnitt 6)
const PFLICHT_JE_TAETIGKEIT: Record<Taetigkeit, ModulId[]> = {
  Stagehand: ["stagehand", "elektrik"],
  Catering: ["catering"],
  Bar: ["catering"],
  Einlass: ["einlass"],
  Stapler: ["stapler"],
  Messebau: ["stagehand", "elektrik"],
  Promotion: [],
  Logistik: ["stagehand"],
};

// Grundunterweisung und Brandschutz gelten für alle; „Höhe und Leitern“ nur,
// wenn es im Auftrag hinterlegt ist.
export function pflichtModule(taetigkeiten: Taetigkeit[], optionen: { hoehe?: boolean } = {}): ModulId[] {
  const set = new Set<ModulId>(["grund", "brandschutz"]);
  for (const t of taetigkeiten) for (const m of PFLICHT_JE_TAETIGKEIT[t] ?? []) set.add(m);
  if (optionen.hoehe) set.add("hoehe");
  return MODUL_IDS.filter((m) => set.has(m));
}

export function ablaufDatum(bestaetigtAm: string, monate = GUELTIG_MONATE): string {
  const [y, m, d] = bestaetigtAm.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + monate, d));
  // 31. Januar + 1 Monat darf nicht im März landen
  if (dt.getUTCDate() !== d) dt.setUTCDate(0);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export type UnterweisungStatus = "fehlt" | "gueltig" | "laeuftBaldAb" | "abgelaufen";

export function statusFuer(ack: UnterweisungAck | undefined, heute: string): UnterweisungStatus {
  if (!ack) return "fehlt";
  const ablauf = ablaufDatum(ack.bestaetigtAm);
  if (ablauf < heute) return "abgelaufen";
  return tagNummer(ablauf) - tagNummer(heute) <= ERINNERUNG_TAGE ? "laeuftBaldAb" : "gueltig";
}

export function istGueltig(ack: UnterweisungAck | undefined, heute: string): boolean {
  const s = statusFuer(ack, heute);
  return s === "gueltig" || s === "laeuftBaldAb";
}

export function fehlendeModule(pflicht: ModulId[], acks: Record<string, UnterweisungAck>, heute: string): ModulId[] {
  return pflicht.filter((m) => !istGueltig(acks[m], heute));
}

export function erinnerungAm(bestaetigtAm: string): string {
  return addTage(ablaufDatum(bestaetigtAm), -ERINNERUNG_TAGE);
}

export function quizBestanden(richtig: number, gesamt: number): boolean {
  return gesamt > 0 && richtig / gesamt >= QUIZ_SCHWELLE;
}

// Gemischte Reihenfolge, reproduzierbar je Versuch (kein Math.random, damit
// der Prototyp und die Tests dasselbe zeigen)
export function mischen<T>(liste: T[], seed: number): T[] {
  const a = [...liste];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
