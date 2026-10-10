// Passung zwischen Bewerber und Schicht (Modul G): ein Score von 0 bis 100,
// dazu die Gründe als Chips und die Konflikte. Die Gewichtung ist eine
// Annahme des Prototyps und nach der Durchsicht einstellbar zu machen.
import type { Crew, Job, Schicht } from "./types";
import { scoreProfile, effektiverScore, kategorieFuer, DEFAULT_SCORING, type ScoringSettings } from "./scoring";
import { fahrminuten, geocodePlz } from "./geo";
import { fehlendeModule, pflichtModule, type SchulungRegeln } from "./unterweisung";
import { vertragAm } from "./stunden";
import { absEnde, absStart, bruttoMinuten, formatDatumDE } from "./zeit";

export interface BestehenderEinsatz {
  datum: string;
  start: string;
  ende: string;
  auftrag: string;
}

export interface PassungKontext {
  heute: string;
  // Eingestellte Schulungs-Pflicht (fehlt: Standard)
  schulung?: SchulungRegeln;
  scoring?: ScoringSettings;
  bestehende: BestehenderEinsatz[];
  // bereits gearbeitete oder fest eingeplante Stunden im Monat der Schicht
  monatsStunden: number;
}

export interface Chip {
  text: string;
  ton: "gut" | "neutral" | "warn";
}

export interface Konflikt {
  code: "doppelt" | "ruhezeit" | "vertrag" | "unterweisung" | "grenze";
  text: string;
  schwer: boolean;
}

export interface PassungErgebnis {
  score: number;
  kategorie: "A" | "B" | "C";
  fahrMinuten: number | null;
  chips: Chip[];
  konflikte: Konflikt[];
  // Einplanen trotz Konflikt braucht eine Begründung
  braucht_begruendung: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function crewKategorie(c: Crew, scoring: ScoringSettings = DEFAULT_SCORING): "A" | "B" | "C" {
  if (!c.profile) return "C";
  const frage = scoreProfile(c.profile, scoring).gesamt;
  const eff = effektiverScore(frage, c.einsaetze, c.ratings, scoring).score;
  return kategorieFuer(eff, scoring);
}

export function schichtStunden(s: Schicht): number {
  return Math.round((bruttoMinuten(s.start, s.ende) / 60) * 100) / 100;
}

export function passung(c: Crew, job: Job, s: Schicht, ctx: PassungKontext): PassungErgebnis {
  const scoring = ctx.scoring ?? DEFAULT_SCORING;
  const chips: Chip[] = [];
  const konflikte: Konflikt[] = [];
  let score = 0;

  // Kategorie (0..25)
  const kat = crewKategorie(c, scoring);
  score += kat === "A" ? 25 : kat === "B" ? 15 : 5;
  chips.push({ text: `Kategorie ${kat}`, ton: kat === "A" ? "gut" : kat === "B" ? "neutral" : "warn" });

  // Tätigkeitserfahrung (0..25)
  const e = c.profile?.erfahrung[s.taetigkeit];
  const erf = e ? clamp01((e.einsaetze + 6 * e.jahre) / 30) : 0;
  score += erf * 25;
  if (erf >= 0.6) chips.push({ text: `${s.taetigkeit} erfahren`, ton: "gut" });
  else if (erf === 0) chips.push({ text: `${s.taetigkeit}: keine Erfahrung`, ton: "warn" });
  if (s.taetigkeit === "Stapler" && c.profile?.nachweise.stapler === "geprueft") chips.push({ text: "Stapler ok", ton: "gut" });
  if (s.taetigkeit === "Stapler" && c.profile?.nachweise.stapler !== "geprueft") chips.push({ text: "Staplernachweis nicht geprüft", ton: "warn" });

  // Fahrzeit (0..20)
  const von = geocodePlz(c.plz);
  const nach = geocodePlz(job.plz);
  const fahrMinuten = von && nach ? fahrminuten(von, nach) : null;
  if (fahrMinuten !== null) {
    score += fahrMinuten <= 30 ? 20 : fahrMinuten <= 60 ? 14 : fahrMinuten <= 90 ? 8 : 2;
    const wunsch = c.profile?.maxAnfahrtMin ?? 90;
    chips.push({ text: `${fahrMinuten} min`, ton: fahrMinuten <= 60 ? "gut" : fahrMinuten <= wunsch ? "neutral" : "warn" });
  }

  // Unterweisung (0..10)
  const pflicht = pflichtModule([s.taetigkeit], { hoehe: job.hoehe, kunde: job.kunde, zusatz: job.zusatzModule }, ctx.schulung);
  const fehlend = fehlendeModule(pflicht, c.unterweisungen, ctx.heute);
  score += 10 * (1 - fehlend.length / Math.max(1, pflicht.length));
  if (fehlend.length === 0) chips.push({ text: "Unterweisung gültig", ton: "gut" });
  else {
    chips.push({ text: `Unterweisung fehlt (${fehlend.length})`, ton: "warn" });
    konflikte.push({ code: "unterweisung", text: `Unterweisung fehlt oder ist abgelaufen: ${fehlend.join(", ")}.`, schwer: false });
  }

  // Vertragsgrenze (0..10)
  const stunden = schichtStunden(s);
  const vertrag = c.contract ? vertragAm([c.contract], s.datum) : null;
  if (!vertrag) {
    konflikte.push({ code: "vertrag", text: c.contract ? `Vertrag am ${formatDatumDE(s.datum)} nicht gültig (bis ${c.contract.gueltigBis ? formatDatumDE(c.contract.gueltigBis) : "unbefristet"}).` : "Kein Vertrag hinterlegt.", schwer: true });
  } else if (vertrag.monatsgrenzeStd !== null) {
    const frei = vertrag.monatsgrenzeStd - ctx.monatsStunden;
    score += clamp01(frei / stunden) * 10;
    if (frei >= stunden) chips.push({ text: `noch ${Math.floor(frei)} h frei`, ton: frei - stunden < 8 ? "neutral" : "gut" });
    else {
      chips.push({ text: "Monatsgrenze", ton: "warn" });
      konflikte.push({ code: "grenze", text: `Monatsgrenze: ${ctx.monatsStunden.toFixed(1).replace(".", ",")} + ${stunden} h > ${vertrag.monatsgrenzeStd} h (${vertrag.vertragsart}).`, schwer: false });
    }
  } else {
    score += 10;
    chips.push({ text: "keine Stundengrenze", ton: "neutral" });
  }
  if (vertrag?.gueltigBis && vertrag.gueltigBis < job.datumBis) {
    konflikte.push({ code: "vertrag", text: `Vertrag läuft am ${formatDatumDE(vertrag.gueltigBis)} ab – vor Ende des Auftrags.`, schwer: false });
  }

  // XP (0..10)
  score += clamp01(c.xp / 600) * 10;

  // Doppelbuchung und Ruhezeit gegen bereits bestätigte Einsätze
  const aS = absStart(s.datum, s.start);
  const aE = absEnde(s.datum, s.start, s.ende);
  for (const b of ctx.bestehende) {
    const bS = absStart(b.datum, b.start);
    const bE = absEnde(b.datum, b.start, b.ende);
    if (aS < bE && bS < aE) {
      konflikte.push({ code: "doppelt", text: `Doppelt gebucht: ${b.auftrag} (${formatDatumDE(b.datum)} ${b.start}–${b.ende}).`, schwer: true });
    } else {
      const lueck = aS >= bE ? aS - bE : bS - aE;
      if (lueck >= 0 && lueck < 11 * 60) konflikte.push({ code: "ruhezeit", text: `Ruhezeit unter 11 h zu ${b.auftrag}.`, schwer: false });
    }
  }

  return {
    score: Math.round(clamp01(score / 100) * 100),
    kategorie: kat,
    fahrMinuten,
    chips,
    konflikte,
    braucht_begruendung: konflikte.length > 0,
  };
}

// Fahrgemeinschaften: wer wohnt nah beieinander und fährt zur selben Schicht?
export function fahrgemeinschaftsVorschlaege(kandidaten: Crew[], maxMinuten = 25): Array<{ a: Crew; b: Crew; minuten: number }> {
  const out: Array<{ a: Crew; b: Crew; minuten: number }> = [];
  for (let i = 0; i < kandidaten.length; i++) {
    for (let j = i + 1; j < kandidaten.length; j++) {
      const oa = geocodePlz(kandidaten[i].plz);
      const ob = geocodePlz(kandidaten[j].plz);
      if (!oa || !ob) continue;
      const min = fahrminuten(oa, ob);
      if (min <= maxMinuten && (kandidaten[i].profile?.eigenesAuto || kandidaten[j].profile?.eigenesAuto)) out.push({ a: kandidaten[i], b: kandidaten[j], minuten: min });
    }
  }
  return out.sort((x, y) => x.minuten - y.minuten);
}
