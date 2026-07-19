// Sammel-PDF mit mehreren Belegen in Einzelbelege zerlegen.
// Die KI gruppiert die Seiten (mehrseitige Rechnungen bleiben zusammen);
// ohne API-Key gilt: eine Seite = ein Beleg.
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
export const MAX_SPLIT_PAGES = 40;

export async function pdfPageCount(bytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

// Seiten-Gruppen bestimmen: [[1],[2,3],[4]] – 1-basiert, jede Seite genau einmal
export async function detectReceiptGroups(bytes: Buffer, pageCount: number): Promise<number[][]> {
  const fallback = Array.from({ length: pageCount }, (_, i) => [i + 1]);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
            {
              type: "text",
              text: `Dieses PDF (${pageCount} Seiten) enthält mehrere eingescannte Belege/Rechnungen. Gruppiere die Seiten so, dass jede Gruppe genau EIN Beleg ist (mehrseitige Rechnungen gehören in eine Gruppe). Antworte NUR mit einem JSON-Array von Seitengruppen, 1-basiert, aufsteigend, jede Seite genau einmal, z. B.: [[1],[2,3],[4]]`,
            },
          ],
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallback;
    const start = textBlock.text.indexOf("[");
    const end = textBlock.text.lastIndexOf("]");
    if (start < 0 || end < 0) return fallback;
    const groups = JSON.parse(textBlock.text.slice(start, end + 1)) as number[][];

    // Validieren: jede Seite 1..N genau einmal
    const seen = new Set<number>();
    for (const g of groups) {
      if (!Array.isArray(g) || g.length === 0) return fallback;
      for (const p of g) {
        if (!Number.isInteger(p) || p < 1 || p > pageCount || seen.has(p)) return fallback;
        seen.add(p);
      }
    }
    if (seen.size !== pageCount) return fallback;
    return groups;
  } catch {
    return fallback;
  }
}

// Teil-PDF aus bestimmten Seiten bauen (1-basiert)
export async function buildSubPdf(bytes: Buffer, pages: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, pages.map((p) => p - 1));
  for (const p of copied) doc.addPage(p);
  return Buffer.from(await doc.save());
}
