// Auswahl der Bereiche für die Sicherung (rein, ohne Datenbank – auch für die Oberfläche).
import { z } from "zod";

export const BEREICHE = [
  { id: "konkretisierung", gruppe: "alt", label: "Konkretisierungen (AÜG)", text: "PDFs aus dem Einsatzmodul, nach Einsatzdatum" },
  { id: "stundennachweis", gruppe: "alt", label: "Stundennachweise / Stundenzettel", text: "PDFs mit Unterschriften, nach Einsatzdatum" },
  { id: "export", gruppe: "alt", label: "Exporte (zvoove, Excel)", text: "im System abgelegte Exportdateien des Monats" },
  { id: "auslagen", gruppe: "alt", label: "Auslagen", text: "privat verauslagte Belege (Erstattung), PDF mit Beiblatt" },
  { id: "firmenbelege", gruppe: "alt", label: "Firmenbelege", text: "Zahlung über Firma oder Firmenkarte, PDF mit Beiblatt" },
  { id: "privatbelege", gruppe: "alt", label: "Private Belege", text: "als privat markierte Belege" },
  { id: "personalstamm", gruppe: "alt", label: "Personalstamm (Stand heute)", text: "Nummer, Name, E-Mail, Handy, Status – ohne Geburtsdatum" },
  { id: "neu-belege", gruppe: "neu", label: "Belege aus dem neuen System", text: "Fotos und PDFs der Beleg-Links des Monats" },
  { id: "neu-stunden", gruppe: "neu", label: "Stundenzeilen aus dem neuen System", text: "Tabelle (CSV) mit den Zeilen des Monats" },
  { id: "neu-gesamt", gruppe: "neu", label: "Gesamtstand des neuen Systems", text: "alle Personen, Aufträge, Bewerbungen, Einstellungen (JSON, enthält Personen- und Vertragsdaten)" },
] as const;

export type BereichId = (typeof BEREICHE)[number]["id"];
const IDS = BEREICHE.map((b) => b.id) as [BereichId, ...BereichId[]];

export const sicherungsAnfrage = z.object({
  monat: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  bereiche: z.array(z.enum(IDS)).min(1).max(IDS.length),
  // Original-Fotos der Belege zusätzlich zu den fertigen PDFs
  originale: z.boolean().default(false),
});
export type SicherungsAnfrage = z.infer<typeof sicherungsAnfrage>;

