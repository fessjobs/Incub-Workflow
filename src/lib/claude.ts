// Beleg-Extraktion per Claude Vision (Spec Abschnitt 5.2).
// Bild rein → strukturierte Felder raus. Läuft nur, wenn ANTHROPIC_API_KEY
// gesetzt ist; sonst greift die manuelle Erfassung (graceful degradation).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export type VatLine = { rate: number; net: number; vat: number };

export type ExtractedReceipt = {
  receiptDate: string | null; // ISO yyyy-mm-dd
  vendor: string | null;
  grossAmount: number | null;
  netAmount: number | null;
  vatLines: VatLine[];
  paymentMethod: "BAR" | "PRIVATE_KARTE" | "FIRMENKARTE" | "UNBEKANNT";
  categorySuggestion: string | null;
  purposeSuggestion: string | null;
};

export const EMPTY_EXTRACTION: ExtractedReceipt = {
  receiptDate: null,
  vendor: null,
  grossAmount: null,
  netAmount: null,
  vatLines: [],
  paymentMethod: "UNBEKANNT",
  categorySuggestion: null,
  purposeSuggestion: null,
};

export function isExtractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Claude akzeptiert diese Bildtypen für Vision; PDFs gehen als Dokument-Block
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const PDF_TYPE = "application/pdf";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    receiptDate: { type: ["string", "null"], description: "Belegdatum als ISO yyyy-mm-dd, sonst null" },
    vendor: { type: ["string", "null"], description: "Aussteller/Händler" },
    grossAmount: { type: ["number", "null"], description: "Bruttobetrag gesamt" },
    netAmount: { type: ["number", "null"], description: "Nettobetrag gesamt, sonst null" },
    vatLines: {
      type: "array",
      description: "USt-Aufschlüsselung, eine Zeile je Satz (auch gemischt)",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rate: { type: "number", description: "USt-Satz in Prozent, z.B. 19 oder 7" },
          net: { type: "number", description: "Nettobetrag dieses Satzes" },
          vat: { type: "number", description: "USt-Betrag dieses Satzes" },
        },
        required: ["rate", "net", "vat"],
      },
    },
    paymentMethod: {
      type: "string",
      enum: ["BAR", "PRIVATE_KARTE", "FIRMENKARTE", "UNBEKANNT"],
    },
    categorySuggestion: { type: ["string", "null"], description: "Vorgeschlagene Kategorie aus der Liste" },
    purposeSuggestion: { type: ["string", "null"], description: "Kurzer geschäftlicher Anlass/Zweck-Vorschlag" },
  },
  required: [
    "receiptDate",
    "vendor",
    "grossAmount",
    "netAmount",
    "vatLines",
    "paymentMethod",
    "categorySuggestion",
    "purposeSuggestion",
  ],
} as const;

function buildPrompt(categories: string[], today: string) {
  return `Du liest deutsche Kassenbons, Rechnungen und Quittungen aus. Extrahiere die Belegdaten aus dem Bild.

Regeln:
- Beträge als Zahlen mit Punkt als Dezimaltrenner (12.90), keine Währungssymbole.
- Bei gemischten USt-Sätzen auf einem Bon: je Satz eine Zeile in vatLines (Satz, Netto, USt). Wenn nur ein Satz, trotzdem eine Zeile.
- receiptDate im Format yyyy-mm-dd. Heutiges Datum zur Orientierung: ${today}.
- paymentMethod nur setzen, wenn klar erkennbar (bar / Kartenzahlung). Privat- vs. Firmenkarte ist meist nicht erkennbar → dann UNBEKANNT.
- categorySuggestion möglichst aus dieser Liste wählen: ${categories.join(", ")}.
- purposeSuggestion: knapper, prüfungstauglicher Zweck (z.B. "Arbeitsmaterial Büro", "Tankfüllung Dienstfahrt").
- Wenn ein Wert nicht erkennbar ist: null (bzw. leere Liste bei vatLines).`;
}

export async function extractReceipt(
  bytes: Buffer,
  mimeType: string,
  categories: string[]
): Promise<ExtractedReceipt> {
  if (!isExtractionAvailable()) return { ...EMPTY_EXTRACTION };
  if (!VISION_TYPES.has(mimeType) && mimeType !== PDF_TYPE) {
    return { ...EMPTY_EXTRACTION };
  }

  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);

  // Bild als Vision-Block, PDF als Dokument-Block
  const mediaBlock =
    mimeType === PDF_TYPE
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: bytes.toString("base64"),
          },
        } as const);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [mediaBlock, { type: "text", text: buildPrompt(categories, today) }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { ...EMPTY_EXTRACTION };
    const parsed = JSON.parse(textBlock.text) as Partial<ExtractedReceipt>;
    return {
      ...EMPTY_EXTRACTION,
      ...parsed,
      vatLines: Array.isArray(parsed.vatLines) ? parsed.vatLines : [],
    };
  } catch (err) {
    console.error("Beleg-Extraktion fehlgeschlagen:", err);
    return { ...EMPTY_EXTRACTION };
  }
}
