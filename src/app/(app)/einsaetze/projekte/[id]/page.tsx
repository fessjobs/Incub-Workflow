import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canInvoice, requireMoney } from "@/lib/einsatz/access";
import { standVon, zahlenFuer } from "@/lib/einsatz/service/projekte";
import { summeErgaenzungen } from "@/lib/einsatz/service/abrechnung";
import { dateOnlyKey, formatKeyDE } from "@/lib/einsatz/tz";
import { formatDateTime } from "@/lib/format";
import { AbrechnungBadge, StatusBadge } from "../../status-badge";
import { DeleteButton } from "../../delete-button";
import { deleteProjektAction } from "../../actions";
import { EinsatzAufnehmen, EinsatzHerausloesen, ProjektAbrechnung, ProjektName } from "../projekt-formulare";
import { freieEinsaetze } from "../page";

export const metadata: Metadata = { title: "Projekt" };
export const dynamic = "force-dynamic";

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default async function ProjektDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMoney();
  const { id } = await params;
  const p = await db.project.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      customer: { select: { name: true } },
      assignments: {
        orderBy: [{ datumVon: "asc" }],
        include: {
          customer: { select: { name: true } },
          ergaenzungen: { select: { art: true, betrag: true } },
          shifts: { select: { assignments: { select: { status: true, timeEntries: { where: { aktuell: true }, select: { review: true, stundenGesamt: true } } } } } },
        },
      },
    },
  });
  if (!p) notFound();
  const darfRechnung = canInvoice(user);
  const zahlen = zahlenFuer(p.assignments);
  const stand = standVon(p, p.assignments);
  const kandidaten = darfRechnung && !p.rechnungsnummer ? await freieEinsaetze(user.organizationId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            <Link href="/einsaetze/projekte" className="hover:underline">
              Projekte
            </Link>
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {p.name}
            <AbrechnungBadge stand={stand} />
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            {p.customer?.name ?? "mehrere Kunden"} · {zahlen.einsaetze} Einsatz/Einsätze · {zahlen.stunden.toFixed(2).replace(".", ",")} h freigegeben
            {zahlen.ergaenzungen !== 0 ? ` · Ergänzungen ${euro(zahlen.ergaenzungen)}` : ""}
          </p>
          {darfRechnung ? (
            <p className="mt-1">
              <ProjektName projektId={p.id} name={p.name} />
            </p>
          ) : null}
        </div>
      </div>

      <ProjektAbrechnung
        projektId={p.id}
        stand={stand}
        angaben={{ angebotsnummer: p.angebotsnummer ?? "", konditionen: p.konditionen ?? "", abrechnungHinweis: p.abrechnungHinweis ?? "" }}
        angabenMeta={{ von: p.angabenVon, am: p.angabenAm ? formatDateTime(p.angabenAm) : null }}
        rechnung={{ nummer: p.rechnungsnummer, von: p.rechnungVon, am: p.rechnungAm ? formatDateTime(p.rechnungAm) : null }}
        zahlen={zahlen}
        darfRechnung={darfRechnung}
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3 dark:border-navy-800">
          <p className="text-sm font-medium">Einsätze in diesem Projekt</p>
          {darfRechnung && !p.rechnungsnummer ? <EinsatzAufnehmen projektId={p.id} kandidaten={kandidaten} /> : null}
        </div>
        {p.assignments.length === 0 ? (
          <p className="p-6 text-sm text-navy-400" data-testid="projekt-leer">Noch keine Einsätze im Projekt.</p>
        ) : (
          <ul className="divide-y divide-navy-100 dark:divide-navy-800">
            {p.assignments.map((a) => {
              const stunden =
                Math.round(
                  a.shifts
                    .flatMap((s) => s.assignments.filter((sa) => sa.status !== "STORNIERT").flatMap((sa) => sa.timeEntries))
                    .filter((t) => t.review === "FREIGEGEBEN")
                    .reduce((n, t) => n + Number(t.stundenGesamt), 0) * 100
                ) / 100;
              return (
                <li key={a.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.6fr_1fr_auto] md:items-center" data-testid={`projekt-einsatz-${a.einsatznummer}`}>
                  <div>
                    <p>
                      <Link href={`/einsaetze/${a.id}`} className="font-medium hover:underline">
                        {a.einsatznummer} · {a.projekt}
                      </Link>
                      <span className="ml-2">
                        <AbrechnungBadge stand={a.abrechnung} />
                      </span>
                    </p>
                    <p className="text-xs text-navy-400">
                      {a.customer.name} · {a.einsatzort} · {formatKeyDE(dateOnlyKey(a.datumVon))} · <StatusBadge status={a.status} />
                    </p>
                  </div>
                  <p className="text-xs text-navy-500">
                    <strong className="tabular-nums">{stunden.toFixed(2).replace(".", ",")} h</strong> freigegeben
                    {summeErgaenzungen(a.ergaenzungen) !== 0 ? ` · Ergänzungen ${euro(summeErgaenzungen(a.ergaenzungen))}` : ""}
                  </p>
                  <div className="md:justify-self-end">
                    {darfRechnung && !p.rechnungsnummer ? <EinsatzHerausloesen assignmentId={a.id} einsatznummer={a.einsatznummer} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {darfRechnung ? (
        <div className="card p-5">
          <p className="eyebrow">Projekt auflösen</p>
          <p className="mt-1 text-sm text-navy-400">
            Entfernt nur die Mappe. Die Einsätze bleiben bestehen und werden danach wieder einzeln abgerechnet.
          </p>
          <div className="mt-3">
            <DeleteButton
              testId="projekt-loeschen"
              label="Projekt auflösen"
              frage={`Projekt „${p.name}“ auflösen?`}
              mitgeht={[
                `${p.assignments.length} Einsatz/Einsätze stehen danach wieder für sich`,
                "Angebotsnummer, Konditionen und Beschreibung des Projekts",
                "die Einsätze selbst bleiben unverändert erhalten",
              ]}
              bestaetigungWort={null}
              gesperrtGrund={p.rechnungsnummer ? "Rechnung eingetragen – erst den Vermerk entfernen" : null}
              onDelete={deleteProjektAction.bind(null, p.id)}
              weiterNach="/einsaetze/projekte"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
