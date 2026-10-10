// Datei → Rohzeilen (nur auf dem Server): .xlsx über exceljs, sonst Text/CSV.
import ExcelJS from "exceljs";
import { dekodiere, parseText } from "./tabelle";

export interface Blatt {
  name: string;
  zeilen: string[][];
  gesamt: number;
}

export const MAX_DATEI_BYTES = 8 * 1024 * 1024;
export const MAX_ZEILEN = 6000;
const MAX_SPALTEN = 80;
const MAX_ZELLE = 500;

const p2 = (n: number) => String(n).padStart(2, "0");

function wertAlsText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const nurZeit = v.getUTCFullYear() <= 1900;
    const hatZeit = v.getUTCHours() !== 0 || v.getUTCMinutes() !== 0;
    const tag = `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
    const zeit = `${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}`;
    return nurZeit ? zeit : hatZeit ? `${tag} ${zeit}` : tag;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return wertAlsText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    return "";
  }
  return String(v);
}

export async function leseXlsx(bytes: Uint8Array): Promise<Blatt[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const out: Blatt[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") continue;
    if (ws.rowCount > 60_000) throw new Error(`Blatt „${ws.name}“ hat zu viele Zeilen.`);
    const zeilen: string[][] = [];
    const breite = Math.min(ws.columnCount, MAX_SPALTEN);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const z: string[] = [];
      for (let i = 1; i <= breite; i++) z.push(wertAlsText(row.getCell(i).value).trim().slice(0, MAX_ZELLE));
      if (z.some((c) => c !== "")) zeilen.push(z);
    });
    if (zeilen.length > 0) out.push({ name: ws.name, zeilen: zeilen.slice(0, MAX_ZEILEN), gesamt: zeilen.length });
  }
  return out;
}

export async function leseDatei(bytes: Uint8Array, dateiname: string): Promise<Blatt[]> {
  const istZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (istZip || /\.(xlsx|xlsm)$/i.test(dateiname)) return leseXlsx(bytes);
  if (/\.xls$/i.test(dateiname)) throw new Error("Das alte Excel-Format (.xls) wird nicht gelesen. Bitte in Excel als .xlsx oder .csv speichern.");
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) throw new Error("PDF-Dateien lassen sich hier nicht importieren. Bitte die Tabelle als .xlsx oder .csv speichern.");
  const zeilen = parseText(dekodiere(bytes)).map((z) => z.slice(0, MAX_SPALTEN).map((c) => c.slice(0, MAX_ZELLE)));
  return zeilen.length > 0 ? [{ name: dateiname, zeilen: zeilen.slice(0, MAX_ZEILEN), gesamt: zeilen.length }] : [];
}
