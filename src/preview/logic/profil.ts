// Vom Fragebogen zum Profil: Antworten (so wie die Oberfläche sie hält) in die
// Form des Datenmodells (`profile_answers`) übersetzen und Pflichtfragen
// prüfen. Zwischenspeichern heißt: jede Antwort sofort im Zustand, die
// Etappe merkt sich der Fortschritt.
import type { NachweisStatus, ProfileAnswers, Taetigkeit, Vertragsart } from "./types";
import { TAETIGKEITEN } from "./types";
import { FRAGEN, SITUATIONSFRAGEN } from "./fragen";
import { leereErfahrung } from "./scoring";

export interface Antworten {
  vorname: string;
  nachname: string;
  handy: string;
  email: string;
  plz: string;
  wohnort: string;
  sprachen: ProfileAnswers["sprachen"];
  volljaehrig: boolean | null;
  fuehrerschein: boolean | null;
  eigenesAuto: boolean | null;
  maxAnfahrtMin: number | null;
  uebernachtungOk: boolean | null;
  fahrgemeinschaft: boolean | null;
  erfahrung: Record<Taetigkeit, { jahre: number; einsaetze: number }>;
  groessteVeranstaltung: number | null;
  fruehereFirmen: string;
  nachweis_stapler: NachweisStatus;
  nachweis_ersthelfer: NachweisStatus;
  nachweis_hygiene: NachweisStatus;
  nachweis_34a: NachweisStatus;
  ausr_s3: boolean | null;
  ausr_handschuhe: boolean | null;
  ausr_helm: boolean | null;
  ausr_warnweste: boolean | null;
  ausr_schwarz: boolean | null;
  ausr_werkzeug: boolean | null;
  shirt: string;
  schuhgroesse: string;
  // Arbeitskleidung gegen Pfand: Wunsch, gewählte Artikel (IDs aus den Einstellungen), Hosengröße
  kleidungWunsch: boolean | null;
  kleidungArtikel: string[];
  hosengroesse: string;
  wunschVertrag: Vertragsart | "";
  wochentage: string[];
  nachtOk: boolean | null;
  wunschStundenMonat: number | null;
  aktuellerStatus: string;
  andereArbeitgeber: boolean | null;
  // gewählter Optionsindex je Situationsfrage, null = noch offen
  situation: Array<number | null>;
}

export function leereAntworten(): Antworten {
  return {
    vorname: "", nachname: "", handy: "", email: "", plz: "", wohnort: "", sprachen: [{ sprache: "Deutsch", niveau: "fließend" }],
    volljaehrig: null, fuehrerschein: null, eigenesAuto: null, maxAnfahrtMin: null, uebernachtungOk: null, fahrgemeinschaft: null,
    erfahrung: leereErfahrung(), groessteVeranstaltung: null, fruehereFirmen: "",
    nachweis_stapler: "keiner", nachweis_ersthelfer: "keiner", nachweis_hygiene: "keiner", nachweis_34a: "keiner",
    ausr_s3: null, ausr_handschuhe: null, ausr_helm: null, ausr_warnweste: null, ausr_schwarz: null, ausr_werkzeug: null,
    shirt: "", schuhgroesse: "", kleidungWunsch: null, kleidungArtikel: [], hosengroesse: "", wunschVertrag: "", wochentage: [], nachtOk: null, wunschStundenMonat: null, aktuellerStatus: "", andereArbeitgeber: null,
    situation: SITUATIONSFRAGEN.map(() => null),
  };
}

export function antwortenZuProfil(a: Antworten): ProfileAnswers {
  return {
    volljaehrig: a.volljaehrig === true,
    sprachen: a.sprachen,
    fuehrerschein: a.fuehrerschein === true,
    eigenesAuto: a.eigenesAuto === true,
    maxAnfahrtMin: a.maxAnfahrtMin ?? 0,
    uebernachtungOk: a.uebernachtungOk === true,
    fahrgemeinschaft: a.fahrgemeinschaft === true,
    erfahrung: a.erfahrung,
    groessteVeranstaltung: a.groessteVeranstaltung ?? 0,
    fruehereFirmen: a.fruehereFirmen,
    nachweise: { stapler: a.nachweis_stapler, ersthelfer: a.nachweis_ersthelfer, hygiene: a.nachweis_hygiene, paragraph34a: a.nachweis_34a },
    ausruestung: { s3Schuhe: a.ausr_s3 === true, handschuhe: a.ausr_handschuhe === true, helm: a.ausr_helm === true, warnweste: a.ausr_warnweste === true, schwarzeKleidung: a.ausr_schwarz === true, werkzeug: a.ausr_werkzeug === true },
    shirtgroesse: a.shirt || "M",
    schuhgroesse: a.schuhgroesse || undefined,
    kleidung: { wunsch: a.kleidungWunsch === true, artikel: a.kleidungWunsch === true ? a.kleidungArtikel : [], hosengroesse: a.hosengroesse },
    wunschVertrag: (a.wunschVertrag || "Minijob") as Vertragsart,
    wochentage: a.wochentage.map(Number),
    nachtOk: a.nachtOk === true,
    wunschStundenMonat: a.wunschStundenMonat ?? 0,
    aktuellerStatus: a.aktuellerStatus,
    andereArbeitgeber: a.andereArbeitgeber === true,
    situation: a.situation.map((s) => s ?? -1),
  };
}

function leer(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

// Welche Pflichtfragen der Etappe sind noch offen? (Frage-IDs des Fragebogens)
export function offenePflicht(a: Antworten, etappe: number): string[] {
  return FRAGEN.filter((f) => f.etappe === etappe && f.pflicht && leer((a as unknown as Record<string, unknown>)[f.id])).map((f) => f.id);
}

// Arbeitskleidung: Wer sie möchte, wählt mindestens einen Artikel und gibt die dafür nötigen Größen an.
// `artikel` kommt aus den Einstellungen (Dashboard); der Server prüft mit derselben Funktion.
export function kleidungFehler(a: Antworten, artikel: Array<{ id: string; label: string; groessen: "shirt" | "hose" | "schuh" | "keine" }>): string | null {
  if (a.kleidungWunsch !== true) return null;
  const gewaehlt = artikel.filter((x) => a.kleidungArtikel.includes(x.id));
  if (gewaehlt.length === 0) return "Bitte mindestens einen Artikel wählen.";
  if (gewaehlt.some((x) => x.groessen === "shirt") && !a.shirt) return "Bitte die Shirtgröße angeben.";
  if (gewaehlt.some((x) => x.groessen === "hose") && !a.hosengroesse) return "Bitte die Hosengröße angeben.";
  if (gewaehlt.some((x) => x.groessen === "schuh") && !a.schuhgroesse) return "Bitte die Schuhgröße angeben.";
  return null;
}

// Etappe 3 verlangt nur, dass etwas eingetragen oder bewusst „keine“ gewählt wurde – das prüft die Oberfläche
export function plzGueltig(plz: string): boolean {
  return /^\d{5}$/.test(plz.trim());
}

export function handyGueltig(handy: string): boolean {
  return /^(\+49|0049|0)[ ]?[1-9][0-9 ()/-]{7,}$/.test(handy.trim());
}

export function situationVollstaendig(a: Antworten): boolean {
  return a.situation.every((s) => s !== null);
}

// Anteil beantworteter Fragen für den Fortschrittsbalken
export function fortschritt(a: Antworten): { beantwortet: number; gesamt: number } {
  const werte: unknown[] = [
    a.vorname, a.nachname, a.handy, a.email, a.plz, a.wohnort, a.sprachen.length > 0 ? 1 : "", a.volljaehrig,
    a.fuehrerschein, a.eigenesAuto, a.maxAnfahrtMin, a.uebernachtungOk, a.fahrgemeinschaft,
    TAETIGKEITEN.some((t) => a.erfahrung[t].einsaetze > 0 || a.erfahrung[t].jahre > 0) ? 1 : "", a.groessteVeranstaltung, a.fruehereFirmen,
    a.nachweis_stapler !== "keiner" ? 1 : "", a.nachweis_ersthelfer !== "keiner" ? 1 : "", a.nachweis_hygiene !== "keiner" ? 1 : "", a.nachweis_34a !== "keiner" ? 1 : "",
    a.ausr_s3, a.ausr_handschuhe, a.ausr_helm, a.ausr_warnweste, a.ausr_schwarz, a.ausr_werkzeug, a.shirt, a.schuhgroesse, a.kleidungWunsch,
    a.wunschVertrag, a.wochentage, a.nachtOk, a.wunschStundenMonat, a.aktuellerStatus, a.andereArbeitgeber,
    ...a.situation,
  ];
  return { beantwortet: werte.filter((w) => !leer(w)).length, gesamt: werte.length };
}
