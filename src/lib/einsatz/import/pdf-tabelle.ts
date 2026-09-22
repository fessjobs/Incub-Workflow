// Stammdaten aus einem PDF lesen: Personallisten kommen oft als PDF aus der
// Lohnbuchhaltung oder als eingescannte Liste. Das Modell liest die Tabelle
// heraus, das Ergebnis ist dieselbe `Tabelle` wie bei CSV und Excel – damit
// bleiben Spaltenerkennung, Vorschau und Import unverändert.
//
// Ohne ANTHROPIC_API_KEY geht das nicht: ein PDF ist kein Text, den man
// zeilenweise lesen könnte. Das sagt die Fehlermeldung auch so.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z4 from "zod/v4";
import { PARSER_MODEL } from "../parser";
import type { Tabelle } from "./parse-table";

// Bewusst dieselbe Modell-Einstellung wie der Einsatz-Parser
// (ANTHROPIC_PARSER_MODEL), damit es nur eine Stellschraube gibt.
export { PARSER_MODEL };

const TabelleSchema = z4.object({
  kopf: z4.array(z4.string()),
  zeilen: z4.array(z4.array(z4.string())),
});

const SYSTEM_PROMPT = `Du liest eine Personal- oder Kundenliste aus einem PDF einer Personaldienstleistung aus und gibst sie als Tabelle zurück.
Regeln:
- Gib ausschließlich das JSON nach Schema zurück, keine Erklärung.
- "kopf" ist die Spaltenüberschrift-Zeile. Steht im PDF keine Überschrift, benenne die Spalten selbst nach ihrem Inhalt (z. B. "Personalnummer", "Vorname", "Nachname", "E-Mail", "Mobil", "Geburtsdatum", "Status", "Firmenname", "Straße", "PLZ", "Ort", "Ansprechpartner").
- "zeilen" enthält je Person bzw. je Kunde eine Zeile mit genau so vielen Feldern wie "kopf".
- Übernimm die Werte exakt so, wie sie im PDF stehen: Schreibweise, Umlaute, führende Nullen in Personalnummern, Datumsformat. Nichts umrechnen, nichts ergänzen, nichts korrigieren.
- Fehlt ein Wert, gib einen leeren String zurück – niemals "-", "k.A." oder erfundene Angaben.
- Steht ein Name in einer Zelle ("Mustermann, Max"), lass ihn so stehen und mach daraus keine zwei Spalten, wenn das PDF nur eine hat.
- Überschriften, Seitenzahlen, Fußzeilen, Zwischensummen und Wiederholungen der Kopfzeile auf Folgeseiten gehören nicht in "zeilen".
- Erstreckt sich die Tabelle über mehrere Seiten, hänge die Zeilen aneinander.
- Findest du keine Tabelle mit Personen oder Kunden, gib leere Listen zurück.`;

export async function parsePdfTabelle(bytes: Buffer, filename: string): Promise<Tabelle> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Für PDF-Listen wird die Claude API benötigt (ANTHROPIC_API_KEY ist nicht gesetzt). Als Excel oder CSV geht es ohne.");
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: PARSER_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
            { type: "text", text: `Lies die Liste aus „${filename}“ als Tabelle aus.` },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(TabelleSchema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new Error(`PDF konnte nicht gelesen werden (API ${err.status}): ${String(err.message).slice(0, 160)}`);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") throw new Error("Das Modell hat die Auswertung dieses PDFs abgelehnt.");
  if (!response.parsed_output) throw new Error("Die Antwort des Modells war nicht als Tabelle lesbar.");

  const kopf = response.parsed_output.kopf.map((k) => k.trim());
  if (kopf.length === 0) throw new Error("In diesem PDF wurde keine Tabelle mit Personen oder Kunden gefunden.");

  // Auf die Kopfbreite bringen – kürzere Zeilen auffüllen, längere kappen,
  // damit die Spaltenzuordnung stimmt.
  const zeilen = response.parsed_output.zeilen
    .map((z) => {
      const felder = z.slice(0, kopf.length).map((f) => (f ?? "").trim());
      while (felder.length < kopf.length) felder.push("");
      return felder;
    })
    .filter((z) => z.some((f) => f !== ""));

  if (zeilen.length === 0) throw new Error("In diesem PDF wurde keine Zeile mit Personen oder Kunden gefunden.");
  return { kopf, zeilen, quelle: "pdf" };
}
