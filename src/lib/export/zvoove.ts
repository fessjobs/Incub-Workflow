// zvoove-CSV für die Stundenschnellerfassung: konfigurierbare Mapping-Schicht
// (config/zvoove-mapping.json). Liegt unter docs/zvoove-sample.csv eine
// Beispieldatei, werden Trennzeichen, Zeichensatz, Datumsformat,
// Dezimaltrennzeichen und Spaltenreihenfolge daraus abgeleitet und in die
// JSON zurückgeschrieben. Validierung vor dem Download.
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { z } from "zod";
import type { DeductionRow, EntryRow } from "@/lib/einsatz/analytics";
import type { WageLine } from "@/lib/einsatz/wage";

export const ZVOOVE_FIELDS = ["personalnummer", "name", "datum", "lohnart", "stunden", "betrag", "faktor", "kunde", "einsatznummer", "projekt", "taetigkeit", "bemerkung", "leer"] as const;
export type ZvooveField = (typeof ZVOOVE_FIELDS)[number];

export const ZvooveMappingSchema = z.object({
  trennzeichen: z.string().min(1).max(2).default(";"),
  zeichensatz: z.enum(["utf-8", "utf-8-bom", "windows-1252"]).default("windows-1252"),
  datumsformat: z.enum(["DD.MM.YYYY", "YYYY-MM-DD", "DD.MM.YY"]).default("DD.MM.YYYY"),
  dezimaltrennzeichen: z.enum([",", "."]).default(","),
  kopfzeile: z.boolean().default(true),
  zeilenende: z.enum(["crlf", "lf"]).default("crlf"),
  spalten: z.array(z.object({ feld: z.enum(ZVOOVE_FIELDS), kopf: z.string() })).min(1),
  pflichtfelder: z.array(z.enum(ZVOOVE_FIELDS)).default(["personalnummer", "datum", "lohnart", "stunden", "kunde", "taetigkeit"]),
  // Betragszeilen (Fahrten, Spesen) mit ausgeben?
  betragszeilen: z.boolean().default(true),
  quelle: z.string().default("standard"),
  sampleHash: z.string().nullable().default(null),
});
export type ZvooveMapping = z.infer<typeof ZvooveMappingSchema>;

export const DEFAULT_MAPPING: ZvooveMapping = {
  trennzeichen: ";",
  zeichensatz: "windows-1252",
  datumsformat: "DD.MM.YYYY",
  dezimaltrennzeichen: ",",
  kopfzeile: true,
  zeilenende: "crlf",
  spalten: [
    { feld: "personalnummer", kopf: "Personalnummer" },
    { feld: "datum", kopf: "Datum" },
    { feld: "lohnart", kopf: "Lohnart" },
    { feld: "stunden", kopf: "Stunden" },
    { feld: "kunde", kopf: "Kunde" },
    { feld: "einsatznummer", kopf: "Auftrag" },
    { feld: "taetigkeit", kopf: "Tätigkeit" },
    { feld: "betrag", kopf: "Betrag" },
    { feld: "bemerkung", kopf: "Bemerkung" },
  ],
  pflichtfelder: ["personalnummer", "datum", "lohnart", "stunden", "kunde", "taetigkeit"],
  betragszeilen: true,
  quelle: "standard",
  sampleHash: null,
};

export const CONFIG_PATH = path.join(process.cwd(), "config", "zvoove-mapping.json");
export const SAMPLE_PATH = path.join(process.cwd(), "docs", "zvoove-sample.csv");

// ─── Beispiel-Erkennung ─────────────────────────────────────────────────────

const HEADER_SYNONYMS: Array<[RegExp, ZvooveField]> = [
  [/^(personal[\s._-]*n(umme)?r|pers[\s._-]*nr|pnr|mitarbeiter[\s._-]*nr|ma[\s._-]*nr|persnr)$/i, "personalnummer"],
  [/^(name|mitarbeiter|person)$/i, "name"],
  [/^(datum|tag|leistungsdatum|arbeitstag)$/i, "datum"],
  [/^(lohnart|la|lohnart[\s._-]*nr|lohnartnr)$/i, "lohnart"],
  [/^(stunden|std|anzahl|menge|wert|stunden[\s._-]*anzahl)$/i, "stunden"],
  [/^(betrag|euro|eur|wert[\s._-]*eur)$/i, "betrag"],
  [/^(faktor|zuschlag[\s._-]*%|prozent)$/i, "faktor"],
  [/^(kunde|kunden[\s._-]*nr|auftraggeber|firma|entleiher)$/i, "kunde"],
  [/^(auftrag|auftrags[\s._-]*nr|einsatz|einsatz[\s._-]*nr|kostenstelle|kst|projekt[\s._-]*nr)$/i, "einsatznummer"],
  [/^(projekt|veranstaltung|event)$/i, "projekt"],
  [/^(t(ä|ae)tigkeit|qualifikation|funktion|position)$/i, "taetigkeit"],
  [/^(bemerkung|kommentar|text|notiz|info)$/i, "bemerkung"],
];

export function decodeSample(bytes: Buffer): { text: string; zeichensatz: ZvooveMapping["zeichensatz"] } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: bytes.subarray(3).toString("utf8"), zeichensatz: "utf-8-bom" };
  // UTF-8-Plausibilität: Sequenzen 0xC3 0x80–0xBF (ä, ö, ü …)
  let utf8Pairs = 0;
  let highBytes = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] >= 0x80) highBytes++;
    if ((bytes[i] === 0xc3 || bytes[i] === 0xc2) && i + 1 < bytes.length && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xbf) utf8Pairs++;
  }
  if (highBytes === 0 || utf8Pairs * 2 >= highBytes) return { text: bytes.toString("utf8"), zeichensatz: "utf-8" };
  return { text: decodeCp1252(bytes), zeichensatz: "windows-1252" };
}

export function detectMappingFromSample(bytes: Buffer): ZvooveMapping {
  const { text, zeichensatz } = decodeSample(bytes);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("Beispieldatei ist leer.");
  const head = lines[0];
  const counts: Array<[string, number]> = [";", ",", "\t", "|"].map((d) => [d, head.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  const trennzeichen = counts[0][1] > 0 ? counts[0][0] : ";";
  const headers = head.split(trennzeichen).map((h) => h.trim().replace(/^"|"$/g, ""));
  const kopfzeile = headers.some((h) => /[A-Za-zÄÖÜäöü]{3,}/.test(h) && !/^\d/.test(h));
  const spalten: ZvooveMapping["spalten"] = headers.map((h, i) => {
    if (!kopfzeile) return { feld: "leer", kopf: `Spalte${i + 1}` };
    const hit = HEADER_SYNONYMS.find(([re]) => re.test(h.replace(/\s+/g, " ").trim()));
    return { feld: hit ? hit[1] : "leer", kopf: h };
  });
  // Datumsformat / Dezimaltrennzeichen aus der ersten Datenzeile
  const data = (kopfzeile ? lines[1] : lines[0])?.split(trennzeichen).map((c) => c.trim().replace(/^"|"$/g, "")) ?? [];
  let datumsformat: ZvooveMapping["datumsformat"] = "DD.MM.YYYY";
  let dezimaltrennzeichen: ZvooveMapping["dezimaltrennzeichen"] = ",";
  for (const cell of data) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) datumsformat = "YYYY-MM-DD";
    else if (/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(cell)) datumsformat = "DD.MM.YY";
    else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cell)) datumsformat = "DD.MM.YYYY";
    if (/^-?\d+\.\d+$/.test(cell)) dezimaltrennzeichen = ".";
    if (/^-?\d+,\d+$/.test(cell)) dezimaltrennzeichen = ",";
  }
  const zeilenende = text.includes("\r\n") ? "crlf" : "lf";
  const pflicht = DEFAULT_MAPPING.pflichtfelder.filter((f) => spalten.some((s) => s.feld === f));
  return {
    trennzeichen,
    zeichensatz,
    datumsformat,
    dezimaltrennzeichen,
    kopfzeile,
    zeilenende,
    spalten,
    pflichtfelder: pflicht.length > 0 ? pflicht : ["personalnummer", "datum", "lohnart", "stunden"],
    betragszeilen: spalten.some((s) => s.feld === "betrag"),
    quelle: "docs/zvoove-sample.csv",
    sampleHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

// Lädt die Konfiguration; leitet sie bei neuer/geänderter Beispieldatei ab
// und schreibt sie (best-effort) in die JSON zurück.
export function loadZvooveMapping(): { mapping: ZvooveMapping; hinweis: string | null } {
  let mapping = DEFAULT_MAPPING;
  let hinweis: string | null = null;
  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = ZvooveMappingSchema.safeParse(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
      if (parsed.success) mapping = parsed.data;
      else hinweis = `config/zvoove-mapping.json ungültig (${parsed.error.errors[0].message}) – Standard verwendet.`;
    }
  } catch (err) {
    hinweis = `config/zvoove-mapping.json nicht lesbar: ${(err as Error).message}`;
  }
  try {
    if (existsSync(SAMPLE_PATH)) {
      const bytes = readFileSync(SAMPLE_PATH);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (mapping.sampleHash !== hash) {
        mapping = detectMappingFromSample(bytes);
        try {
          writeFileSync(CONFIG_PATH, JSON.stringify(mapping, null, 2) + "\n");
        } catch {
          hinweis = "Mapping aus docs/zvoove-sample.csv abgeleitet (Konfiguration konnte nicht gespeichert werden – Dateisystem schreibgeschützt).";
        }
      }
    }
  } catch (err) {
    hinweis = `Beispieldatei konnte nicht ausgewertet werden: ${(err as Error).message}`;
  }
  return { mapping, hinweis };
}

// ─── Zeilen aufbauen ────────────────────────────────────────────────────────

export type ZvooveRow = {
  personalnummer: string;
  name: string;
  datum: string; // YYYY-MM-DD
  lohnart: string;
  stunden: number | null;
  betrag: number | null;
  faktor: number;
  kunde: string;
  einsatznummer: string;
  projekt: string;
  taetigkeit: string;
  bemerkung: string;
  // Herkunft (für Fehlermeldungen)
  quelleId: string;
};

export function buildZvooveRows(rows: EntryRow[], wageLines: Map<string, WageLine[]>, deductions: DeductionRow[], mapping: ZvooveMapping): ZvooveRow[] {
  const out: ZvooveRow[] = [];
  for (const r of rows) {
    for (const l of wageLines.get(r.id) ?? []) {
      const isHours = l.einheit === "Stunden";
      if (!isHours && !mapping.betragszeilen) continue;
      out.push({
        personalnummer: r.employee.personalnummer ?? "",
        name: `${r.employee.nachname}, ${r.employee.vorname}`,
        datum: r.datumKey,
        lohnart: l.lohnart,
        stunden: isHours ? l.menge : l.einheit === "km" ? l.menge : null,
        betrag: l.betrag,
        faktor: l.faktor,
        kunde: r.customer.name,
        einsatznummer: r.assignment.einsatznummer,
        projekt: r.assignment.projekt,
        taetigkeit: r.taetigkeit,
        bemerkung: `${l.bezeichnung} · ${r.shift.bezeichnung}`,
        quelleId: r.id,
      });
    }
  }
  for (const d of deductions) {
    out.push({
      personalnummer: d.employee.personalnummer ?? "",
      name: `${d.employee.nachname}, ${d.employee.vorname}`,
      datum: d.datumKey,
      lohnart: d.line.lohnart,
      stunden: d.line.einheit === "Stunden" ? d.line.menge : null,
      betrag: d.line.betrag,
      faktor: 1,
      kunde: "",
      einsatznummer: "",
      projekt: "",
      taetigkeit: "",
      bemerkung: `Abzug: ${d.line.grundlage}`,
      quelleId: d.id,
    });
  }
  return out;
}

export type ZvooveError = { zeile: number; personalnummer: string; name: string; datum: string; problem: string };

export function validateZvooveRows(rows: ZvooveRow[], options: { von: string; bis: string; bekannteLohnarten: Set<string>; mapping: ZvooveMapping }): ZvooveError[] {
  const errors: ZvooveError[] = [];
  const pflicht = new Set(options.mapping.pflichtfelder);
  rows.forEach((r, i) => {
    const base = { zeile: i + 1, personalnummer: r.personalnummer, name: r.name, datum: r.datum };
    if (pflicht.has("personalnummer") && !r.personalnummer) errors.push({ ...base, problem: "Personalnummer fehlt" });
    if (r.stunden !== null && r.stunden === 0 && r.betrag === null) errors.push({ ...base, problem: "Stunden gleich null" });
    if (r.stunden === null && r.betrag === null) errors.push({ ...base, problem: "weder Stunden noch Betrag" });
    if (!options.bekannteLohnarten.has(r.lohnart)) errors.push({ ...base, problem: `unbekannte Lohnart ${r.lohnart}` });
    if (r.datum < options.von || r.datum > options.bis) errors.push({ ...base, problem: `Datum ${r.datum} außerhalb des Zeitraums` });
    if (pflicht.has("kunde") && !r.kunde && !r.bemerkung.startsWith("Abzug")) errors.push({ ...base, problem: "Kunde/Auftrag fehlt" });
    if (pflicht.has("taetigkeit") && !r.taetigkeit && !r.bemerkung.startsWith("Abzug")) errors.push({ ...base, problem: "Tätigkeit fehlt" });
  });
  return errors;
}

// ─── CSV-Ausgabe ────────────────────────────────────────────────────────────

function formatDate(key: string, format: ZvooveMapping["datumsformat"]): string {
  const [y, m, d] = key.split("-");
  if (format === "YYYY-MM-DD") return key;
  if (format === "DD.MM.YY") return `${d}.${m}.${y.slice(2)}`;
  return `${d}.${m}.${y}`;
}

function formatNumber(n: number | null, dec: ZvooveMapping["dezimaltrennzeichen"], digits = 2): string {
  if (n === null) return "";
  const s = n.toFixed(digits);
  return dec === "," ? s.replace(".", ",") : s;
}

function escapeCell(v: string, delimiter: string): string {
  if (v.includes(delimiter) || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function renderZvooveCsv(rows: ZvooveRow[], mapping: ZvooveMapping): string {
  const eol = mapping.zeilenende === "crlf" ? "\r\n" : "\n";
  const lines: string[] = [];
  if (mapping.kopfzeile) lines.push(mapping.spalten.map((s) => escapeCell(s.kopf, mapping.trennzeichen)).join(mapping.trennzeichen));
  for (const r of rows) {
    const cells = mapping.spalten.map((s) => {
      switch (s.feld) {
        case "personalnummer":
          return r.personalnummer;
        case "name":
          return r.name;
        case "datum":
          return formatDate(r.datum, mapping.datumsformat);
        case "lohnart":
          return r.lohnart;
        case "stunden":
          return formatNumber(r.stunden, mapping.dezimaltrennzeichen);
        case "betrag":
          return formatNumber(r.betrag, mapping.dezimaltrennzeichen);
        case "faktor":
          return formatNumber(r.faktor, mapping.dezimaltrennzeichen);
        case "kunde":
          return r.kunde;
        case "einsatznummer":
          return r.einsatznummer;
        case "projekt":
          return r.projekt;
        case "taetigkeit":
          return r.taetigkeit;
        case "bemerkung":
          return r.bemerkung;
        default:
          return "";
      }
    });
    lines.push(cells.map((c) => escapeCell(c, mapping.trennzeichen)).join(mapping.trennzeichen));
  }
  return lines.join(eol) + eol;
}

// Windows-1252: Latin-1 plus die Sonderzeichen im Bereich 0x80–0x9F
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const CP1252_REVERSE: Record<number, number> = Object.fromEntries(Object.entries(CP1252_EXTRA).map(([u, b]) => [b, Number(u)]));

export function encodeCp1252(text: string): Buffer {
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out[n++] = cp;
    else if (CP1252_EXTRA[cp] !== undefined) out[n++] = CP1252_EXTRA[cp];
    else out[n++] = 0x3f; // '?'
  }
  return out.subarray(0, n);
}

export function decodeCp1252(bytes: Buffer): string {
  let s = "";
  for (const b of bytes) s += String.fromCodePoint(b >= 0x80 && b <= 0x9f ? (CP1252_REVERSE[b] ?? b) : b);
  return s;
}

export function encodeCsv(text: string, zeichensatz: ZvooveMapping["zeichensatz"]): Buffer {
  if (zeichensatz === "windows-1252") return encodeCp1252(text);
  if (zeichensatz === "utf-8-bom") return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
  return Buffer.from(text, "utf8");
}
