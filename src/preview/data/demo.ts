// Beispieldaten des Prototyps. Alles frei erfunden und deterministisch erzeugt
// (gleicher Seed, gleiche Daten) – keine echten Personen, Kunden oder Zahlen.
// Die Form folgt dem Datenmodell aus docs/ausbauplan.md.
import type { Application, Contract, Crew, Job, ProfileAnswers, Rating, Schicht, StundenRow, Taetigkeit, UnterweisungAck, Vertragsart } from "../logic/types";
import { TAETIGKEITEN } from "../logic/types";
import { geocodePlz, naechsterPool } from "../logic/geo";
import { leereErfahrung } from "../logic/scoring";
import { SITUATIONSFRAGEN } from "../logic/fragen";
import { addTage } from "../logic/zeit";
import { pflichtModule } from "../logic/unterweisung";

// Fester „heute“-Tag: die Demo soll morgen und übermorgen dasselbe zeigen
export const DEMO_HEUTE = "2026-10-09";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Jeder Baustein setzt den Generator selbst zurück: gleicher Aufruf, gleiche Daten –
// sonst unterscheiden sich Server- und Browser-Rendering (Hydration-Fehler).
let rnd = mulberry32(20261009);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;
const pad = (n: number) => String(n).padStart(2, "0");

const VORNAMEN = ["Mara", "Jonas", "Lena", "Elias", "Sophie", "Noah", "Amira", "Luca", "Hanna", "Tarek", "Ida", "Felix", "Yara", "Ben", "Clara", "Omar", "Lea", "Mika", "Nina", "Paul", "Selin", "Tim", "Alina", "Emre", "Greta", "Jan", "Mia", "Karim", "Zoe", "Finn", "Leyla", "David", "Pia", "Aaron", "Jule", "Marlon", "Rana", "Theo", "Vera", "Niko", "Dilara", "Henri", "Lotta", "Samir"];
const NACHNAMEN = ["Beispiel", "Hartmann", "Yilmaz", "Kowalski", "Brandt", "Nowak", "Schreiber", "Okafor", "Lindner", "Petrov", "Haas", "Demir", "Vogel", "Marek", "Winter", "Aydin", "Roth", "Jansen", "Kaya", "Falk", "Berger", "Costa", "Engel", "Hoang", "Lorenz", "Maurer", "Nguyen", "Otto", "Pohl", "Quast", "Rieger", "Sommer", "Thiele", "Ulrich", "Voss", "Wendt", "Xander", "Zimmer", "Albrecht", "Bauer", "Conrad", "Dietz", "Ehlert", "Fuchs"];

const PLZ_ORTE = ["70173", "70563", "73033", "71034", "72764", "74072", "75172", "68159", "69115", "76133", "60311", "63065", "64283", "65183", "55116", "55743", "54290", "66111", "50667", "40213", "44135", "45127"];

// ─── Crew ───────────────────────────────────────────────────────────────────

export const SELF_ID = "c-self";

function profilFuer(arch: "neu" | "mittel" | "profi"): ProfileAnswers {
  const erf = leereErfahrung();
  const haupt = pick(TAETIGKEITEN);
  const stufen = { neu: [0, 0, 1], mittel: [1, 3, 25], profi: [4, 8, 120] }[arch];
  for (const t of TAETIGKEITEN) {
    const stark = t === haupt || chance(arch === "profi" ? 0.5 : 0.25);
    if (arch !== "neu" && stark) erf[t] = { jahre: int(stufen[0], stufen[1]), einsaetze: int(Math.max(1, stufen[2] / 4), stufen[2]) };
    else if (arch === "neu" && chance(0.2)) erf[t] = { jahre: 0, einsaetze: int(1, 4) };
  }
  const nw = (status: "keiner" | "angegeben" | "geprueft") => status;
  return {
    volljaehrig: true,
    sprachen: [{ sprache: "Deutsch", niveau: "fließend" }, ...(chance(0.5) ? [{ sprache: "Englisch", niveau: "gut" as const }] : [])],
    fuehrerschein: arch !== "neu" || chance(0.5),
    eigenesAuto: arch === "profi" ? chance(0.9) : chance(0.45),
    maxAnfahrtMin: pick([30, 45, 60, 90, 120]),
    uebernachtungOk: chance(0.5),
    fahrgemeinschaft: chance(0.7),
    erfahrung: erf,
    groessteVeranstaltung: arch === "neu" ? pick([0, 300, 800]) : arch === "mittel" ? pick([800, 3000, 8000, 15000]) : pick([20000, 40000, 80000]),
    fruehereFirmen: arch === "neu" ? "" : pick(["Stagepro", "Crewline", "Event-Team Süd", "freelance"]),
    nachweise: {
      stapler: nw(arch === "profi" ? pick(["geprueft", "geprueft", "angegeben"]) : chance(0.12) ? "angegeben" : "keiner"),
      ersthelfer: nw(chance(arch === "neu" ? 0.15 : 0.45) ? pick(["angegeben", "geprueft"]) : "keiner"),
      hygiene: nw(chance(0.5) ? pick(["angegeben", "geprueft"]) : "keiner"),
      paragraph34a: nw(chance(0.08) ? "angegeben" : "keiner"),
    },
    ausruestung: { s3Schuhe: arch !== "neu" || chance(0.5), handschuhe: chance(0.8), helm: arch === "profi" ? chance(0.7) : chance(0.2), warnweste: chance(0.6), schwarzeKleidung: chance(0.85), werkzeug: arch === "profi" ? chance(0.8) : chance(0.3) },
    shirtgroesse: pick(["S", "M", "M", "L", "XL"]),
    wunschVertrag: pick<Vertragsart>(["Minijob", "kurzfristig", "Werkstudent", "TZ"]),
    wochentage: [0, 1, 2, 3, 4, 5, 6].filter(() => chance(0.65)),
    nachtOk: chance(0.7),
    wunschStundenMonat: pick([20, 30, 40, 60, 80, 120]),
    aktuellerStatus: pick(["Schüler/in", "Student/in", "Angestellt", "Selbstständig", "Arbeitsuchend"]),
    andereArbeitgeber: chance(0.3),
    situation: SITUATIONSFRAGEN.map((s) => {
      const ordnung = [...s.optionen.keys()].sort((a, b) => s.optionen[b].punkte - s.optionen[a].punkte);
      const gut = arch === "profi" ? 0.85 : arch === "mittel" ? 0.6 : 0.35;
      return chance(gut) ? ordnung[0] : ordnung[Math.min(ordnung.length - 1, 1 + int(0, 1))];
    }),
  };
}

function vertragFuer(art: Vertragsart, i: number): Contract {
  const stundenlohn = Math.round((13.9 + rnd() * 3.6) * 100) / 100;
  const base = { vertragsart: art, stundenlohn, gueltigVon: `2026-0${int(1, 5)}-01`, docusignId: `DS-${100000 + i * 37}` };
  // Ein paar Verträge laufen bald ab oder sind abgelaufen – für die Ampeln
  const bis = i % 17 === 0 ? "2026-09-30" : i % 11 === 0 ? "2026-10-31" : i % 5 === 0 ? "2026-12-31" : null;
  switch (art) {
    case "Minijob":
      return { ...base, wochenstunden: 10, monatsgrenzeEur: 603, monatsgrenzeStd: Math.floor(603 / stundenlohn), gueltigBis: bis };
    case "kurzfristig":
      return { ...base, wochenstunden: 30, monatsgrenzeEur: null, monatsgrenzeStd: null, gueltigBis: bis ?? "2026-12-31" };
    case "Werkstudent":
      return { ...base, wochenstunden: 20, monatsgrenzeEur: null, monatsgrenzeStd: 86, gueltigBis: bis };
    case "TZ":
      return { ...base, wochenstunden: 25, monatsgrenzeEur: null, monatsgrenzeStd: 108, gueltigBis: bis };
    case "VZ":
      return { ...base, wochenstunden: 40, monatsgrenzeEur: null, monatsgrenzeStd: 173, gueltigBis: bis };
  }
}

function acksFuer(arch: "neu" | "mittel" | "profi"): Record<string, UnterweisungAck> {
  const acks: Record<string, UnterweisungAck> = {};
  const alle = ["grund", "brandschutz", "stagehand", "elektrik", "catering", "einlass", "stapler", "hoehe"];
  // Datumsmix: gültig, läuft in <14 Tagen ab, abgelaufen
  const daten = ["2026-03-12", "2026-05-20", "2025-10-20", "2025-09-15", "2026-07-01"];
  const anzahl = arch === "neu" ? 0 : arch === "mittel" ? int(2, 4) : int(4, 7);
  for (const m of alle.slice(0, anzahl)) acks[m] = { version: "2026.1-entwurf", bestaetigtAm: pick(daten), quizScore: pick([0.8, 0.9, 1]) };
  return acks;
}

function ratingsFuer(arch: "neu" | "mittel" | "profi"): Rating[] {
  if (arch === "neu") return [];
  const n = arch === "profi" ? int(5, 9) : int(2, 4);
  const basis = arch === "profi" ? 4.3 : 3.6;
  return Array.from({ length: n }, (_, i) => {
    const w = () => Math.max(1, Math.min(5, Math.round(basis + (rnd() - 0.5) * 2)));
    return { jobId: `FESS-2026-0${100 + i}`, von: chance(0.5) ? "Teamleiter" : "Dispo", puenktlich: w(), einsatz: w(), teamwork: w(), kommentar: chance(0.25) ? pick(["Zuverlässig.", "Packt an.", "War zweimal zu spät.", "Sehr gutes Teamwork."]) : "" } as Rating;
  });
}

export function baueCrew(n = 120): Crew[] {
  rnd = mulberry32(20261009);
  const liste: Crew[] = [];
  const arten: Vertragsart[] = ["Minijob", "Minijob", "Minijob", "Minijob", "Minijob", "kurzfristig", "kurzfristig", "Werkstudent", "TZ", "VZ"];
  for (let i = 0; i < n; i++) {
    const arch = i % 9 === 0 ? "profi" : i % 3 === 0 ? "mittel" : i % 4 === 1 ? "neu" : "mittel";
    const plz = PLZ_ORTE[(i * 7 + 3) % PLZ_ORTE.length];
    const ort = geocodePlz(plz);
    const status = i % 23 === 22 ? "gesperrt" : i % 19 === 18 ? "Bewerber" : "aktiv";
    const art = arten[i % arten.length];
    const einsaetze = status === "Bewerber" ? 0 : arch === "profi" ? int(60, 160) : arch === "mittel" ? int(12, 55) : int(0, 9);
    const ratings = status === "Bewerber" ? [] : ratingsFuer(arch);
    liste.push({
      id: `c-${i + 1}`,
      pnr: `P${1001 + i}`,
      vorname: VORNAMEN[i % VORNAMEN.length],
      nachname: NACHNAMEN[(i * 5 + 2 + Math.floor(i / VORNAMEN.length) * 7) % NACHNAMEN.length],
      telefon: `0151 0000 ${String(1000 + i * 13).slice(-4)}`,
      email: `crew${i + 1}@beispiel.invalid`,
      wohnort: ort?.name ?? "Stuttgart",
      plz,
      pool: ort ? naechsterPool(ort).pool : "Stuttgart",
      status,
      xp: status === "Bewerber" ? 0 : Math.round(einsaetze * (arch === "profi" ? 14 : 11) + int(-15, 30)),
      einsaetze,
      arbeitstageJahr: art === "kurzfristig" ? int(28, 74) : einsaetze + int(0, 20),
      profile: profilFuer(arch),
      contract: status === "Bewerber" ? null : vertragFuer(art, i),
      unterweisungen: status === "Bewerber" ? {} : acksFuer(arch),
      ratings,
      notizen: chance(0.15) ? pick(["Hat Staplerschein im Original gezeigt.", "Bevorzugt Spätschichten.", "Sucht Fahrgemeinschaft ab Esslingen.", "Teamleiter-Potenzial."]) : "",
    });
  }
  return liste;
}

// Die Person, als die man im Prototyp die Crew-Seite durchspielt: noch ohne
// Profil, ohne Unterweisung – damit sich Fragebogen und Quiz ausprobieren lassen.
export function baueSelbst(): Crew {
  return {
    id: SELF_ID, pnr: "P9001", vorname: "Mara", nachname: "Beispiel", telefon: "0151 0000 9001", email: "mara@beispiel.invalid", wohnort: "Stuttgart", plz: "70173", pool: "Stuttgart",
    status: "Bewerber", xp: 0, einsaetze: 0, arbeitstageJahr: 0, profile: null, contract: null, unterweisungen: {}, ratings: [], notizen: "",
  };
}

// ─── Aufträge ───────────────────────────────────────────────────────────────

interface JobSpec {
  nr: number;
  kunde: string;
  titel: string;
  ort: string;
  plz: string;
  tage: number; // Tage ab heute
  dauer: number;
  schichten: Array<[string, string, string, Taetigkeit, number]>;
  hoehe?: boolean;
  psa: string[];
  status: Job["status"];
  quelle: Job["quelle"];
}

const SPECS: JobSpec[] = [
  { nr: 142, kunde: "Nordlicht Live GmbH", titel: "Hallenkonzert – Aufbau und Show", ort: "Porsche-Arena-Gelände, Stuttgart", plz: "70372", tage: 0, dauer: 1, schichten: [["Load-In", "08:00", "16:00", "Stagehand", 24], ["Show", "17:00", "23:30", "Stagehand", 12], ["Load-Out", "23:30", "04:00", "Stagehand", 20]], psa: ["S3-Schuhe", "Handschuhe", "Helm"], status: "offen", quelle: "Planung Regios" },
  { nr: 143, kunde: "Rheinbühne Events", titel: "Open-Air Festival – Catering Backstage", ort: "Rheinwiese, Düsseldorf", plz: "40474", tage: 2, dauer: 3, schichten: [["Frühschicht", "10:00", "18:00", "Catering", 10], ["Spätschicht", "16:00", "00:00", "Bar", 8]], psa: ["Rutschfeste Schuhe", "Schwarze Kleidung"], status: "offen", quelle: "Planung Regios" },
  { nr: 144, kunde: "Messe Südwest", titel: "Fachmesse – Standbau", ort: "Messe Karlsruhe", plz: "76137", tage: 3, dauer: 2, schichten: [["Aufbau", "07:00", "15:30", "Messebau", 16], ["Abbau", "15:00", "23:00", "Logistik", 12]], hoehe: true, psa: ["S3-Schuhe", "Handschuhe", "Warnweste"], status: "offen", quelle: "manuell" },
  { nr: 145, kunde: "Arena Plus", titel: "Heimspiel – Einlass Nordkurve", ort: "SAP-Gelände, Mannheim", plz: "68165", tage: 4, dauer: 1, schichten: [["Einlass", "15:00", "22:30", "Einlass", 14]], psa: ["Warnweste", "Schwarze Kleidung"], status: "offen", quelle: "Planung Regios" },
  { nr: 146, kunde: "Kuppel Catering Group", titel: "Firmenevent – Service und Spüle", ort: "Skyline-Halle, Frankfurt", plz: "60528", tage: 5, dauer: 1, schichten: [["Service", "14:00", "23:00", "Catering", 18], ["Spüle", "13:00", "22:00", "Catering", 4]], psa: ["Rutschfeste Schuhe", "Schürze"], status: "offen", quelle: "Planung Regios" },
  { nr: 147, kunde: "Nordlicht Live GmbH", titel: "Festivalaufbau Westpark", ort: "Westpark, Köln", plz: "50679", tage: 7, dauer: 4, schichten: [["Aufbau Bühne", "07:00", "16:00", "Stagehand", 30], ["Stapler Logistik", "07:00", "16:00", "Stapler", 4]], hoehe: true, psa: ["S3-Schuhe", "Handschuhe", "Helm", "Warnweste"], status: "offen", quelle: "Planung Regios" },
  { nr: 148, kunde: "Rheinbühne Events", titel: "Stadtfest – Auf- und Abbau", ort: "Marktplatz, Idar-Oberstein", plz: "55743", tage: 9, dauer: 2, schichten: [["Aufbau", "08:00", "16:00", "Stagehand", 8], ["Abbau", "20:00", "02:00", "Stagehand", 8]], psa: ["S3-Schuhe", "Handschuhe"], status: "offen", quelle: "manuell" },
  { nr: 149, kunde: "Arena Plus", titel: "Messe-Promotion – Stand-Team", ort: "Messe Dortmund", plz: "44139", tage: 10, dauer: 2, schichten: [["Standteam", "09:00", "18:00", "Promotion", 6]], psa: ["Schwarze Kleidung"], status: "offen", quelle: "Planung Regios" },
];

export function baueJobs(): Job[] {
  return SPECS.map((s) => {
    const datumVon = addTage(DEMO_HEUTE, s.tage);
    const datumBis = addTage(datumVon, s.dauer - 1);
    const schichten: Schicht[] = s.schichten.map(([bez, start, ende, taet, bedarf], i) => ({ id: `j${s.nr}-s${i + 1}`, bezeichnung: bez, datum: datumVon, start, ende, taetigkeit: taet, bedarf }));
    return {
      id: `FESS-2026-0${s.nr}`,
      kunde: s.kunde,
      titel: s.titel,
      ort: s.ort,
      plz: s.plz,
      datumVon,
      datumBis,
      schichten,
      beschreibung: "Beispielauftrag für den Prototyp. Echte Beschreibung, Ablauf und Treffpunkt kommen aus „Planung Regios“ bzw. der manuellen Anlage.",
      dresscode: s.psa.includes("Schwarze Kleidung") ? "Komplett schwarz, keine Logos" : "Arbeitskleidung, wetterfest",
      psa: s.psa,
      hoehe: Boolean(s.hoehe),
      verpflegung: "Warme Mahlzeit und Getränke vor Ort",
      parken: s.ort.includes("Messe") || s.ort.includes("Arena") ? "Crew-Parkplatz P3, Einfahrt über Tor 2" : "Öffentliche Parkplätze in der Nähe, bitte Fahrgemeinschaften bilden",
      treffpunkt: `Crew-Eingang ${["Nord", "Ost", "Süd", "West"][s.nr % 4]}, bitte 15 Minuten vor Call da sein`,
      ansprechpartner: "Wird nach der Bestätigung freigeschaltet",
      ablauf: ["Ankommen und Einweisung durch den Teamleiter", "Sicherheitsunterweisung vor Ort durch den Entleiher", s.schichten[0][0] + " nach Plan", "Pausen nach Absprache, Zettel am Ende der Schicht"],
      status: s.status,
      quelle: s.quelle,
    };
  });
}

// ─── Bewerbungen ────────────────────────────────────────────────────────────

export function baueBewerbungen(crew: Crew[], jobs: Job[]): Application[] {
  rnd = mulberry32(5150);
  const out: Application[] = [];
  const aktive = crew.filter((c) => c.status === "aktiv" || c.status === "Bewerber");
  let n = 0;
  jobs.forEach((job, ji) => {
    // Etwa so viele Bewerbungen, wie Plätze zu besetzen sind (mindestens 12, höchstens 60)
    const bedarf = job.schichten.reduce((n, x) => n + x.bedarf, 0);
    const anzahl = Math.max(12, Math.min(60, Math.round(bedarf * 0.9)));
    for (let k = 0; k < anzahl; k++) {
      const c = aktive[(ji * 13 + k * 7) % aktive.length];
      if (out.some((a) => a.jobId === job.id && a.pnr === c.pnr)) continue;
      // Wer sich bewirbt, hat die Pflicht-Unterweisung gültig (das Bewerben verlangt sie) –
      // bis auf einzelne Ausnahmen, damit die Disposition einen Konflikt zeigen kann
      if (k % 8 !== 5) {
        for (const m of pflichtModule(job.schichten.map((x) => x.taetigkeit), { hoehe: job.hoehe })) {
          c.unterweisungen[m] ??= { version: "2026.1-entwurf", bestaetigtAm: "2026-07-01", quizScore: 0.9 };
        }
      }
      const s = job.schichten[(k + ji) % job.schichten.length];
      out.push({
        id: `a-${++n}`,
        jobId: job.id,
        pnr: c.pnr,
        schichtIds: chance(0.25) && job.schichten.length > 1 ? job.schichten.map((x) => x.id) : [s.id],
        eigeneAnreise: chance(0.6),
        abfahrtsort: chance(0.2) ? "Esslingen" : "",
        fahrgemeinschaftPlaetze: chance(0.3) ? int(1, 3) : 0,
        hatVertrag: c.status === "aktiv",
        status: k < 3 && ji < 5 ? "bestätigt" : k % 7 === 5 ? "Warteliste" : k % 9 === 8 ? "abgelehnt" : k % 4 === 1 ? "passt" : "neu",
        notizIntern: "",
        kommentar: chance(0.15) ? pick(["Kann ab 9 Uhr.", "Bringe Werkzeug mit.", "Habe Staplerschein dabei."]) : "",
        eingegangen: addTage(DEMO_HEUTE, -int(0, 6)),
      });
    }
  });
  return out;
}

// ─── Stundentabelle ─────────────────────────────────────────────────────────

const KUNDEN = ["Nordlicht Live GmbH", "Rheinbühne Events", "Messe Südwest", "Arena Plus", "Kuppel Catering Group", "Stadtwerk Kultur", "Bergblick Messen", "Hafenhalle Events"];

export interface VergangenerAuftrag {
  id: string;
  kunde: string;
  titel: string;
  taetigkeit: Taetigkeit;
}

export function baueVergangeneAuftraege(): VergangenerAuftrag[] {
  const r = mulberry32(77);
  const titel = ["Konzert", "Messeaufbau", "Festival", "Firmenevent", "Gala", "Heimspiel", "Stadtfest", "Roadshow"];
  return Array.from({ length: 36 }, (_, i) => ({
    id: `FESS-2026-0${101 + i}`,
    kunde: KUNDEN[i % KUNDEN.length],
    titel: `${titel[Math.floor(r() * titel.length)]} ${i + 1}`,
    taetigkeit: TAETIGKEITEN[Math.floor(r() * TAETIGKEITEN.length)],
  }));
}

export function baueStunden(crew: Crew[], auftraege: VergangenerAuftrag[]): StundenRow[] {
  const r = mulberry32(4711);
  const p = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const i2 = (a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
  const ch = (x: number) => r() < x;
  const aktive = crew.filter((c) => c.status === "aktiv");
  const rows: StundenRow[] = [];
  const schichtenJeMonat = new Map<string, number>();
  let id = 0;

  const tage: string[] = [];
  for (let d = 1; d <= 30; d++) tage.push(`2026-09-${pad(d)}`);
  for (let d = 1; d <= 8; d++) tage.push(`2026-10-${pad(d)}`);

  const mkRow = (datum: string, c: Crew, a: VergangenerAuftrag, opts: Partial<StundenRow> = {}): StundenRow => {
    const startH = p([6, 7, 8, 9, 10, 12, 14, 16, 17, 18, 20]);
    const dauer = p([4, 5, 6, 7, 8, 8, 8, 9, 10]);
    const start = `${pad(startH)}:${p(["00", "00", "30", "15"])}`;
    const [sh, sm] = start.split(":").map(Number);
    const pauseLaenge = dauer >= 9 ? 45 : 30;
    const endMin = (sh * 60 + sm + dauer * 60 + (dauer > 6 ? pauseLaenge : 0)) % 1440;
    const ende = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
    const pauseStart = sh * 60 + sm + Math.min(4, dauer - 1) * 60;
    const pausen = dauer > 6 ? [{ von: `${pad(Math.floor((pauseStart % 1440) / 60))}:${pad(pauseStart % 60)}`, bis: `${pad(Math.floor(((pauseStart + pauseLaenge) % 1440) / 60))}:${pad((pauseStart + pauseLaenge) % 60)}` }] : [];
    const quelle = r() < 0.7 ? "Zettel" : r() < 0.85 ? "App" : "manuell";
    const abgeschlossen = datum < "2026-10-01" ? "exportiert" : datum <= "2026-10-04" ? "freigegeben" : datum <= "2026-10-06" ? "geprueft" : "offen";
    return {
      id: `z${++id}`,
      datum,
      pnr: c.pnr,
      start,
      pausen,
      ende,
      pauschale: ch(0.2) ? 4 : 0,
      kunde: a.kunde,
      auftrag: a.id,
      spesen: ch(0.08) ? p([7, 14, 28]) : 0,
      reiseKm: ch(0.12) ? i2(15, 120) : 0,
      reiseGesch: ch(0.02) ? p([25, 40]) : 0,
      bonus: ch(0.03) ? p([20, 25, 50]) : 0,
      abzug: ch(0.01) ? 25 : 0,
      bemerkung: ch(0.04) ? p(["Mehrarbeit abgesprochen", "Zettel nachgereicht", "Teamleiter vor Ort"]) : "",
      status: abgeschlossen,
      quelle,
      sourceRef: quelle === "Zettel" ? `ZETTEL-2026-${String(10000 + id * 3)}` : quelle === "App" ? `APP-${String(5000 + id)}` : null,
      ...opts,
    };
  };

  for (const datum of tage) {
    const wochentag = new Date(`${datum}T12:00:00Z`).getUTCDay();
    const anzahl = wochentag === 0 ? i2(18, 24) : wochentag === 6 || wochentag === 5 ? i2(34, 38) : i2(28, 34);
    // Je Tag verschiedene Personen: durchmischen und die ersten nehmen.
    // Fisher-Yates statt sort(() => r() - 0.5): Letzteres hat einen
    // inkonsistenten Vergleicher, den Safari anders abarbeitet als Node –
    // Server und Browser bekämen dann verschiedene Daten (Hydration-Fehler).
    const reihenfolge = [...aktive];
    for (let k = reihenfolge.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [reihenfolge[k], reihenfolge[j]] = [reihenfolge[j], reihenfolge[k]];
    }
    // Schichten je Monat und Vertragsart begrenzen, damit die Stunden zu den
    // Grenzen passen (Minijob ca. 5 Schichten, Vollzeit ca. 20)
    const monat = datum.slice(0, 7);
    let genommen = 0;
    for (const c of reihenfolge) {
      if (genommen >= anzahl) break;
      const art = c.contract?.vertragsart ?? "Minijob";
      const basis = { Minijob: 5, kurzfristig: 13, Werkstudent: 10, TZ: 15, VZ: 20 }[art];
      const grenze = basis + (c.id.length % 3) - 1;
      const key = `${c.pnr}|${monat}`;
      if ((schichtenJeMonat.get(key) ?? 0) >= grenze) continue;
      schichtenJeMonat.set(key, (schichtenJeMonat.get(key) ?? 0) + 1);
      rows.push(mkRow(datum, c, p(auftraege)));
      genommen++;
    }
  }

  // Absichtliche Auffälligkeiten – damit die Prüfung etwas zu zeigen hat
  const okt = rows.filter((x) => x.datum >= "2026-10-01");
  const a = (i: number) => okt[(i * 17) % okt.length];
  // Doppeleinsatz: zweite Zeile derselben Person am selben Tag, überschneidend
  for (const i of [3, 11, 19]) {
    const x = a(i);
    const c = crew.find((cc) => cc.pnr === x.pnr);
    if (c) rows.push({ ...x, id: `z${++id}`, auftrag: auftraege[(i + 4) % auftraege.length].id, kunde: auftraege[(i + 4) % auftraege.length].kunde, start: x.start, ende: x.ende, status: "offen", quelle: "manuell", sourceRef: null });
  }
  // Pause fehlt bei langer Schicht, Schicht über 10 h
  for (const i of [5, 13, 21]) {
    const x = a(i);
    x.pausen = [];
    x.start = "06:00";
    x.ende = "16:30";
  }
  for (const i of [7, 15]) {
    const x = a(i);
    x.start = "06:00";
    x.ende = "19:30";
    x.pausen = [{ von: "12:00", bis: "12:45" }];
  }
  // Unbekannte Personalnummer
  rows.push({ ...a(9), id: `z${++id}`, pnr: "P9999", status: "offen", sourceRef: "ZETTEL-2026-99999" });
  // Bonus – Lohnart noch nicht abgestimmt (zeigt sich im Prüfbericht)
  a(1).bonus = 50;
  a(2).bonus = 25;

  rows.sort((x, y) => (x.datum === y.datum ? x.start.localeCompare(y.start) : x.datum.localeCompare(y.datum)));
  return rows;
}

// ─── Gesamtpaket für den Zustand ────────────────────────────────────────────

export interface DemoDaten {
  crew: Crew[];
  self: Crew;
  jobs: Job[];
  bewerbungen: Application[];
  auftraege: VergangenerAuftrag[];
  stunden: StundenRow[];
}

export function baueDemo(): DemoDaten {
  const crew = baueCrew();
  const auftraege = baueVergangeneAuftraege();
  const jobs = baueJobs();
  return { crew, self: baueSelbst(), jobs, bewerbungen: baueBewerbungen(crew, jobs), auftraege, stunden: baueStunden(crew, auftraege) };
}
