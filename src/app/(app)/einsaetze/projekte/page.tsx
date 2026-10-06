import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { canInvoice, requireReviewer } from "@/lib/einsatz/access";
import { standVon, zahlenFuer } from "@/lib/einsatz/service/projekte";
import { AbrechnungBadge } from "../status-badge";
import { dateOnlyKey, formatKeyDE } from "@/lib/einsatz/tz";
import { NeuesProjekt, type FreierEinsatz } from "./projekt-formulare";

export const metadata: Metadata = { title: "Projekte" };
export const dynamic = "force-dynamic";

const MITGLIED = {
  abrechnung: true,
  ergaenzungen: { select: { art: true, betrag: true } },
  shifts: { select: { assignments: { select: { status: true, timeEntries: { where: { aktuell: true }, select: { review: true, stundenGesamt: true } } } } } },
} as const;

// Einsätze, die noch zu keinem Projekt gehören und noch nicht berechnet sind
export async function freieEinsaetze(organizationId: string): Promise<FreierEinsatz[]> {
  const rows = await db.assignment.findMany({
    where: { organizationId, projectId: null, abrechnung: { not: "BERECHNET" } },
    orderBy: [{ datumVon: "desc" }],
    take: 100,
    select: { id: true, einsatznummer: true, projekt: true, datumVon: true, customer: { select: { name: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    label: `${a.einsatznummer} · ${a.projekt} · ${formatKeyDE(dateOnlyKey(a.datumVon))}`,
    kunde: a.customer.name,
  }));
}

// Mehrere Einsätze, eine Rechnung: die Mappe hält Angebotsnummer, Konditionen
// und die Rechnungsnummer; die Stunden bleiben am einzelnen Einsatz.
export default async function ProjektePage() {
  const user = await requireReviewer();
  const [projekte, kandidaten] = await Promise.all([
    db.project.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { customer: { select: { name: true } }, assignments: { select: { id: true, einsatznummer: true, projekt: true, ...MITGLIED } } },
    }),
    canInvoice(user) ? freieEinsaetze(user.organizationId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Sammelrechnung</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Projekte</h1>
          <p className="mt-1 text-sm text-navy-400">
            Mehrere Einsätze zu einem Projekt zusammenfassen – Angebotsnummer, Konditionen und die Rechnung werden einmal für alle gepflegt.
          </p>
        </div>
        {canInvoice(user) ? <NeuesProjekt kandidaten={kandidaten} /> : null}
      </div>

      <div className="card overflow-hidden">
        {projekte.length === 0 ? (
          <p className="p-6 text-sm text-navy-400" data-testid="projekte-leer">
            Noch keine Projekte. Wer für mehrere Einsätze nur eine Rechnung schreiben will, fasst sie hier zusammen.
          </p>
        ) : (
          <ul className="divide-y divide-navy-100 dark:divide-navy-800">
            {projekte.map((p) => {
              const zahlen = zahlenFuer(p.assignments);
              const stand = standVon(p, p.assignments);
              return (
                <li key={p.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.6fr_1fr_auto] md:items-center" data-testid={`projekt-zeile-${p.id}`}>
                  <div>
                    <p>
                      <Link href={`/einsaetze/projekte/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <span className="ml-2">
                        <AbrechnungBadge stand={stand} />
                      </span>
                    </p>
                    <p className="text-xs text-navy-400">
                      {p.customer?.name ?? "mehrere Kunden"} · {zahlen.einsaetze} Einsatz/Einsätze
                      {p.assignments.length > 0 ? `: ${p.assignments.map((a) => a.einsatznummer).join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="text-xs text-navy-500">
                    <p>
                      <strong className="tabular-nums">{zahlen.stunden.toFixed(2).replace(".", ",")} h</strong> freigegeben
                      {zahlen.offeneEinsaetze > 0 ? <span className="ml-1 text-amber-600">· {zahlen.offeneEinsaetze} Einsatz/Einsätze offen</span> : null}
                    </p>
                    <p>
                      Angebot {p.angebotsnummer ?? "–"}
                      {p.rechnungsnummer ? ` · Rechnung ${p.rechnungsnummer}` : ""}
                    </p>
                  </div>
                  <Link href={`/einsaetze/projekte/${p.id}`} className="btn-secondary text-xs md:justify-self-end">
                    Öffnen
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
