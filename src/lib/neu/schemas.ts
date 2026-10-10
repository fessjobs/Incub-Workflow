// Zod-Schemas an der Grenze des neuen Systems. Admin-Daten werden als JSON
// je Art gespeichert; hier steht, welche Form pro Art erlaubt ist.
import { z } from "zod";

export const KINDS = ["crew", "job", "bewerbung", "auftrag", "stunde", "zuweisung", "briefing", "beleg", "notiz", "einst", "benutzer"] as const;
export type Kind = (typeof KINDS)[number];

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zeit = z.string().regex(/^(\d{2}:\d{2})?$/);
const kurz = z.string().max(500);
const lang = z.string().max(4000);
const taetigkeit = z.enum(["Stagehand", "Catering", "Bar", "Einlass", "Stapler", "Messebau", "Promotion", "Logistik"]);

const schicht = z.object({
  id: z.string().min(1).max(80),
  bezeichnung: kurz,
  datum,
  start: zeit,
  ende: zeit,
  taetigkeit,
  bedarf: z.number().int().min(0).max(1000),
});

const job = z.object({
  id: z.string().min(1).max(80),
  kunde: kurz,
  titel: kurz,
  ort: kurz,
  plz: z.string().max(10),
  datumVon: datum,
  datumBis: datum,
  schichten: z.array(schicht).max(50),
  beschreibung: lang,
  dresscode: kurz,
  psa: z.array(kurz).max(30),
  hoehe: z.boolean(),
  verpflegung: kurz,
  parken: kurz,
  treffpunkt: kurz,
  ansprechpartner: kurz,
  ablauf: z.array(kurz).max(30),
  status: z.enum(["Entwurf", "offen", "voll", "laufend", "abgerechnet"]),
  quelle: z.enum(["Planung Regios", "manuell"]),
  zusatzModule: z.array(z.string().max(40)).max(10).optional(),
  importKey: z.string().max(200).optional(),
});

const vertrag = z.object({
  vertragsart: z.enum(["Minijob", "kurzfristig", "Werkstudent", "TZ", "VZ"]),
  wochenstunden: z.number().min(0).max(80),
  monatsgrenzeStd: z.number().min(0).max(400).nullable(),
  monatsgrenzeEur: z.number().min(0).max(100000).nullable(),
  stundenlohn: z.number().min(0).max(500),
  gueltigVon: datum,
  gueltigBis: datum.nullable(),
  docusignId: kurz,
});

const crew = z
  .object({
    id: z.string().min(1).max(80),
    pnr: z.string().max(40),
    vorname: kurz,
    nachname: kurz,
    telefon: z.string().max(60),
    email: z.string().max(200),
    wohnort: kurz,
    plz: z.string().max(10),
    pool: z.enum(["Stuttgart", "Mannheim", "Frankfurt", "Idar-Oberstein", "NRW"]),
    status: z.enum(["Bewerber", "aktiv", "gesperrt", "ausgeschieden"]),
    xp: z.number().int(),
    einsaetze: z.number().int().min(0),
    arbeitstageJahr: z.number().int().min(0),
    profile: z.record(z.unknown()).nullable(),
    contract: vertrag.nullable(),
    unterweisungen: z.record(
      z.object({
        version: z.string().max(60),
        bestaetigtAm: datum,
        quizScore: z.number().min(0).max(1),
        video: z.enum(["player", "manuell", "keins"]).optional(),
        unterschriftAm: z.string().max(40).optional(),
        nachweisId: z.string().max(80).optional(),
        // Die Unterschrift selbst gehört nur ins Nachweis-PDF, nie in den Datensatz
        unterschrift: z.undefined().optional(),
      })
    ),
    unterweisungStart: z.object({ modul: z.string().max(40), am: z.string().max(40) }).optional(),
    ratings: z.array(z.record(z.unknown())).max(500),
    notizen: lang,
    freigabe: z.object({ status: z.enum(["bestaetigt", "abgelehnt"]), am: datum, von: z.string().max(200), notiz: z.string().max(1000) }).optional(),
    kleidungAusgabe: z
      .array(z.object({ id: z.string().min(1).max(80), artikel: z.string().max(80), groesse: z.string().max(20), pfandEur: z.number().min(0).max(10000), ausgegebenAm: datum, zurueckAm: datum.nullable(), notiz: z.string().max(500) }))
      .max(60)
      .optional(),
    kontakt: z.object({ vorlage: z.string().max(80), am: datum, von: z.string().max(200) }).optional(),
    importQuelle: z.object({ quelle: z.literal("zvoove"), am: datum }).optional(),
  })
  .passthrough();

const bewerbung = z.object({
  id: z.string().min(1).max(80),
  jobId: z.string().min(1).max(80),
  pnr: z.string().max(40),
  schichtIds: z.array(z.string().max(80)).max(50),
  eigeneAnreise: z.boolean(),
  abfahrtsort: kurz,
  fahrgemeinschaftPlaetze: z.number().int().min(0).max(20),
  hatVertrag: z.boolean(),
  status: z.enum(["neu", "passt", "Warteliste", "abgelehnt", "bestätigt"]),
  notizIntern: lang,
  kommentar: lang,
  eingegangen: datum,
});

const auftrag = z.object({ id: z.string().min(1).max(80), kunde: kurz, titel: kurz, taetigkeit });

const stunde = z.object({
  id: z.string().min(1).max(80),
  datum,
  pnr: z.string().max(40),
  start: zeit,
  pausen: z.array(z.object({ von: zeit, bis: zeit })).max(10),
  ende: zeit,
  pauschale: z.number().min(0).max(24),
  kunde: kurz,
  auftrag: z.string().max(80),
  spesen: z.number().min(0).max(100000),
  reiseKm: z.number().min(0).max(100000),
  reiseGesch: z.number().min(0).max(100000),
  bonus: z.number().min(0).max(100000),
  abzug: z.number().min(0).max(100000),
  bemerkung: lang,
  status: z.enum(["offen", "geprueft", "freigegeben", "exportiert"]),
  quelle: z.enum(["Zettel", "App", "manuell"]),
  sourceRef: z.string().max(200).nullable(),
});

const zuweisung = z.array(z.object({ pnr: z.string().max(40), begruendung: lang.nullable() })).max(500);
const briefing = z.string().max(40);
const beleg = z
  .object({ id: z.string().min(1).max(80), zeit: z.string().max(40), pnr: z.string().max(40), art: z.string().max(40), betrag: z.number().nullable(), datum: z.string().max(10), haendler: kurz, zweck: kurz, auftragId: z.string().max(80), dateiname: z.string().max(300) })
  .passthrough();
const notiz = z.object({ id: z.string().min(1).max(80), zeit: z.string().max(40), bereich: z.string().max(100), text: lang });
const einst = z.record(z.unknown());
// Zugriff weiterer Konten auf das neue Dashboard (Konten selbst bleiben im bisherigen System)
const benutzer = z.object({ userId: z.string().min(1).max(80), name: z.string().max(200), email: z.string().max(200), rolle: z.enum(["dispo", "buchhaltung", "lesen"]) });

export const KIND_SCHEMA: Record<Kind, z.ZodTypeAny> = { crew, job, bewerbung, auftrag, stunde, zuweisung, briefing, beleg, notiz, einst, benutzer };

export const opSchema = z.object({
  kind: z.enum(KINDS),
  id: z.string().min(1).max(120),
  // null = löschen
  data: z.unknown().nullable(),
  // Stand, auf dem die Änderung beruht (fehlt bei neuen Datensätzen)
  rev: z.number().int().min(0).optional(),
});

export const auditSchema = z.object({
  id: z.string().min(1).max(120),
  zeitpunkt: z.string().max(40),
  user: z.string().max(200),
  tabelle: z.string().max(80),
  datensatz: z.string().max(120),
  feld: z.string().max(80),
  alt: z.string().max(2000),
  neu: z.string().max(2000),
  grund: z.string().max(2000).nullable(),
});

export const syncSchema = z.object({
  ops: z.array(opSchema).max(500),
  audit: z.array(auditSchema).max(500).default([]),
});
export type Op = z.infer<typeof opSchema>;
