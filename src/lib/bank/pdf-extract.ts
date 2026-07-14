// PDF-Kontoauszug per Claude auslesen (Fallback zu CSV). Große Auszüge
// (z. B. 36-seitige Amex-Aktivitäten) werden seitenweise in Häppchen
// verarbeitet – eine einzige Antwort würde sonst abgeschnitten.
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import type { ParsedTransaction } from "./csv";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const PAGES_PER_CHUNK = 5;
const CONCURRENCY = 3;

type RawTxn = { date: string; amount: number; counterparty: string | null; purpose: string | null };

// Abgeschnittene Antworten reparieren: bis zum letzten vollständigen Objekt
// kürzen und die Liste schließen, statt alles zu verwerfen.
export function parseTxnJson(text: string): RawTxn[] {
  const start = text.indexOf("[");
  if (start < 0) return [];
  let slice = text.slice(start);
  const end = slice.lastIndexOf("]");
  if (end >= 0) slice = slice.slice(0, end + 1);
  try {
    return JSON.parse(slice) as RawTxn[];
  } catch {
    const lastComplete = slice.lastIndexOf("}");
    if (lastComplete < 0) return [];
    try {
      return JSON.parse(slice.slice(0, lastComplete + 1) + "]") as RawTxn[];
    } catch {
      return [];
    }
  }
}

function prompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Extrahiere alle Kontobewegungen aus diesem Kontoauszug-Ausschnitt. Antworte NUR mit einem JSON-Array (kein Text drumherum):
[{"date":"yyyy-mm-dd","amount":Zahl,"counterparty":"Name oder null","purpose":"Verwendungszweck oder null"}]
Regeln:
- Ausgaben negativ, Eingänge positiv. Beträge mit Punkt als Dezimaltrenner.
- WICHTIG bei Kreditkarten-Aktivitäten (z. B. American Express): Käufe/Belastungen sind AUSGABEN und müssen NEGATIV sein, auch wenn sie im Dokument positiv dargestellt sind. Zahlungen/Gutschriften ("Zahlung erhalten", "Gutschrift", "Erstattung") sind Eingänge und POSITIV.
- Fehlt bei einem Datum das Jahr (z. B. "13. Juli"): Nimm das Jahr so, dass das Datum nicht nach heute (${today}) liegt – sonst das Vorjahr.
- Auch "Ausstehend"/pending-Buchungen mitnehmen.
- Nur echte Buchungszeilen, keine Salden/Zwischensummen/Limits.
- Enthält der Ausschnitt keine Buchungen, antworte mit [].`;
}

async function extractChunk(client: Anthropic, pdfBase64: string): Promise<{ txns: RawTxn[]; error?: string }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt() },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { txns: [], error: "Leere Antwort" };
  const txns = parseTxnJson(textBlock.text);
  if (txns.length === 0 && !textBlock.text.includes("[]")) return { txns: [], error: "Keine Buchungen erkannt" };
  return { txns };
}

// PDF in Seiten-Häppchen zerlegen (als eigenständige PDFs)
async function splitPdf(bytes: Buffer): Promise<string[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = src.getPageCount();
  if (pageCount <= PAGES_PER_CHUNK) return [bytes.toString("base64")];

  const chunks: string[] = [];
  for (let from = 0; from < pageCount; from += PAGES_PER_CHUNK) {
    const doc = await PDFDocument.create();
    const indices = Array.from(
      { length: Math.min(PAGES_PER_CHUNK, pageCount - from) },
      (_, i) => from + i
    );
    const pages = await doc.copyPages(src, indices);
    for (const p of pages) doc.addPage(p);
    chunks.push(Buffer.from(await doc.save()).toString("base64"));
  }
  return chunks;
}

export async function extractStatementPdf(bytes: Buffer): Promise<{ transactions: ParsedTransaction[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { transactions: [], error: "PDF-Auszüge brauchen einen ANTHROPIC_API_KEY. Alternativ CSV verwenden." };
  }
  const client = new Anthropic();

  let chunks: string[];
  try {
    chunks = await splitPdf(bytes);
  } catch {
    return { transactions: [], error: "PDF konnte nicht gelesen werden." };
  }

  // Häppchen mit begrenzter Parallelität verarbeiten
  const results: Array<{ txns: RawTxn[]; error?: string }> = new Array(chunks.length);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      try {
        results[i] = await extractChunk(client, chunks[i]);
      } catch (err) {
        const msg = err instanceof Anthropic.APIError ? `API ${err.status}` : "Fehler beim Auslesen";
        results[i] = { txns: [], error: msg };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

  const all = results.flatMap((r) => r.txns);
  const errors = results.filter((r) => r.error).map((r) => r.error);

  const transactions: ParsedTransaction[] = all
    .map((t) => ({
      bookingDate: new Date(t.date),
      amount: Number(t.amount),
      counterparty: t.counterparty ?? null,
      purpose: t.purpose ?? null,
      raw: {} as Record<string, string>,
    }))
    .filter((t) => !Number.isNaN(t.bookingDate.getTime()) && !Number.isNaN(t.amount) && t.amount !== 0);

  if (transactions.length === 0) {
    return { transactions: [], error: errors[0] ?? "Keine Buchungen erkannt" };
  }
  // Teilfehler sind ok – was erkannt wurde, wird importiert
  return { transactions };
}
