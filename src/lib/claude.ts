// Beleg-Extraktion per Claude (Spec Abschnitt 5.2).
// Bild/PDF rein → strukturierte Felder raus. Läuft nur, wenn ANTHROPIC_API_KEY
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

export type ExtractionResult = ExtractedReceipt & { error: string | null };

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

function buildPrompt(categories: string[], today: string) {
  return `Du liest deutsche Kassenbons, Rechnungen und Quittungen aus. Extrahiere die Belegdaten.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt dieser Form (kein Markdown, kein Text davor oder danach):
{
  "receiptDate": "yyyy-mm-dd oder null",
  "vendor": "Aussteller/Händler oder null",
  "grossAmount": Zahl oder null,
  "netAmount": Zahl oder null,
  "vatLines": [{"rate": Zahl, "net": Zahl, "vat": Zahl}],
  "paymentMethod": "BAR" | "PRIVATE_KARTE" | "FIRMENKARTE" | "UNBEKANNT",
  "categorySuggestion": "eine Kategorie aus der Liste oder null",
  "purposeSuggestion": "kurzer geschäftlicher Zweck oder null"
}

Regeln:
- Beträge als Zahlen mit Punkt als Dezimaltrenner (12.90), keine Währungssymbole, keine Tausenderpunkte.
- Bei gemischten USt-Sätzen: je Satz eine Zeile in vatLines (Satz in Prozent, Netto, USt). Bei nur einem Satz trotzdem eine Zeile.
- receiptDate: das Beleg-/Rechnungsdatum. Heutiges Datum zur Orientierung: ${today}.
- paymentMethod nur setzen, wenn klar erkennbar (bar/Karte); Privat- vs. Firmenkarte ist meist nicht erkennbar → UNBEKANNT.
- categorySuggestion möglichst aus dieser Liste: ${categories.join(", ")}.
- purposeSuggestion: knapper, prüfungstauglicher Zweck (z. B. "Bahnfahrt Dienstreise", "Arbeitsmaterial Büro").
- Nicht erkennbare Werte: null (vatLines dann leere Liste).`;
}

// JSON auch dann finden, wenn das Modell doch Text drumherum schreibt
function parseLenient(text: string): Partial<ExtractedReceipt> | null {
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return typeof v === "object" && v !== null ? (v as Partial<ExtractedReceipt>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

export async function extractReceipt(
  bytes: Buffer,
  mimeType: string,
  categories: string[]
): Promise<ExtractionResult> {
  if (!isExtractionAvailable()) {
    return { ...EMPTY_EXTRACTION, error: "ANTHROPIC_API_KEY nicht gesetzt" };
  }
  if (!VISION_TYPES.has(mimeType) && mimeType !== PDF_TYPE) {
    return { ...EMPTY_EXTRACTION, error: `Dateityp ${mimeType} nicht lesbar` };
  }

  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);

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
      messages: [
        {
          role: "user",
          content: [mediaBlock, { type: "text", text: buildPrompt(categories, today) }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ...EMPTY_EXTRACTION, error: "Modell hat die Anfrage abgelehnt" };
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ...EMPTY_EXTRACTION, error: "Leere Antwort vom Modell" };
    }
    const parsed = parseLenient(textBlock.text);
    if (!parsed) {
      console.error("Extraktion: Antwort nicht als JSON lesbar:", textBlock.text.slice(0, 300));
      return { ...EMPTY_EXTRACTION, error: "Antwort nicht als JSON lesbar" };
    }
    return {
      ...EMPTY_EXTRACTION,
      ...parsed,
      grossAmount: typeof parsed.grossAmount === "number" ? parsed.grossAmount : null,
      netAmount: typeof parsed.netAmount === "number" ? parsed.netAmount : null,
      vatLines: Array.isArray(parsed.vatLines)
        ? parsed.vatLines.filter(
            (l) => l && typeof l.rate === "number" && typeof l.net === "number" && typeof l.vat === "number"
          )
        : [],
      error: null,
    };
  } catch (err) {
    // Fehler klar benennen, damit die UI ihn anzeigen kann (Status, Message)
    let message = "Unbekannter Fehler";
    if (err instanceof Anthropic.APIError) {
      message = `API ${err.status}: ${String(err.message).slice(0, 200)}`;
    } else if (err instanceof Error) {
      message = err.message.slice(0, 200);
    }
    console.error("Beleg-Extraktion fehlgeschlagen:", message);
    return { ...EMPTY_EXTRACTION, error: message };
  }
}
