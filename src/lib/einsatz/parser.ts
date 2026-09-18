// Konkretisierungs-Parser: Rohtext (WhatsApp/Mail) und/oder Anhänge
// (Screenshot, Foto, PDF) → strukturierter Einsatz.
// Primär über die Anthropic API mit striktem JSON-Schema (Structured Output).
// Ohne API-Schlüssel oder bei API-Fehlern greift ein deterministischer
// Heuristik-Parser, der das übliche Dispo-Format ("Bezeichnung | 08:00 Uhr |
// 2x Hands" + Namensliste) zuverlässig liest. Die Analyse (Dubletten,
// Spitznamen, Sollzahl) läuft in beiden Fällen identisch.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z4 from "zod/v4";
import { z } from "zod";
import { addDaysToKey, isValidDateKey, isValidTime } from "./tz";

export const PARSER_MODEL = process.env.ANTHROPIC_PARSER_MODEL ?? "claude-sonnet-4-6";

export const ParsedPersonSchema = z.object({
  name: z.string().trim().min(1),
  rolle: z.enum(["mitarbeiter", "ansprechpartner", "spare"]).default("mitarbeiter"),
});

export const ParsedShiftSchema = z.object({
  bezeichnung: z.string().trim().min(1),
  taetigkeit: z.string().trim().default(""),
  datum: z.string().nullable().default(null),
  start: z.string().nullable().default(null),
  ende: z.string().nullable().default(null),
  anzahlSoll: z.number().int().nullable().default(null),
  personen: z.array(ParsedPersonSchema).default([]),
});

export const ParsedAssignmentSchema = z.object({
  kunde: z.string().nullable().default(null),
  projekt: z.string().nullable().default(null),
  artist: z.string().nullable().default(null),
  einsatzort: z.string().nullable().default(null),
  datum: z.string().nullable().default(null),
  schichten: z.array(ParsedShiftSchema).default([]),
  hinweise: z.array(z.string()).default([]),
});

export type ParsedAssignment = z.infer<typeof ParsedAssignmentSchema>;
export type ParsedShift = z.infer<typeof ParsedShiftSchema>;
export type ParsedPerson = z.infer<typeof ParsedPersonSchema>;

// Schema für die API (zod/v4 wird vom SDK-Helfer verlangt)
const ApiOutputSchema = z4.object({
  kunde: z4.string().nullable(),
  projekt: z4.string().nullable(),
  artist: z4.string().nullable(),
  einsatzort: z4.string().nullable(),
  datum: z4.string().nullable(),
  schichten: z4.array(
    z4.object({
      bezeichnung: z4.string(),
      taetigkeit: z4.string(),
      datum: z4.string().nullable(),
      start: z4.string().nullable(),
      ende: z4.string().nullable(),
      anzahlSoll: z4.number().nullable(),
      personen: z4.array(
        z4.object({
          name: z4.string(),
          rolle: z4.enum(["mitarbeiter", "ansprechpartner", "spare"]),
        })
      ),
    })
  ),
  hinweise: z4.array(z4.string()),
});

export const DEFAULT_SHIFT_HOURS = 8;

const SYSTEM_PROMPT = `Du strukturierst Einsatz-Rohtexte einer Personaldienstleistung (Arbeitnehmerüberlassung, Veranstaltungstechnik/Logistik/Catering) für die Disposition.
Die Vorlage kommt als Text, als Screenshot/Foto oder als PDF. Liegen Bilder oder Dokumente bei, lies die Angaben daraus ab (auch aus Tabellen, Chatverläufen und handschriftlichen Notizen); ein zusätzlicher Rohtext ergänzt sie und hat bei Widersprüchen Vorrang.
Der Text stammt aus WhatsApp oder Mail und enthält typischerweise: Artist/Veranstaltung, Location/Einsatzort, Kunde, ein Datum ("Arbeitsbeginn 18.09.2026") und mehrere Schichten. Eine Schichtzeile sieht meist so aus: "Load-Out | 21:30 Uhr | 4x Hands" (Bezeichnung | Startzeit | Anzahl x Tätigkeit). Darunter stehen die Namen der eingeteilten Personen, eine je Zeile.
Regeln:
- Gib ausschließlich das JSON nach Schema zurück, kein Markdown, keine Erklärung.
- datum im Format YYYY-MM-DD, Uhrzeiten als HH:mm (24 h). Fehlt eine Endzeit, ende = null (NICHT raten).
- projekt = Veranstaltung/Artist/Projektname; wenn nur ein Artist genannt ist, projekt = Artist.
- Schichten ohne eigenes Datum erben das Einsatzdatum. Eine Schicht "Load-Out" nach 20 Uhr gehört zum selben Datum.
- anzahlSoll = Zahl vor dem "x" (z. B. "4x Hands" → 4, taetigkeit "Hands").
- Personen exakt so übernehmen, wie sie im Text stehen (keine Namen ergänzen oder korrigieren). rolle "ansprechpartner" nur bei ausdrücklicher Kennzeichnung (AP, Ansprechpartner, Vorarbeiter), "spare" bei Ersatz/Spare/Springer, sonst "mitarbeiter".
- hinweise: Auffälligkeiten im Text (unklare Zeiten, fehlende Angaben). Dubletten und Sollzahl-Abweichungen werden separat geprüft, nicht hier.`;

// Anhang für die KI-Auswertung: Screenshot aus WhatsApp, abfotografierter
// Ablaufplan oder ein PDF. Bilder und PDFs gehen als eigene Inhaltsblöcke an
// die API, Textdateien werden schon vorher in den Rohtext übernommen.
export type Anhang = { name: string; mediaType: string; dataBase64: string };

export const BILD_TYPEN = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const DOKUMENT_TYPEN = ["application/pdf"] as const;

export function istBild(mediaType: string): boolean {
  return (BILD_TYPEN as readonly string[]).includes(mediaType);
}
export function istDokument(mediaType: string): boolean {
  return (DOKUMENT_TYPEN as readonly string[]).includes(mediaType);
}

export type ParserClient = (rawText: string, anhaenge: Anhang[]) => Promise<ParsedAssignment>;

export function isParserAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Aufruf der Anthropic API mit striktem Ausgabeformat. Anhänge (Screenshots,
// Fotos, PDFs) stehen vor dem Text, damit das Modell sie als Hauptquelle liest.
export async function parseWithClaude(rawText: string, anhaenge: Anhang[] = []): Promise<ParsedAssignment> {
  const client = new Anthropic();
  const bloecke: Anthropic.ContentBlockParam[] = [];
  for (const a of anhaenge) {
    if (istBild(a.mediaType)) {
      bloecke.push({ type: "image", source: { type: "base64", media_type: a.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: a.dataBase64 } });
    } else if (istDokument(a.mediaType)) {
      bloecke.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.dataBase64 } });
    }
  }
  bloecke.push({
    type: "text",
    text: rawText ? `Rohtext:\n\n${rawText}` : "Kein Rohtext – nimm die Angaben aus den beigefügten Bildern bzw. Dokumenten.",
  });
  const response = await client.messages.parse({
    model: PARSER_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: bloecke }],
    output_config: { format: zodOutputFormat(ApiOutputSchema) },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Modell hat die Anfrage abgelehnt");
  }
  if (!response.parsed_output) {
    throw new Error("Antwort des Modells nicht als JSON lesbar");
  }
  return ParsedAssignmentSchema.parse(response.parsed_output);
}

// ─── Heuristik (Fallback + Referenz für Tests) ─────────────────────────────

const KEY_MAP: Array<[RegExp, keyof Pick<ParsedAssignment, "kunde" | "projekt" | "artist" | "einsatzort">]> = [
  [/^(kunde|auftraggeber|entleiher)\s*[:\-]\s*(.+)$/i, "kunde"],
  [/^(projekt|veranstaltung|event|show|tour)\s*[:\-]\s*(.+)$/i, "projekt"],
  [/^(artist|künstler|kuenstler|band|act)\s*[:\-]\s*(.+)$/i, "artist"],
  [/^(location|ort|einsatzort|venue|halle|adresse)\s*[:\-]\s*(.+)$/i, "einsatzort"],
];

const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/;
const TIME_RE = /(\d{1,2})[:.](\d{2})\s*(?:uhr|h)?/i;
const RANGE_RE = /(\d{1,2})[:.](\d{2})\s*(?:uhr|h)?\s*(?:-|–|bis)\s*(\d{1,2})[:.](\d{2})/i;
const COUNT_RE = /(\d+)\s*[x×]\s*([A-Za-zÄÖÜäöüß\-\/ ]+)/;
// Trennlinien und Dateiüberschriften ("--- ablaufplan.txt ---"), wie sie beim
// Zusammenführen mehrerer Vorlagen entstehen: keine Schicht, keine Person.
const SEPARATOR_RE = /^[-–—_=*]{2,}\s*(.*?)\s*[-–—_=*]{2,}$|^[-–—_=*]{3,}$/;

function toDateKey(m: RegExpMatchArray): string | null {
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const yRaw = m[3];
  const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  const key = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidDateKey(key) ? key : null;
}

function toTime(h: string, m: string): string | null {
  const t = `${h.padStart(2, "0")}:${m}`;
  return isValidTime(t) ? t : null;
}

function isShiftHeader(line: string): boolean {
  if (line.includes("|") && TIME_RE.test(line)) return true;
  return COUNT_RE.test(line) && TIME_RE.test(line);
}

function parseShiftHeader(line: string): Omit<ParsedShift, "personen" | "datum"> {
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  let bezeichnung = "";
  let start: string | null = null;
  let ende: string | null = null;
  let anzahlSoll: number | null = null;
  let taetigkeit = "";
  const rest: string[] = [];
  for (const part of parts.length > 1 ? parts : [line]) {
    const range = part.match(RANGE_RE);
    const count = part.match(COUNT_RE);
    let used = false;
    if (range) {
      start = toTime(range[1], range[2]);
      ende = toTime(range[3], range[4]);
      used = true;
    } else if (TIME_RE.test(part) && (!count || parts.length <= 1)) {
      const t = part.match(TIME_RE)!;
      start = toTime(t[1], t[2]);
      used = true;
    }
    if (count) {
      anzahlSoll = Number(count[1]);
      taetigkeit = count[2].trim();
      used = true;
    }
    if (!used) rest.push(part);
  }
  if (parts.length <= 1) {
    // Einzeilige Form ohne Pipes: Bezeichnung = Text vor der Uhrzeit
    const idx = line.search(TIME_RE);
    bezeichnung = idx > 0 ? line.slice(0, idx).replace(/[\-–:|]+\s*$/, "").trim() : rest[0] ?? "Schicht";
  } else {
    bezeichnung = rest[0] ?? "Schicht";
  }
  return { bezeichnung: bezeichnung || "Schicht", taetigkeit, start, ende, anzahlSoll };
}

function personFromLine(line: string): ParsedPerson {
  let rolle: ParsedPerson["rolle"] = "mitarbeiter";
  let name = line.replace(/^[\-•*\d.)\s]+/, "").trim();
  if (/\b(ap|ansprechpartner|vorarbeiter|crew\s*chief|chef)\b/i.test(name)) rolle = "ansprechpartner";
  if (/\b(spare|ersatz|springer|reserve)\b/i.test(name)) rolle = "spare";
  name = name
    .replace(/\((?:ap|ansprechpartner|vorarbeiter|spare|ersatz|springer|reserve|crew\s*chief)\)/gi, "")
    .replace(/\b(?:ap|ansprechpartner|vorarbeiter|spare|ersatz|springer|reserve)\b:?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\-–:,]+$/, "")
    .trim();
  return { name, rolle };
}

export function parseHeuristic(rawText: string): ParsedAssignment {
  const result: ParsedAssignment = {
    kunde: null,
    projekt: null,
    artist: null,
    einsatzort: null,
    datum: null,
    schichten: [],
    hinweise: [],
  };
  let currentDate: string | null = null;
  let current: ParsedShift | null = null;
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());

  for (const line of lines) {
    if (!line) continue;
    if (SEPARATOR_RE.test(line)) continue;

    let matchedKey = false;
    for (const [re, field] of KEY_MAP) {
      const m = line.match(re);
      if (m) {
        result[field] = m[2].trim();
        matchedKey = true;
        break;
      }
    }
    if (matchedKey) continue;

    if (isShiftHeader(line)) {
      const header = parseShiftHeader(line);
      const dm = line.match(DATE_RE);
      const datum = dm ? toDateKey(dm) : currentDate;
      current = { ...header, datum, personen: [] };
      result.schichten.push(current);
      continue;
    }

    const dm = line.match(DATE_RE);
    if (dm && (/(arbeitsbeginn|datum|termin|am|beginn|tag)/i.test(line) || line.replace(DATE_RE, "").replace(/[:\s]/g, "") === "")) {
      const key = toDateKey(dm);
      if (key) {
        currentDate = key;
        if (!result.datum) result.datum = key;
        current = null;
      }
      continue;
    }

    if (current) {
      const person = personFromLine(line);
      if (person.name) current.personen.push(person);
    } else if (!result.projekt && !result.artist && lines.filter(Boolean)[0] === line && line.length < 80) {
      // erste Zeile ohne Schlüssel = Projektname
      result.projekt = line;
    }
  }

  if (!result.projekt && result.artist) result.projekt = result.artist;
  if (!result.datum && result.schichten.length > 0) {
    result.datum = result.schichten.find((s) => s.datum)?.datum ?? null;
  }
  for (const s of result.schichten) if (!s.datum) s.datum = result.datum;
  return result;
}

// ─── Analyse (läuft nach Claude UND Heuristik) ──────────────────────────────

const NICKNAME_HINT = /["„“'‚‘]|\b(alias|aka|genannt)\b/i;

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function analyseParsed(parsed: ParsedAssignment): ParsedAssignment {
  const hinweise = [...parsed.hinweise];
  const schichten = parsed.schichten.map((s, i) => {
    const seen = new Map<string, number>();
    for (const p of s.personen) {
      const key = normalizeName(p.name);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        const original = s.personen.find((p) => normalizeName(p.name) === key)?.name ?? key;
        hinweise.push(`Schicht „${s.bezeichnung}“: „${original}“ ist ${count}× eingetragen.`);
      }
    }
    for (const p of s.personen) {
      const tokens = p.name.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) hinweise.push(`Schicht „${s.bezeichnung}“: „${p.name}“ hat keinen Nachnamen.`);
      else if (NICKNAME_HINT.test(p.name)) hinweise.push(`Schicht „${s.bezeichnung}“: „${p.name}“ sieht nach Spitzname aus.`);
    }
    const worker = s.personen.filter((p) => p.rolle !== "spare").length;
    if (s.anzahlSoll !== null && worker !== s.anzahlSoll) {
      hinweise.push(`Schicht „${s.bezeichnung}“: ${worker} Personen eingetragen, Soll ${s.anzahlSoll}.`);
    }
    if (!s.start) hinweise.push(`Schicht „${s.bezeichnung}“: Startzeit fehlt.`);
    if (!s.ende) hinweise.push(`Schicht „${s.bezeichnung}“: Endzeit fehlt – Vorschlag ${DEFAULT_SHIFT_HOURS} h ab Beginn, bitte prüfen.`);
    if (!s.datum) hinweise.push(`Schicht ${i + 1} „${s.bezeichnung}“: Datum fehlt.`);
    return s;
  });
  if (!parsed.kunde) hinweise.push("Kunde nicht erkannt – bitte auswählen.");
  if (!parsed.einsatzort) hinweise.push("Einsatzort nicht erkannt.");
  if (schichten.length === 0) hinweise.push("Keine Schicht erkannt.");
  return { ...parsed, schichten, hinweise: [...new Set(hinweise)] };
}

// Vorschlag für die Endzeit (Standard-Schichtlänge), über Mitternacht erlaubt
export function suggestEnd(datum: string, start: string): { datum: string; ende: string } {
  const [h, m] = start.split(":").map(Number);
  const total = h + DEFAULT_SHIFT_HOURS;
  const endeH = total % 24;
  const nextDay = total >= 24;
  return { datum: nextDay ? addDaysToKey(datum, 1) : datum, ende: `${String(endeH).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

export type ParseOutcome = { parsed: ParsedAssignment; quelle: "claude" | "heuristik"; fehler: string | null };

// Einstieg für die API-Route: Claude, sonst Heuristik; Client injizierbar (Tests)
export async function parseRawText(rawText: string, anhaenge: Anhang[] = [], client?: ParserClient): Promise<ParseOutcome> {
  const text = rawText.trim();
  if (!text && anhaenge.length === 0) throw new Error("Bitte Rohtext einfügen oder eine Datei anhängen.");
  const useClaude = client ?? (isParserAvailable() ? parseWithClaude : null);
  if (useClaude) {
    try {
      const parsed = await useClaude(text, anhaenge);
      return { parsed: analyseParsed(parsed), quelle: "claude", fehler: null };
    } catch (err) {
      let message = "Unbekannter Fehler";
      if (err instanceof Anthropic.APIError) message = `API ${err.status}: ${String(err.message).slice(0, 200)}`;
      else if (err instanceof Error) message = err.message.slice(0, 200);
      console.error("Konkretisierungs-Parser (Claude) fehlgeschlagen:", message);
      return heuristikErgebnis(text, anhaenge, `KI-Auswertung fehlgeschlagen (${message}) – Ergebnis stammt aus der Heuristik.`, message);
    }
  }
  return heuristikErgebnis(text, anhaenge, "ANTHROPIC_API_KEY nicht gesetzt – Ergebnis stammt aus der Heuristik.", null);
}

// Die Heuristik liest nur Text. Hängen Bilder oder PDFs an, muss das im
// Ergebnis stehen, sonst wirkt ein leerer Einsatz wie ein Lesefehler.
function heuristikErgebnis(text: string, anhaenge: Anhang[], hinweis: string, fehler: string | null): ParseOutcome {
  const parsed = analyseParsed(parseHeuristic(text));
  parsed.hinweise.unshift(hinweis);
  if (anhaenge.length > 0) {
    parsed.hinweise.unshift(`${anhaenge.length} Anhang/Anhänge (${anhaenge.map((a) => a.name).join(", ")}) wurden nicht ausgewertet – dafür wird die Claude API benötigt.`);
  }
  return { parsed, quelle: "heuristik", fehler };
}
