import type { Metadata } from "next";
import { requireDispo } from "@/lib/einsatz/access";
import { isParserAvailable } from "@/lib/einsatz/parser";
import { ImportPanel } from "../../import-panel";
import { mitarbeiterSchrittAction } from "../../import-actions";

export const metadata: Metadata = { title: "Personal importieren" };
export const dynamic = "force-dynamic";

export default async function PersonalImportPage() {
  await requireDispo();
  return (
    <ImportPanel
      titel="Mitarbeiter importieren"
      hinweis="Excel-, CSV- oder PDF-Liste hochladen. Vorhandene Personen werden an der Personalnummer erkannt, sonst am Namen, und nicht doppelt angelegt."
      beispielSpalten={["Personalnummer", "Vorname", "Nachname", "E-Mail", "Mobil", "Geburtsdatum", "Zulagen", "Status"]}
      action={mitarbeiterSchrittAction}
      zurueckHref="/einsaetze/personal"
      pdfMoeglich={isParserAvailable()}
    />
  );
}
