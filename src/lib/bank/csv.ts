// Robuster Parser für Kontoauszugs-CSV deutscher Banken (Sparkasse, VR, DKB,
// N26, ING …). Erkennt Trennzeichen, Kopfzeile und Spalten heuristisch.

export type ParsedTransaction = {
  bookingDate: Date;
  amount: number; // negativ = Ausgabe
  counterparty: string | null;
  purpose: string | null;
  raw: Record<string, string>;
};

const DATE_KEYS = ["buchungstag", "buchungsdatum", "datum", "valuta", "wertstellung", "date"];
const AMOUNT_KEYS = ["betrag", "umsatz", "betrag (eur)", "amount", "value"];
const PARTY_KEYS = [
  "beguenstigter",
  "begünstigter",
  "zahlungspflichtiger",
  "empfänger",
  "empfaenger",
  "auftraggeber",
  "name",
  "partner",
  "beguenstigter/zahlungspflichtiger",
];
const PURPOSE_KEYS = ["verwendungszweck", "buchungstext", "vorgang", "beschreibung", "referenz", "purpose", "text"];

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(sample: string): string {
  const semis = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  if (tabs > semis && tabs > commas) return "\t";
  return semis >= commas ? ";" : ",";
}

function parseGermanAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/["'\s€]/g, "").replace(/EUR/gi, "");
  if (!s) return null;
  const neg = /^-/.test(s) || /-$/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "").replace(/^-|-$/g, "");
  // Deutsches Format: 1.234,56 → Punkt = Tausender, Komma = Dezimal
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  // DD.MM.YYYY oder DD.MM.YY
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function findColumn(header: string[], keys: string[]): number {
  const lower = header.map((h) => h.toLowerCase().replace(/["']/g, "").trim());
  // exakte Treffer zuerst
  for (const key of keys) {
    const i = lower.indexOf(key);
    if (i >= 0) return i;
  }
  // Teilstring
  for (let i = 0; i < lower.length; i++) {
    if (keys.some((k) => lower[i].includes(k))) return i;
  }
  return -1;
}

export type CsvParseResult = {
  transactions: ParsedTransaction[];
  skipped: number;
  error?: string;
};

export function parseBankCsv(content: string): CsvParseResult {
  // BOM entfernen, Zeilen splitten
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { transactions: [], skipped: 0, error: "Datei enthält keine Buchungen." };

  const delim = detectDelimiter(lines.slice(0, 5).join("\n"));

  // Kopfzeile finden: erste Zeile, die eine Datums- UND eine Betragsspalte hat
  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitLine(lines[i], delim);
    if (findColumn(cols, DATE_KEYS) >= 0 && findColumn(cols, AMOUNT_KEYS) >= 0) {
      headerIdx = i;
      header = cols;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      transactions: [],
      skipped: 0,
      error: "Kopfzeile mit Datum und Betrag nicht gefunden. Bitte CSV-Export der Bank verwenden.",
    };
  }

  const dateCol = findColumn(header, DATE_KEYS);
  const amountCol = findColumn(header, AMOUNT_KEYS);
  const partyCol = findColumn(header, PARTY_KEYS);
  const purposeCol = findColumn(header, PURPOSE_KEYS);

  const transactions: ParsedTransaction[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delim);
    if (cols.length <= Math.max(dateCol, amountCol)) {
      skipped++;
      continue;
    }
    const date = parseDate(cols[dateCol]);
    const amount = parseGermanAmount(cols[amountCol]);
    if (!date || amount === null) {
      skipped++;
      continue;
    }
    const raw: Record<string, string> = {};
    header.forEach((h, idx) => {
      if (h) raw[h] = cols[idx] ?? "";
    });
    transactions.push({
      bookingDate: date,
      amount,
      counterparty: partyCol >= 0 ? cols[partyCol] || null : null,
      purpose: purposeCol >= 0 ? cols[purposeCol] || null : null,
      raw,
    });
  }

  return { transactions, skipped };
}
