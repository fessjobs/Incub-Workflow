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

// Einstellbare Regeln: welche Schulung für was nötig ist. Ohne Angabe gilt der
// Standard (die Konstanten oben), so verhalten sich alle bisherigen Aufrufe gleich.
export interface VideoEintrag {
  url: string;
  // Englische Fassung (optional); fehlt sie, läuft auch bei englischer Oberfläche das deutsche Video
  urlEn?: string;
  titel: string;
  // Muss die Person das Video angesehen haben (bestätigt), bevor das Quiz startet?
  pflicht: boolean;
  // Absichtlich entfernt: für dieses Modul gibt es kein Video (statt des mitgelieferten). Eine leere Adresse ohne
  // diese Markierung (ältere Einstellungen) gilt nicht als „entfernt“, dann bleibt das mitgelieferte Video.
  entfernt?: boolean;
}

export interface SchulungRegeln {
  // Gilt für jeden Auftrag
  pflichtAlle: ModulId[];
  // Zusätzlich je Tätigkeit der Schicht
  pflichtJeTaetigkeit: Record<Taetigkeit, ModulId[]>;
  // Zusätzlich, wenn im Auftrag „Arbeiten in der Höhe“ steht
  pflichtHoehe: ModulId[];
  // Zusätzlich für bestimmte Kunden (Name wie im Auftrag, Groß-/Kleinschreibung egal)
  jeKunde: Array<{ kunde: string; module: ModulId[] }>;
  // Vor der Freigabe (Aufträge sehen) müssen diese Module gültig sein
  freigabeModule: ModulId[];
  // Video je Modul (leer = Platzhalter)
  video: Record<string, VideoEintrag>;
}

// Die mitgelieferten Unterweisungsvideos (public/videos, ausgeliefert über die geschützte Medienroute)
export const MEDIEN_PFAD = "/api/neu/crew/video/";
export function standardVideos(): Record<string, VideoEintrag> {
  return Object.fromEntries(MODUL_IDS.map((m) => [m, { url: `${MEDIEN_PFAD}${m}.de.mp4`, titel: "", pflicht: true }]));
}

export function standardSchulung(): SchulungRegeln {
  return {
    pflichtAlle: ["grund", "brandschutz"],
    pflichtJeTaetigkeit: Object.fromEntries(Object.entries(PFLICHT_JE_TAETIGKEIT).map(([k, v]) => [k, [...v]])) as Record<Taetigkeit, ModulId[]>,
    pflichtHoehe: ["hoehe"],
    jeKunde: [],
    freigabeModule: ["grund", "brandschutz"],
    video: standardVideos(),
  };
}

export interface PflichtOptionen {
  hoehe?: boolean;
  kunde?: string;
  // Zusätzliche Module, die im Auftrag selbst hinterlegt sind
  zusatz?: string[];
}

// Grundunterweisung und Brandschutz gelten für alle; „Höhe und Leitern“ nur,
// wenn es im Auftrag hinterlegt ist. Mit `regeln` gelten die im Dashboard
// eingestellten Zuordnungen.
export function pflichtModule(taetigkeiten: Taetigkeit[], optionen: PflichtOptionen = {}, regeln?: SchulungRegeln): ModulId[] {
  const r = regeln ?? standardSchulung();
  const set = new Set<ModulId>(r.pflichtAlle);
  for (const t of taetigkeiten) for (const m of r.pflichtJeTaetigkeit[t] ?? []) set.add(m);
  if (optionen.hoehe) for (const m of r.pflichtHoehe) set.add(m);
  if (optionen.kunde) {
    const k = optionen.kunde.trim().toLowerCase();
    for (const regel of r.jeKunde) if (regel.kunde.trim().toLowerCase() === k) for (const m of regel.module) set.add(m);
  }
  for (const m of optionen.zusatz ?? []) if ((MODUL_IDS as string[]).includes(m)) set.add(m as ModulId);
  return MODUL_IDS.filter((m) => set.has(m));
}

// Reicht eine gespeicherte Regel-Einstellung (evtl. unvollständig oder aus einer älteren
// Version) in eine vollständige, gültige Form. Unbekannte Module fallen heraus.
export function bereinigeSchulung(roh: unknown): SchulungRegeln {
  const std = standardSchulung();
  if (!roh || typeof roh !== "object") return std;
  const r = roh as Partial<SchulungRegeln>;
  const ids = (x: unknown, fallback: ModulId[]): ModulId[] => (Array.isArray(x) ? MODUL_IDS.filter((m) => x.includes(m)) : fallback);
  const je = { ...std.pflichtJeTaetigkeit };
  if (r.pflichtJeTaetigkeit && typeof r.pflichtJeTaetigkeit === "object") for (const t of Object.keys(je) as Taetigkeit[]) je[t] = ids(r.pflichtJeTaetigkeit[t], je[t]);
  const jeKunde = Array.isArray(r.jeKunde) ? r.jeKunde.filter((x) => x && typeof x.kunde === "string").map((x) => ({ kunde: x.kunde.slice(0, 200), module: ids(x.module, []) })).slice(0, 200) : [];
  // Mitgelieferte Videos gelten, solange nichts anderes eingestellt ist; „kein Video“ nur, wenn es ausdrücklich entfernt wurde
  const video: Record<string, VideoEintrag> = standardVideos();
  if (r.video && typeof r.video === "object") {
    for (const m of MODUL_IDS) {
      const v = (r.video as Record<string, Partial<VideoEintrag>>)[m];
      if (v && typeof v.url === "string" && (v.url.trim() !== "" || v.entfernt === true)) {
        video[m] = { url: v.url.slice(0, 500), titel: typeof v.titel === "string" ? v.titel.slice(0, 200) : "", pflicht: v.pflicht === true };
        if (v.url.trim() === "") video[m].entfernt = true;
        if (typeof v.urlEn === "string" && v.urlEn.trim() !== "") video[m].urlEn = v.urlEn.slice(0, 500);
      }
    }
  }
  return { pflichtAlle: ids(r.pflichtAlle, std.pflichtAlle), pflichtJeTaetigkeit: je, pflichtHoehe: ids(r.pflichtHoehe, std.pflichtHoehe), jeKunde, freigabeModule: ids(r.freigabeModule, std.freigabeModule), video };
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
