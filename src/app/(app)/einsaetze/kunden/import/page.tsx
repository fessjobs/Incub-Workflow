import type { Metadata } from "next";
import { requireDispo } from "@/lib/einsatz/access";
import { ImportPanel } from "../../import-panel";
import { kundenSchrittAction } from "../../import-actions";

export const metadata: Metadata = { title: "Kunden importieren" };
export const dynamic = "force-dynamic";

export default async function KundenImportPage() {
  await requireDispo();
  return (
    <ImportPanel
      titel="Kunden importieren"
      hinweis="Excel- oder CSV-Liste hochladen. Vorhandene Kunden werden am Namen erkannt und ergänzt statt doppelt angelegt."
      beispielSpalten={["Name", "Adresse", "PLZ", "Ort", "USt-ID", "Ansprechpartner", "E-Mail", "Telefon", "Einsatzort", "Bundesland", "AÜ-Vertrag"]}
      action={kundenSchrittAction}
      zurueckHref="/einsaetze/kunden"
    />
  );
}
