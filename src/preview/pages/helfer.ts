// Gemeinsame Rechenhilfen der Seiten (keine Oberfläche).
import type { Crew, Job, Schicht, StundenRow } from "../logic/types";
import { effektiverScore, kategorieFuer, scoreProfile, type ScoreErgebnis } from "../logic/scoring";
import { ampel70Tage, ampelAuslastung, ampelMinijob, ampelVertrag, schlechtereAmpel, type Ampel } from "../logic/grenzen";
import { gesamtzeit } from "../logic/zeit";
import { verdienstZeile } from "../logic/stunden";
import { passung, type PassungErgebnis } from "../logic/passung";
import type { PvState, Einstellungen } from "../state/store";
import { HEUTE } from "../state/store";
import { pflichtModule, fehlendeModule, statusFuer } from "../logic/unterweisung";
import { MODULE } from "../data/trainings";

export const vollName = (c: Pick<Crew, "vorname" | "nachname">) => `${c.vorname} ${c.nachname}`;

export interface Bewertung {
  frage: ScoreErgebnis;
  score: number;
  anteilLeistung: number;
  kategorie: "A" | "B" | "C";
}

export function bewertung(c: Crew, einst: Einstellungen): Bewertung | null {
  if (!c.profile) return null;
  const frage = scoreProfile(c.profile, einst.scoring);
  const eff = effektiverScore(frage.gesamt, c.einsaetze, c.ratings, einst.scoring);
  return { frage, score: eff.score, anteilLeistung: eff.anteilLeistung, kategorie: kategorieFuer(eff.score, einst.scoring) };
}

export function stundenImMonat(rows: StundenRow[], pnr: string, monat: string): number {
  let n = 0;
  for (const r of rows) {
    if (r.pnr !== pnr || !r.datum.startsWith(monat) || !r.start || !r.ende) continue;
    n += Math.max(gesamtzeit(r.start, r.ende, r.pausen), r.pauschale);
  }
  return Math.round(n * 100) / 100;
}

export function verdienstImMonat(rows: StundenRow[], c: Crew, monat: string): number {
  if (!c.contract) return 0;
  let n = 0;
  for (const r of rows) {
    if (r.pnr !== c.pnr || !r.datum.startsWith(monat) || !r.start || !r.ende) continue;
    n += verdienstZeile(r, c.contract.stundenlohn);
  }
  return Math.round(n * 100) / 100;
}

export interface GrenzenErgebnis {
  stunden: number;
  verdienst: number;
  auslastung: Ampel;
  vertrag: Ampel;
  tage70: Ampel | null;
  minijob: Ampel | null;
  gesamt: Ampel;
}

export function grenzenFuer(s: PvState, c: Crew, monat: string): GrenzenErgebnis {
  const stunden = stundenImMonat(s.stunden, c.pnr, monat);
  const verdienst = verdienstImMonat(s.stunden, c, monat);
  const v = c.contract;
  const auslastung = v ? ampelAuslastung(stunden, v.monatsgrenzeStd) : "grau";
  const vertrag: Ampel = v ? ampelVertrag(v.gueltigBis, HEUTE) : "grau";
  const tage70 = v?.vertragsart === "kurzfristig" ? ampel70Tage(c.arbeitstageJahr) : null;
  const minijob = v?.vertragsart === "Minijob" ? ampelMinijob(verdienst, s.einst.minijobEur) : null;
  let gesamt: Ampel = "gruen";
  for (const a of [auslastung, vertrag, tage70, minijob]) if (a) gesamt = schlechtereAmpel(gesamt, a === "grau" ? "gruen" : a);
  if (!v) gesamt = "grau";
  return { stunden, verdienst, auslastung, vertrag, tage70, minijob, gesamt };
}

export function unterweisungsStand(c: Crew): { gueltig: number; gesamt: number; abgelaufen: number; laeuftAb: number } {
  let gueltig = 0;
  let abgelaufen = 0;
  let laeuftAb = 0;
  for (const m of MODULE) {
    const st = statusFuer(c.unterweisungen[m.id], HEUTE);
    if (st === "gueltig") gueltig++;
    if (st === "laeuftBaldAb") {
      gueltig++;
      laeuftAb++;
    }
    if (st === "abgelaufen") abgelaufen++;
  }
  return { gueltig, gesamt: MODULE.length, abgelaufen, laeuftAb };
}

export function schichtMitJob(s: PvState, schichtId: string): { job: Job; schicht: Schicht } | null {
  for (const job of s.jobs) {
    const schicht = job.schichten.find((x) => x.id === schichtId);
    if (schicht) return { job, schicht };
  }
  return null;
}

export function passungFuer(s: PvState, c: Crew, job: Job, schicht: Schicht): PassungErgebnis {
  const bestehende = [];
  for (const [sid, liste] of Object.entries(s.zuweisung)) {
    if (sid === schicht.id || !liste.some((z) => z.pnr === c.pnr)) continue;
    const treffer = schichtMitJob(s, sid);
    if (treffer) bestehende.push({ datum: treffer.schicht.datum, start: treffer.schicht.start, ende: treffer.schicht.ende, auftrag: treffer.job.titel });
  }
  const monat = schicht.datum.slice(0, 7);
  return passung(c, job, schicht, { heute: HEUTE, scoring: s.einst.scoring, bestehende, monatsStunden: stundenImMonat(s.stunden, c.pnr, monat) });
}

export function pflichtFuerJob(job: Job): ReturnType<typeof pflichtModule> {
  return pflichtModule(job.schichten.map((x) => x.taetigkeit), { hoehe: job.hoehe });
}

export function fehlendFuerJob(c: Crew, job: Job) {
  return fehlendeModule(pflichtFuerJob(job), c.unterweisungen, HEUTE);
}

export function besetzt(s: PvState, job: Job): { bedarf: number; besetzt: number } {
  let bedarf = 0;
  let b = 0;
  for (const sch of job.schichten) {
    bedarf += sch.bedarf;
    b += (s.zuweisung[sch.id] ?? []).length;
  }
  return { bedarf, besetzt: b };
}

export const MONATE: Array<{ wert: string; label: string }> = [
  { wert: "2026-09", label: "September 2026" },
  { wert: "2026-10", label: "Oktober 2026 (bis 08.10.)" },
];

export function ampelTon(a: Ampel): "gut" | "warn" | "err" | undefined {
  return a === "gruen" ? "gut" : a === "gelb" ? "warn" : a === "rot" ? "err" : undefined;
}
