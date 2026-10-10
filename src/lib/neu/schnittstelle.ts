// VORBEREITET, NICHT IN BETRIEB. Verbindung zwischen dem neuen Dashboard und dem bisherigen System
// (Einsatzzettel / Stundennachweis-PDFs). Dieses Modul enthält nur die Verträge (Formate) und reine
// Umrechnungen – es liest und schreibt nichts, ruft nichts auf und kennt die Tabellen des bisherigen
// Systems nicht. Eingeschaltet wird die Schnittstelle erst später, bewusst und in zwei Schritten
// (Umgebungsvariable NEU_SCHNITTSTELLE=an UND Schalter in den Einstellungen). Bis dahin tauschen die
// beiden Systeme keine Daten aus.
import { z } from "zod";
import type { Crew, Job, StundenRow } from "@/preview/logic/types";

export const SCHNITTSTELLE_VERSION = 1;

// ─── Schalter ───────────────────────────────────────────────────────────────

// Hart abgesichert: ohne diese Umgebungsvariable ist die Schnittstelle aus, egal was in den Einstellungen steht
export function schnittstelleUmgebungAn(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEU_SCHNITTSTELLE === "an";
}

export interface SchnittstelleStatus {
  umgebung: boolean;
  einstellung: boolean;
  // In dieser Version gibt es die Abläufe noch nicht – auch bei „an“ liefern die Adressen nur 501
  eingebaut: false;
  wirksam: false;
}

export function schnittstelleStatus(einstellungAn: boolean, env: Record<string, string | undefined> = process.env): SchnittstelleStatus {
  return { umgebung: schnittstelleUmgebungAn(env), einstellung: einstellungAn, eingebaut: false, wirksam: false };
}

// ─── Vertrag 1: Aufträge → bisheriges System ────────────────────────────────

export const auftragFeedSchema = z.object({
  version: z.literal(SCHNITTSTELLE_VERSION),
  erzeugtAm: z.string(),
  auftraege: z.array(
    z.object({
      id: z.string(),
      kunde: z.string(),
      titel: z.string(),
      ort: z.string(),
      plz: z.string(),
      datumVon: z.string(),
      datumBis: z.string(),
      treffpunkt: z.string(),
      ansprechpartner: z.string(),
      schichten: z.array(
        z.object({
          id: z.string(),
          bezeichnung: z.string(),
          datum: z.string(),
          start: z.string(),
          ende: z.string(),
          taetigkeit: z.string(),
          bedarf: z.number(),
          // Bestätigte Besetzung (Personalnummer + Name), damit der Einsatzzettel die Namen schon trägt
          besetzung: z.array(z.object({ pnr: z.string(), vorname: z.string(), nachname: z.string() })),
        })
      ),
    })
  ),
});
export type AuftragFeed = z.infer<typeof auftragFeedSchema>;

// Nur veröffentlichte und laufende Aufträge (keine Entwürfe); Besetzung nur mit Personalnummer und Name
export function baueAuftragFeed(jobs: Job[], zuweisung: Record<string, Array<{ pnr: string }>>, crew: Crew[], jetzt: string): AuftragFeed {
  const nachPnr = new Map(crew.map((c) => [c.pnr, c]));
  return {
    version: SCHNITTSTELLE_VERSION,
    erzeugtAm: jetzt,
    auftraege: jobs
      .filter((j) => j.status !== "Entwurf")
      .map((j) => ({
        id: j.id, kunde: j.kunde, titel: j.titel, ort: j.ort, plz: j.plz, datumVon: j.datumVon, datumBis: j.datumBis, treffpunkt: j.treffpunkt, ansprechpartner: j.ansprechpartner,
        schichten: j.schichten.map((s) => ({
          id: s.id, bezeichnung: s.bezeichnung, datum: s.datum, start: s.start, ende: s.ende, taetigkeit: s.taetigkeit, bedarf: s.bedarf,
          besetzung: (zuweisung[s.id] ?? []).flatMap((z) => {
            const c = nachPnr.get(z.pnr);
            return c ? [{ pnr: c.pnr, vorname: c.vorname, nachname: c.nachname }] : [];
          }),
        })),
      })),
  };
}

// ─── Vertrag 2: Stunden aus dem Einsatzzettel (PDF-Ablage) → neues System ───

export const stundenRueckmeldungSchema = z.object({
  version: z.literal(SCHNITTSTELLE_VERSION),
  // Wo kam es her? Verweis auf die PDF in der Ablage und ihr Hash (damit dieselbe Datei nie doppelt zählt)
  dateiRef: z.string().min(1).max(300),
  dateiHash: z.string().regex(/^[0-9a-f]{64}$/),
  auftragId: z.string().min(1).max(80),
  erkanntAm: z.string(),
  zeilen: z
    .array(
      z.object({
        pnr: z.string().min(1).max(40),
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        ende: z.string().regex(/^\d{2}:\d{2}$/),
        pausen: z.array(z.object({ von: z.string().regex(/^\d{2}:\d{2}$/), bis: z.string().regex(/^\d{2}:\d{2}$/) })).max(10),
        bemerkung: z.string().max(2000).default(""),
      })
    )
    .max(500),
});
export type StundenRueckmeldung = z.infer<typeof stundenRueckmeldungSchema>;

// Rückmeldung → Zeilen der Stundentabelle. Zeilen starten immer als „offen“ (Mensch prüft),
// Quelle „Zettel“, mit Verweis auf die PDF. Unbekannte Personalnummern werden gemeldet, nicht geraten.
export function stundenZeilenAusRueckmeldung(r: StundenRueckmeldung, jobs: Job[], crew: Crew[]): { zeilen: StundenRow[]; unbekanntePnr: string[] } {
  const job = jobs.find((j) => j.id === r.auftragId);
  const bekannt = new Set(crew.map((c) => c.pnr));
  const unbekannt = new Set<string>();
  const zeilen: StundenRow[] = [];
  r.zeilen.forEach((z, i) => {
    if (!bekannt.has(z.pnr)) {
      unbekannt.add(z.pnr);
      return;
    }
    zeilen.push({
      id: `zettel-${r.dateiHash.slice(0, 12)}-${i + 1}`, datum: z.datum, pnr: z.pnr, start: z.start, pausen: z.pausen, ende: z.ende, pauschale: 0, kunde: job?.kunde ?? "", auftrag: r.auftragId,
      spesen: 0, reiseKm: 0, reiseGesch: 0, bonus: 0, abzug: 0, bemerkung: z.bemerkung, status: "offen", quelle: "Zettel", sourceRef: r.dateiRef,
    });
  });
  return { zeilen, unbekanntePnr: [...unbekannt] };
}

// ─── Bausteine, die später gefüllt werden ───────────────────────────────────

export interface PdfDatei {
  ref: string;
  name: string;
  geaendertAm: string;
  bytes: number;
}

// Zugriff auf die Ablage der Einsatzzettel (Verzeichnis, S3, HTTP …). Nur lesend.
export interface PdfQuelle {
  liste(seit?: string): Promise<PdfDatei[]>;
  lade(ref: string): Promise<Uint8Array>;
}

// Liest aus einer PDF die Stunden. Liefert null, wenn die Datei nicht erkannt wird.
export interface StundenPdfLeser {
  lese(pdf: Uint8Array, ref: string): Promise<StundenRueckmeldung | null>;
}

// Standard und einzige Umsetzung in dieser Version: tut nichts
export const keinePdfQuelle: PdfQuelle = {
  async liste() {
    return [];
  },
  async lade() {
    throw new Error("Keine PDF-Quelle eingerichtet.");
  },
};
