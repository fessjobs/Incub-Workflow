import { promises as fs } from "fs";
import path from "path";
import { monthFolder, slugForFile } from "@/lib/format";

// Verlässliche Ablage ist die DB (receipt_files). Zusätzlich spiegeln wir die
// Dateien best-effort in die Ordnerstruktur nach Spec Abschnitt 7 – nützlich im
// lokalen Docker-Betrieb (dann im Finder sichtbar). Auf Hostern mit flüchtigem
// Dateisystem (Railway) schlägt das ggf. fehl; das ist unkritisch.

export function buildPaths(params: {
  companyFolder: string;
  date: Date;
  receiptNumber: string;
  vendor: string;
  gross: number;
  originalExt: string;
}) {
  const year = String(params.date.getFullYear());
  const month = monthFolder(params.date);
  const vendorSlug = slugForFile(params.vendor);
  const amount = params.gross.toFixed(2).replace(".", ",");
  const base = `${params.companyFolder}/${year}/${month}`;
  return {
    pdfPath: `${base}/${params.receiptNumber}_${vendorSlug}_${amount}.pdf`,
    originalPath: `${base}/originale/${params.receiptNumber}_original.${params.originalExt}`,
  };
}

async function writeSafe(root: string, relPath: string, bytes: Buffer) {
  const abs = path.join(root, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
}

export async function mirrorToDisk(
  files: Array<{ relPath: string; bytes: Buffer }>
): Promise<void> {
  const root = process.env.STORAGE_PATH;
  if (!root) return;
  try {
    for (const f of files) {
      await writeSafe(root, f.relPath, f.bytes);
    }
  } catch (err) {
    // Nicht kritisch – DB bleibt die Quelle
    console.warn("Datei-Spiegelung ins Dateisystem übersprungen:", (err as Error).message);
  }
}

export function extForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
