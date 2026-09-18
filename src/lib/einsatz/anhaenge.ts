// Anhänge für die Einsatz-Auswertung: Screenshot aus der WhatsApp-Gruppe,
// abfotografierter Ablaufplan, PDF vom Kunden oder die Excel-Liste der Dispo.
//
// Bilder und PDFs gehen unverändert an die Claude API. Text-, CSV- und
// Excel-Dateien werden hier schon gelesen und als Text an den Rohtext
// gehängt: das ist billiger, deterministisch und funktioniert auch ohne
// API-Schlüssel über die Heuristik.
import { parseTabelle } from "./import/parse-table";
import { istBild, istDokument, type Anhang } from "./parser";
import { decodeSample } from "@/lib/export/zvoove";

export const MAX_ANHAENGE = 5;
// Grenze der Anthropic API für Bilder; PDFs dürfen größer sein, aber die
// Rohtext-Vorlagen der Dispo liegen weit darunter.
export const MAX_ANHANG_BYTES = 5 * 1024 * 1024;

export const ERLAUBTE_ENDUNGEN = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".txt", ".csv", ".tsv", ".md", ".eml", ".xlsx", ".xlsm"];

export type AnhangErgebnis = {
  anhaenge: Anhang[];
  // aus Text-/Tabellendateien gelesener Inhalt, wird an den Rohtext gehängt
  zusatzText: string;
  abgelehnt: Array<{ name: string; grund: string }>;
};

const TEXT_ENDUNGEN = [".txt", ".csv", ".tsv", ".md", ".eml"];
const TABELLEN_ENDUNGEN = [".xlsx", ".xlsm"];

function endung(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

// Browser und Messenger liefern den Typ nicht immer mit (z. B. bei Downloads
// aus WhatsApp Web), deshalb notfalls an der Endung entscheiden.
export function medientyp(name: string, gemeldet: string): string {
  const t = gemeldet.split(";")[0].trim().toLowerCase();
  if (istBild(t) || istDokument(t)) return t;
  switch (endung(name)) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return t;
  }
}

export async function leseAnhaenge(dateien: File[]): Promise<AnhangErgebnis> {
  const anhaenge: Anhang[] = [];
  const texte: string[] = [];
  const abgelehnt: Array<{ name: string; grund: string }> = [];

  for (const datei of dateien.slice(0, MAX_ANHAENGE)) {
    if (datei.size === 0) continue;
    if (datei.size > MAX_ANHANG_BYTES) {
      abgelehnt.push({ name: datei.name, grund: `größer als ${Math.round(MAX_ANHANG_BYTES / 1024 / 1024)} MB` });
      continue;
    }
    const bytes = Buffer.from(await datei.arrayBuffer());
    const typ = medientyp(datei.name, datei.type);
    const ext = endung(datei.name);

    if (istBild(typ) || istDokument(typ)) {
      anhaenge.push({ name: datei.name, mediaType: typ, dataBase64: bytes.toString("base64") });
      continue;
    }
    if (TABELLEN_ENDUNGEN.includes(ext)) {
      try {
        const tabelle = await parseTabelle(bytes, datei.name);
        const zeilen = [tabelle.kopf.join(" | "), ...tabelle.zeilen.map((z) => z.join(" | "))];
        texte.push(`--- ${datei.name} ---\n${zeilen.join("\n")}`);
      } catch (err) {
        abgelehnt.push({ name: datei.name, grund: err instanceof Error ? err.message : "nicht lesbar" });
      }
      continue;
    }
    if (TEXT_ENDUNGEN.includes(ext) || typ.startsWith("text/")) {
      texte.push(`--- ${datei.name} ---\n${decodeSample(bytes).text.trim()}`);
      continue;
    }
    abgelehnt.push({ name: datei.name, grund: "Dateityp wird nicht unterstützt (Bild, PDF, Text, CSV oder Excel)" });
  }

  if (dateien.length > MAX_ANHAENGE) {
    for (const datei of dateien.slice(MAX_ANHAENGE)) abgelehnt.push({ name: datei.name, grund: `höchstens ${MAX_ANHAENGE} Dateien auf einmal` });
  }

  return { anhaenge, zusatzText: texte.join("\n\n"), abgelehnt };
}
