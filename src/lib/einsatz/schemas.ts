// Zod-Schemas für alle API-/Action-Grenzen des Einsatzmoduls.
import { z } from "zod";
import { isValidDateKey, isValidTime } from "./tz";

export const dateKey = z.string().refine(isValidDateKey, "Datum im Format JJJJ-MM-TT erwartet");
export const timeHHmm = z.string().refine(isValidTime, "Uhrzeit im Format HH:mm erwartet");
export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

// ─── Parser ─────────────────────────────────────────────────────────────────

export const ParseRequestSchema = z.object({
  rawText: z.string().min(5, "Bitte Rohtext einfügen.").max(20000),
});

// ─── Einsatz aus der Vorschau speichern ──────────────────────────────────────

export const PreviewPersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rolle: z.enum(["MITARBEITER", "ANSPRECHPARTNER", "SPARE"]).default("MITARBEITER"),
  // Zuordnung zum Stamm (null = neuen Mitarbeiter anlegen)
  employeeId: z.string().nullable().default(null),
  neuAnlegen: z.boolean().default(false),
});

export const PreviewShiftSchema = z.object({
  bezeichnung: z.string().trim().min(1).max(120),
  taetigkeit: z.string().trim().max(120).default(""),
  datum: dateKey,
  start: timeHHmm,
  endeDatum: dateKey,
  ende: timeHHmm,
  treffpunkt: optionalText,
  anzahlSoll: z.number().int().min(0).max(999).nullable().default(null),
  garantieStunden: z.number().min(0).max(24).nullable().default(null),
  personen: z.array(PreviewPersonSchema).default([]),
});

export const CreateAssignmentSchema = z.object({
  customerId: z.string().nullable().default(null),
  kundeName: z.string().trim().max(200).nullable().default(null),
  projekt: z.string().trim().min(1, "Projekt fehlt.").max(200),
  artist: optionalText,
  einsatzort: z.string().trim().min(1, "Einsatzort fehlt.").max(300),
  bundesland: z.string().trim().length(2).nullable().optional(),
  einsatzbereich: optionalText,
  aueVertragRef: optionalText,
  notizen: optionalText,
  rawInput: z.string().max(20000).nullable().default(null),
  parsedJson: z.unknown().optional(),
  schichten: z.array(PreviewShiftSchema).min(1, "Mindestens eine Schicht."),
  // Konflikte wurden angezeigt und bewusst akzeptiert
  konflikteAkzeptiert: z.boolean().default(false),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>;

// ─── Zeiterfassung über Token ────────────────────────────────────────────────

export const TripSchema = z.object({
  von: z.string().trim().min(1, "Start-Ort fehlt.").max(200),
  nach: z.string().trim().min(1, "Stop-Ort fehlt.").max(200),
  km: z.number().min(0).max(5000),
});

export const TimeEntrySubmitSchema = z.object({
  startDatum: dateKey,
  start: timeHHmm,
  endeDatum: dateKey,
  ende: timeHHmm,
  pauseMinuten: z.number().int().min(0).max(600).default(0),
  taetigkeit: z.string().trim().max(120).default(""),
  notiz: z.string().trim().max(1000).default(""),
  pkw: z.boolean().default(false),
  pkwArt: z.enum(["PRIVAT", "FIRMA"]).nullable().default(null),
  fahrten: z.array(TripSchema).max(20).default([]),
  spesen: z.boolean().default(false),
  spesenBetrag: z.number().min(0).max(10000).nullable().default(null),
  unterweisungBestaetigt: z.literal(true, { errorMap: () => ({ message: "Sicherheitsunterweisung muss bestätigt werden." }) }),
  unterschrift: z.string().min(100, "Unterschrift fehlt."),
  geraet: z.string().max(200).optional(),
  // Offline-Puffer: Zeitpunkt der ursprünglichen Erfassung
  erfasstAm: z.string().datetime().optional(),
});
export type TimeEntrySubmitInput = z.infer<typeof TimeEntrySubmitSchema>;

export const CrewSubmitSchema = z.object({
  shiftAssignmentId: z.string().min(1),
  eintrag: TimeEntrySubmitSchema,
});

// Die Crew korrigiert sich selbst: Name richtigstellen, Person ergänzen.
// Beides verlangt Vor- und Nachnamen – die Konkretisierung nach AÜG benennt
// die Person namentlich, ein einteiliger Eintrag taugt dafür nicht.
const personName = {
  vorname: z.string().trim().min(2, "Vorname fehlt.").max(80),
  nachname: z.string().trim().min(2, "Nachname fehlt.").max(80),
};

export const CrewNameSchema = z.object({
  aktion: z.literal("name-korrigieren"),
  shiftAssignmentId: z.string().min(1),
  ...personName,
});

export const CrewPersonSchema = z.object({
  aktion: z.literal("person-ergaenzen"),
  shiftId: z.string().min(1),
  ...personName,
});

// Zeiten der ersten Person für alle auf derselben Schicht übernehmen
export const CrewZeitenSchema = z.object({
  aktion: z.literal("zeiten-fuer-alle"),
  shiftAssignmentId: z.string().min(1),
});

export const CustomerSignSchema = z.object({
  kundeName: z.string().trim().min(2, "Name des Kunden fehlt.").max(200),
  unterschrift: z.string().min(100, "Unterschrift fehlt."),
});

// ─── Dispo: Einsatz nachträglich bearbeiten ─────────────────────────────────

export const UpdateAssignmentSchema = z.object({
  projekt: z.string().trim().min(1, "Projekt fehlt.").max(200),
  artist: optionalText,
  customerId: z.string().min(1, "Bitte einen Kunden wählen."),
  einsatzort: z.string().trim().min(1, "Einsatzort fehlt.").max(300),
  einsatzbereich: optionalText,
  aueVertragRef: optionalText,
  bundesland: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .nullable()
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Bundesland als zweistelliges Kürzel"),
  notizen: optionalText,
});

export const UpdateShiftSchema = z.object({
  bezeichnung: z.string().trim().min(1, "Bezeichnung fehlt.").max(120),
  taetigkeit: z.string().trim().max(120).default(""),
  datum: dateKey,
  start: timeHHmm,
  endeDatum: dateKey,
  ende: timeHHmm,
  treffpunkt: optionalText,
  anzahlSoll: z.number().int().min(0).max(999).nullable().default(null),
  garantieStunden: z.number().min(0).max(24).nullable().default(null),
});

export const RenamePersonSchema = z.object({
  vorname: z.string().trim().min(2, "Vorname fehlt.").max(80),
  nachname: z.string().trim().min(2, "Nachname fehlt.").max(80),
});

// Namen aus der Zwischenablage: erst prüfen, dann übernehmen
export const PastePreviewSchema = z.object({
  shiftId: z.string().min(1),
  text: z.string().min(1, "Bitte Namen einfügen.").max(20000),
});

export const PasteApplySchema = z.object({
  shiftId: z.string().min(1),
  personen: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        rolle: z.enum(["MITARBEITER", "ANSPRECHPARTNER", "SPARE"]).default("MITARBEITER"),
        employeeId: z.string().nullable().default(null),
        neuAnlegen: z.boolean().default(false),
      })
    )
    .min(1, "Keine Person ausgewählt."),
});

// ─── Backend: interne Bewertung nach dem Einsatz ────────────────────────────

export const RatingSchema = z.object({
  // null nimmt eine gesetzte Bewertung zurück
  wert: z.enum(["NEGATIV", "NEUTRAL", "POSITIV"]).nullable(),
  notiz: z.string().trim().max(500, "Notiz zu lang (max. 500 Zeichen).").transform((v) => (v === "" ? null : v)).nullable().optional(),
});

// ─── Dispo: Korrektur nach Signatur ─────────────────────────────────────────

export const CorrectionSchema = z.object({
  startDatum: dateKey,
  start: timeHHmm,
  endeDatum: dateKey,
  ende: timeHHmm,
  pauseMinuten: z.number().int().min(0).max(600),
  taetigkeit: z.string().trim().max(120).default(""),
  notiz: z.string().trim().max(1000).default(""),
  pkw: z.boolean().default(false),
  pkwArt: z.enum(["PRIVAT", "FIRMA"]).nullable().default(null),
  spesen: z.boolean().default(false),
  spesenBetrag: z.number().min(0).max(10000).nullable().default(null),
  korrekturGrund: z.string().trim().min(3, "Grund für die Korrektur angeben.").max(500),
});

// ─── Stammdaten ─────────────────────────────────────────────────────────────

export const CustomerSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(200),
  adresse: optionalText,
  ustid: optionalText,
  ansprechpartner: optionalText,
  ansprechpartnerEmail: z.string().trim().email("Ungültige E-Mail").or(z.literal("")).transform((v) => v || null).nullable().optional(),
  ansprechpartnerTelefon: optionalText,
  standardEinsatzort: optionalText,
  bundesland: z.string().trim().max(2).transform((v) => v || null).nullable().optional(),
  aueVertragRef: optionalText,
  aktiv: z.boolean().default(true),
});

export const EmployeeSchema = z.object({
  vorname: z.string().trim().min(1, "Vorname fehlt.").max(100),
  nachname: z.string().trim().min(1, "Nachname fehlt.").max(100),
  personalnummer: z.string().trim().max(50).transform((v) => v || null).nullable().optional(),
  email: z.string().trim().email("Ungültige E-Mail").or(z.literal("")).transform((v) => v || null).nullable().optional(),
  mobil: optionalText,
  geburtsdatum: z.string().trim().refine((v) => v === "" || isValidDateKey(v), "Datum im Format JJJJ-MM-TT").transform((v) => v || null).nullable().optional(),
  status: z.enum(["AKTIV", "INAKTIV"]).default("AKTIV"),
  zulagen: z.string().trim().max(500).default(""),
  zvooveId: optionalText,
});

export const WageRuleSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(120),
  typ: z.enum(["NORMAL", "NACHT", "SONNTAG", "FEIERTAG", "GARANTIE", "FAHRT_PRIVAT", "FAHRT_FIRMA", "ZULAGE", "SPESEN", "ABZUG"]),
  lohnart: z.string().trim().min(1, "Lohnart fehlt.").max(20),
  faktor: z.number().min(0).max(10).default(1),
  aktiv: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  bedingung: z.string().default("{}"),
});

export const DeductionSchema = z.object({
  employeeId: z.string().min(1),
  datum: dateKey,
  lohnart: z.string().trim().min(1).max(20),
  stunden: z.number().min(0).max(999).nullable().default(null),
  betrag: z.number().min(0).max(100000).nullable().default(null),
  grund: z.string().trim().min(2, "Grund fehlt.").max(300),
});

// ─── Auswertung / Export ────────────────────────────────────────────────────

export const AnalyticsFilterSchema = z.object({
  von: dateKey.optional(),
  bis: dateKey.optional(),
  employeeId: z.string().optional(),
  customerId: z.string().optional(),
  assignmentId: z.string().optional(),
  taetigkeit: z.string().max(120).optional(),
  review: z.enum(["ERFASST", "GEPRUEFT", "FREIGEGEBEN"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});
export type AnalyticsFilter = z.infer<typeof AnalyticsFilterSchema>;

export const ExportRequestSchema = z.object({
  format: z.enum(["xlsx", "zvoove"]),
  von: dateKey,
  bis: dateKey,
  customerId: z.string().optional(),
  employeeId: z.string().optional(),
  // fehlerhafte Zeilen weglassen statt abzubrechen
  ohneFehler: z.coerce.boolean().default(false),
  archivieren: z.coerce.boolean().default(true),
});

// ─── Abrechnung ─────────────────────────────────────────────────────────────

// Was die Dispo vor der Freigabe für die Buchhaltung hinterlegt.
export const AbrechnungAngabenSchema = z.object({
  angebotsnummer: z.string().trim().max(60, "Angebotsnummer ist zu lang.").transform((v) => v || null).nullable().default(null),
  konditionen: z.string().trim().max(2000, "Konditionen sind zu lang.").transform((v) => v || null).nullable().default(null),
  abrechnungHinweis: z.string().trim().max(2000, "Beschreibung ist zu lang.").transform((v) => v || null).nullable().default(null),
});

export const RechnungSchema = z.object({
  rechnungsnummer: z.string().trim().min(1, "Rechnungsnummer fehlt.").max(60, "Rechnungsnummer ist zu lang."),
});

// Was die Buchhaltung zusätzlich zu den Stunden auf die Abrechnung nimmt.
// Der Betrag wird immer positiv erfasst, das Vorzeichen steckt in der Art.
export const ErgaenzungSchema = z.object({
  art: z.enum(["BONUS", "FAHRTKOSTEN", "SPESEN", "ZUSCHLAG", "ABZUG", "SONSTIGES"]),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein.").max(1000000, "Betrag ist zu groß."),
  employeeId: z.string().trim().transform((v) => v || null).nullable().default(null),
  bemerkung: z.string().trim().max(300, "Bemerkung ist zu lang.").transform((v) => v || null).nullable().default(null),
});
