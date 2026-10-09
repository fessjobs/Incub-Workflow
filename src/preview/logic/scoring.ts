// Fragebogen-Scoring (Modul D). Intern: die Crew sieht nur Level und XP,
// nicht Kategorie und Score. Gewichte und Schwellen sind Einstellungen.
import type { Kategorie, NachweisStatus, ProfileAnswers, Rating, Taetigkeit } from "./types";
import { TAETIGKEITEN } from "./types";
import { SITUATIONSFRAGEN } from "./fragen";

export interface ScoringSettings {
  // relative Gewichte der vier Blöcke (Standard 40/20/20/20)
  gewicht: { erfahrung: number; mobilitaet: number; qualifikation: number; situation: number };
  schwelleA: number;
  schwelleB: number;
  // Echte Einsatzleistung überschreibt den Fragebogen schrittweise:
  // höchstens dieser Anteil, erreicht nach so vielen Einsätzen
  leistungMaxAnteil: number;
  leistungEinsaetzeFuerMax: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  gewicht: { erfahrung: 40, mobilitaet: 20, qualifikation: 20, situation: 20 },
  schwelleA: 70,
  schwelleB: 45,
  leistungMaxAnteil: 0.7,
  leistungEinsaetzeFuerMax: 20,
};

export interface ScoreBlock {
  key: "erfahrung" | "mobilitaet" | "qualifikation" | "situation";
  label: string;
  quote: number; // 0..1
  punkte: number; // 0..gewicht (auf 100 normiert)
  maximal: number;
  details: string[];
}

export interface ScoreErgebnis {
  blocks: ScoreBlock[];
  gesamt: number; // 0..100
  kategorie: Kategorie;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function nachweisFaktor(s: NachweisStatus): number {
  return s === "geprueft" ? 1 : s === "angegeben" ? 0.5 : 0;
}

export function besucherBand(besucher: number): number {
  if (besucher >= 20000) return 1;
  if (besucher >= 5000) return 0.7;
  if (besucher >= 500) return 0.35;
  return 0;
}

export function erfahrungQuote(p: ProfileAnswers): { quote: number; details: string[] } {
  const werte = TAETIGKEITEN.map((t) => {
    const e = p.erfahrung[t] ?? { jahre: 0, einsaetze: 0 };
    return { t, wert: clamp01((e.einsaetze + 6 * e.jahre) / 30) };
  }).sort((a, b) => b.wert - a.wert);
  const top3 = werte.slice(0, 3);
  const schnitt = top3.reduce((n, w) => n + w.wert, 0) / 3;
  const band = besucherBand(p.groessteVeranstaltung);
  return {
    quote: clamp01(0.8 * schnitt + 0.2 * band),
    details: [...top3.filter((w) => w.wert > 0).map((w) => `${w.t}: ${Math.round(w.wert * 100)} %`), `Größte Veranstaltung ${p.groessteVeranstaltung.toLocaleString("de-DE")} Besucher`],
  };
}

export function mobilitaetQuote(p: ProfileAnswers): { quote: number; details: string[] } {
  let pts = 0;
  const details: string[] = [];
  if (p.fuehrerschein) { pts += 4; details.push("Führerschein B (+4)"); }
  if (p.eigenesAuto) { pts += 6; details.push("Eigenes Auto (+6)"); }
  const anfahrt = p.maxAnfahrtMin >= 90 ? 6 : p.maxAnfahrtMin >= 60 ? 4 : p.maxAnfahrtMin >= 30 ? 2 : 0;
  pts += anfahrt;
  details.push(`Anfahrt bis ${p.maxAnfahrtMin} min (+${anfahrt})`);
  if (p.uebernachtungOk) { pts += 2; details.push("Übernachtung ok (+2)"); }
  if (p.fahrgemeinschaft) { pts += 2; details.push("Fahrgemeinschaft (+2)"); }
  return { quote: clamp01(pts / 20), details };
}

// Geprüft zählt voll, nur angegeben die Hälfte
export function qualifikationQuote(p: ProfileAnswers): { quote: number; details: string[] } {
  const gewichte = { stapler: 6, ersthelfer: 4, hygiene: 4, paragraph34a: 4 } as const;
  const namen = { stapler: "Staplerschein", ersthelfer: "Ersthelfer", hygiene: "Hygienebelehrung IfSG", paragraph34a: "§ 34a" } as const;
  let pts = 0;
  const details: string[] = [];
  for (const k of Object.keys(gewichte) as Array<keyof typeof gewichte>) {
    const f = nachweisFaktor(p.nachweise[k]);
    pts += gewichte[k] * f;
    if (f > 0) details.push(`${namen[k]} ${f === 1 ? "geprüft" : "angegeben"} (+${gewichte[k] * f})`);
  }
  const psa = Object.values(p.ausruestung).filter(Boolean).length;
  pts += (psa / 6) * 2;
  details.push(`Ausrüstung ${psa} von 6 (+${((psa / 6) * 2).toFixed(1).replace(".", ",")})`);
  return { quote: clamp01(pts / 20), details };
}

export function situationQuote(p: ProfileAnswers): { quote: number; details: string[] } {
  let pts = 0;
  const details: string[] = [];
  SITUATIONSFRAGEN.forEach((f, i) => {
    const gewaehlt = p.situation[i];
    const o = gewaehlt === undefined ? null : f.optionen[gewaehlt];
    const punkte = o?.punkte ?? 0;
    pts += punkte;
    details.push(`Frage ${i + 1}: ${punkte} von 5`);
  });
  return { quote: clamp01(pts / (SITUATIONSFRAGEN.length * 5)), details };
}

export function kategorieFuer(gesamt: number, s: ScoringSettings): Kategorie {
  return gesamt >= s.schwelleA ? "A" : gesamt >= s.schwelleB ? "B" : "C";
}

export function scoreProfile(p: ProfileAnswers, s: ScoringSettings = DEFAULT_SCORING): ScoreErgebnis {
  const e = erfahrungQuote(p);
  const m = mobilitaetQuote(p);
  const q = qualifikationQuote(p);
  const sit = situationQuote(p);
  const g = s.gewicht;
  const summe = g.erfahrung + g.mobilitaet + g.qualifikation + g.situation || 1;
  const block = (key: ScoreBlock["key"], label: string, quote: number, gewicht: number, details: string[]): ScoreBlock => ({
    key,
    label,
    quote,
    maximal: Math.round((gewicht / summe) * 1000) / 10,
    punkte: Math.round(quote * (gewicht / summe) * 1000) / 10,
    details,
  });
  const blocks = [
    block("erfahrung", "Erfahrung", e.quote, g.erfahrung, e.details),
    block("mobilitaet", "Mobilität", m.quote, g.mobilitaet, m.details),
    block("qualifikation", "Qualifikation", q.quote, g.qualifikation, q.details),
    block("situation", "Situationsfragen", sit.quote, g.situation, sit.details),
  ];
  const gesamt = Math.round(blocks.reduce((n, b) => n + b.punkte, 0) * 10) / 10;
  return { blocks, gesamt, kategorie: kategorieFuer(gesamt, s) };
}

// Leistungs-Score aus echten Einsätzen (0..100): Durchschnitt der Bewertungen,
// pünktlich und Einsatz stärker gewichtet als Teamwork
export function leistungScore(ratings: Rating[]): number | null {
  if (ratings.length === 0) return null;
  const mw = (f: (r: Rating) => number) => ratings.reduce((n, r) => n + f(r), 0) / ratings.length;
  const wert = 0.4 * mw((r) => r.puenktlich) + 0.4 * mw((r) => r.einsatz) + 0.2 * mw((r) => r.teamwork);
  return Math.round(((wert - 1) / 4) * 1000) / 10;
}

// Der Fragebogen zählt am Anfang voll; mit jedem Einsatz wächst der Anteil der
// echten Leistung bis zum Höchstanteil.
export function effektiverScore(fragebogen: number, einsaetze: number, ratings: Rating[], s: ScoringSettings = DEFAULT_SCORING): { score: number; anteilLeistung: number } {
  const leistung = leistungScore(ratings);
  if (leistung === null) return { score: fragebogen, anteilLeistung: 0 };
  const anteil = Math.min(s.leistungMaxAnteil, (einsaetze / s.leistungEinsaetzeFuerMax) * s.leistungMaxAnteil);
  return { score: Math.round(((1 - anteil) * fragebogen + anteil * leistung) * 10) / 10, anteilLeistung: Math.round(anteil * 100) / 100 };
}

export function leereErfahrung(): Record<Taetigkeit, { jahre: number; einsaetze: number }> {
  return Object.fromEntries(TAETIGKEITEN.map((t) => [t, { jahre: 0, einsaetze: 0 }])) as Record<Taetigkeit, { jahre: number; einsaetze: number }>;
}
