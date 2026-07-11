// PDF-Kontoauszug per Claude auslesen (Fallback zu CSV). Best effort.
import Anthropic from "@anthropic-ai/sdk";
import type { ParsedTransaction } from "./csv";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export async function extractStatementPdf(bytes: Buffer): Promise<{ transactions: ParsedTransaction[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { transactions: [], error: "PDF-Auszüge brauchen einen ANTHROPIC_API_KEY. Alternativ CSV verwenden." };
  }
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
            },
            {
              type: "text",
              text: `Extrahiere alle Kontobewegungen aus diesem Kontoauszug. Antworte NUR mit einem JSON-Array (kein Text drumherum):
[{"date":"yyyy-mm-dd","amount":Zahl,"counterparty":"Name oder null","purpose":"Verwendungszweck oder null"}]
Regeln: Ausgaben negativ, Eingänge positiv. Beträge mit Punkt als Dezimaltrenner. Nur echte Buchungszeilen, keine Salden/Summen.`,
            },
          ],
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { transactions: [], error: "Leere Antwort" };
    const start = textBlock.text.indexOf("[");
    const end = textBlock.text.lastIndexOf("]");
    if (start < 0 || end < 0) return { transactions: [], error: "Keine Buchungen erkannt" };
    const arr = JSON.parse(textBlock.text.slice(start, end + 1)) as Array<{
      date: string;
      amount: number;
      counterparty: string | null;
      purpose: string | null;
    }>;
    const transactions: ParsedTransaction[] = arr
      .map((t) => ({
        bookingDate: new Date(t.date),
        amount: Number(t.amount),
        counterparty: t.counterparty ?? null,
        purpose: t.purpose ?? null,
        raw: {} as Record<string, string>,
      }))
      .filter((t) => !Number.isNaN(t.bookingDate.getTime()) && !Number.isNaN(t.amount));
    return { transactions };
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `API ${err.status}` : "Fehler beim Auslesen";
    return { transactions: [], error: msg };
  }
}
