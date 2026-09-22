// Einlesen von Stammdaten-Dateien: CSV (Komma, Semikolon, Tab) und Excel
// (.xlsx über exceljs). Trennzeichen, Zeichensatz und Spalten werden erkannt,
// damit die Dispo einfach die Liste hochladen kann, die sie ohnehin hat.
import ExcelJS from "exceljs";
import { decodeSample } from "@/lib/export/zvoove";

export type Tabelle = { kopf: string[]; zeilen: string[][]; quelle: "csv" | "xlsx" | "pdf" };

const DELIMITERS = [";", ",", "\t", "|"] as const;

// CSV-Zeile mit Anführungszeichen korrekt zerlegen
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function isPdf(bytes: Buffer, filename: string): boolean {
  if (filename.toLowerCase().endsWith(".pdf")) return true;
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export function detectDelimiter(headerLine: string): string {
  let best = ";";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = splitCsvLine(headerLine, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsv(bytes: Buffer): Tabelle {
  const { text } = decodeSample(bytes);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("Die Datei ist leer.");
  const delimiter = detectDelimiter(lines[0]);
  const kopf = splitCsvLine(lines[0], delimiter);
  const zeilen = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l, delimiter);
    while (cells.length < kopf.length) cells.push("");
    return cells;
  });
  return { kopf, zeilen, quelle: "csv" };
}

export async function parseXlsx(bytes: Buffer): Promise<Tabelle> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Die Datei enthält keine Tabelle.");
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const cells: string[] = [];
    // eachCell überspringt leere Zellen, deshalb über den Index gehen
    for (let i = 1; i <= ws.columnCount; i++) {
      const v = row.getCell(i).value;
      cells.push(zelleAlsText(v));
    }
    rows.push(cells);
  });
  const nichtLeer = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nichtLeer.length === 0) throw new Error("Die Tabelle ist leer.");
  return { kopf: nichtLeer[0].map((c) => c.trim()), zeilen: nichtLeer.slice(1), quelle: "xlsx" };
}

function zelleAlsText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String((v as { result?: unknown }).result ?? "");
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

export async function parseTabelle(bytes: Buffer, filename: string): Promise<Tabelle> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(bytes);
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) return parseCsv(bytes);
  // PDF liest das Modell aus (eigenes Modul, damit die Anthropic-Abhängigkeit
  // nicht an CSV und Excel klebt)
  if (isPdf(bytes, filename)) {
    const { parsePdfTabelle } = await import("./pdf-tabelle");
    return parsePdfTabelle(bytes, filename);
  }
  // Unbekannte Endung: an der Signatur entscheiden (xlsx ist ein ZIP)
  if (bytes.subarray(0, 2).toString() === "PK") return parseXlsx(bytes);
  return parseCsv(bytes);
}

// ─── Spaltenerkennung ───────────────────────────────────────────────────────

export type FeldDefinition<F extends string> = { feld: F; muster: RegExp; pflicht?: boolean };

export function normalisiereKopf(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Ordnet Spaltenüberschriften den Feldern zu: Index je Feld, -1 = nicht gefunden
export function erkenneSpalten<F extends string>(kopf: string[], defs: Array<FeldDefinition<F>>): Record<F, number> {
  const zuordnung = {} as Record<F, number>;
  const vergeben = new Set<number>();
  for (const def of defs) {
    const idx = kopf.findIndex((h, i) => !vergeben.has(i) && def.muster.test(normalisiereKopf(h)));
    zuordnung[def.feld] = idx;
    if (idx >= 0) vergeben.add(idx);
  }
  return zuordnung;
}

export function zelle(zeile: string[], index: number): string {
  if (index < 0 || index >= zeile.length) return "";
  return (zeile[index] ?? "").trim();
}
