import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireDispo } from "@/lib/einsatz/access";
import { baseUrlFromRequest } from "@/lib/einsatz/mail";
import { istMonat, monatsAuswahl } from "@/lib/einsatz/monatszettel";
import { ladeStapel } from "@/lib/einsatz/service/monatszettel";
import { nowBerlinKey } from "@/lib/einsatz/tz";
import { MonatszettelPanel } from "./panel";

export const metadata: Metadata = { title: "Monatszettel" };
export const dynamic = "force-dynamic";

type SP = { kunde?: string; monat?: string };

// Monatszettel: Stunden für Personen, die laufend für einen Kunden arbeiten (ohne Einsatz je Auftrag)
export default async function MonatszettelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireDispo();
  const sp = await searchParams;
  const monate = monatsAuswahl(nowBerlinKey());
  const monat = sp.monat && istMonat(sp.monat) ? sp.monat : monate[1].wert;
  const [kunden, mitarbeiter] = await Promise.all([
    db.customer.findMany({ where: { organizationId: user.organizationId, aktiv: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { organizationId: user.organizationId, status: "AKTIV" }, orderBy: [{ nachname: "asc" }, { vorname: "asc" }], select: { id: true, vorname: true, nachname: true, personalnummer: true } }),
  ]);
  const kundeId = kunden.find((k) => k.id === sp.kunde)?.id ?? "";
  const stapel = kundeId ? await ladeStapel(user.organizationId, kundeId, monat) : { batch: null, zettel: [] };
  const basis = await baseUrlFromRequest();

  return (
    <MonatszettelPanel
      kunden={kunden}
      mitarbeiter={mitarbeiter}
      monate={monate}
      kundeId={kundeId}
      monat={monat}
      stapel={JSON.parse(JSON.stringify(stapel))}
      basis={basis ?? ""}
      heute={nowBerlinKey()}
    />
  );
}
