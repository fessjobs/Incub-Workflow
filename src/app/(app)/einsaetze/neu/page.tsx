import type { Metadata } from "next";
import { db } from "@/lib/db";
import { canRate, requireDispo } from "@/lib/einsatz/access";
import { erfahrungFuer, erfahrungOder } from "@/lib/einsatz/service/personal";
import { erfahrungKurz } from "../rating-badges";
import { isParserAvailable, PARSER_MODEL } from "@/lib/einsatz/parser";
import { ParseWizard } from "./parse-wizard";

export const metadata: Metadata = { title: "Neuer Einsatz" };
export const dynamic = "force-dynamic";

export default async function NeuerEinsatzPage() {
  const user = await requireDispo();
  const [customers, employees] = await Promise.all([
    db.customer.findMany({ where: { organizationId: user.organizationId, aktiv: true }, orderBy: { name: "asc" }, select: { id: true, name: true, standardEinsatzort: true, aueVertragRef: true, bundesland: true } }),
    db.employee.findMany({ where: { organizationId: user.organizationId, status: "AKTIV" }, orderBy: [{ nachname: "asc" }, { vorname: "asc" }], select: { id: true, vorname: true, nachname: true, personalnummer: true } }),
  ]);
  // Erfahrung und Beurteilungsbilanz als Hinweis bei der Zuordnung – blockiert
  // nichts, macht aber sichtbar, wen man da gerade einteilt.
  const erfahrung = canRate(user) ? await erfahrungFuer(user.organizationId, employees.map((e) => e.id)) : new Map();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Neuer Einsatz</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Aus Rohtext oder Screenshot anlegen</h1>
        <p className="mt-1 text-sm text-navy-400">
          Text aus WhatsApp oder Mail einfügen und/oder Screenshot, Foto, PDF oder Tabelle anhängen.{" "}
          {isParserAvailable() ? `Die Auswertung läuft über die Claude API (${PARSER_MODEL}).` : "Ohne ANTHROPIC_API_KEY wird nur Text regelbasiert gelesen; Bilder und PDFs brauchen die API."}{" "}
          Danach prüfen, Personen zuordnen, speichern.
        </p>
      </div>
      <ParseWizard
        customers={customers}
        employees={employees.map((e) => ({
          id: e.id,
          name: `${e.vorname} ${e.nachname}`,
          personalnummer: e.personalnummer,
          erfahrung: erfahrungKurz(erfahrungOder(erfahrung, e.id)),
          auffaellig: erfahrungOder(erfahrung, e.id).bilanz.negativ > erfahrungOder(erfahrung, e.id).bilanz.positiv,
        }))}
      />
    </div>
  );
}
