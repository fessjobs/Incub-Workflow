import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canDispo, requireModuleUser } from "@/lib/einsatz/access";
import { dateOnlyKey, formatKeyDE, keyToDateOnly, isValidDateKey } from "@/lib/einsatz/tz";
import { StatusBadge, ASSIGNMENT_STATUS_LABELS, AbrechnungBadge } from "./status-badge";
import { JobsButton } from "./jobs-button";

export const metadata: Metadata = { title: "Einsätze" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function EinsaetzePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModuleUser();
  const sp = await searchParams;
  const dispo = canDispo(user);

  const where: Prisma.AssignmentWhereInput = { organizationId: user.organizationId };
  if (s(sp.status)) where.status = s(sp.status) as never;
  if (["OFFEN", "FREIGEGEBEN", "BERECHNET"].includes(s(sp.abrechnung))) where.abrechnung = s(sp.abrechnung) as never;
  if (s(sp.customer)) where.customerId = s(sp.customer);
  if (isValidDateKey(s(sp.from))) where.datumBis = { gte: keyToDateOnly(s(sp.from)) };
  if (isValidDateKey(s(sp.to))) where.datumVon = { ...(where.datumVon as object), lte: keyToDateOnly(s(sp.to)) };
  const q = s(sp.q).trim();
  if (q) {
    where.OR = [
      { projekt: { contains: q, mode: "insensitive" } },
      { artist: { contains: q, mode: "insensitive" } },
      { einsatzort: { contains: q, mode: "insensitive" } },
      { einsatznummer: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { shifts: { some: { assignments: { some: { employee: { OR: [{ vorname: { contains: q, mode: "insensitive" } }, { nachname: { contains: q, mode: "insensitive" } }] } } } } } },
    ];
  }

  const [assignments, customers, jobStats] = await Promise.all([
    db.assignment.findMany({
      where,
      orderBy: [{ datumVon: "desc" }, { einsatznummer: "desc" }],
      take: 200,
      include: {
        customer: { select: { name: true } },
        shifts: { select: { assignments: { select: { status: true, timeEntries: { where: { aktuell: true }, select: { unterschriftZeitpunkt: true } } } } } },
        documentLinks: { select: { document: { select: { category: true } } } },
      },
    }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.job.groupBy({ by: ["status"], where: { organizationId: user.organizationId }, _count: true }),
  ]);
  const offeneJobs = jobStats.find((j) => j.status === "OFFEN")?._count ?? 0;
  const fehlerJobs = jobStats.find((j) => j.status === "FEHLER")?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Arbeitnehmerüberlassung</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Einsätze &amp; Stundennachweise</h1>
          <p className="mt-1 text-sm text-navy-400">Rohtext einfügen → Konkretisierung → Links → Unterschriften → Stundennachweis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dispo ? <JobsButton offen={offeneJobs} fehler={fehlerJobs} /> : null}
          {dispo ? (
            <Link href="/einsaetze/neu" className="btn-accent">
              + Neu aus Rohtext
            </Link>
          ) : null}
        </div>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-6" method="get">
        <input name="q" defaultValue={q} placeholder="Suche: Projekt, Kunde, Ort, Person, Nr." className="input md:col-span-2" />
        <select name="status" defaultValue={s(sp.status)} className="input">
          <option value="">Alle Status</option>
          {Object.entries(ASSIGNMENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="abrechnung" defaultValue={s(sp.abrechnung)} className="input">
          <option value="">Abrechnung: alle</option>
          <option value="OFFEN">Abrechnung offen</option>
          <option value="FREIGEGEBEN">Zur Abrechnung freigegeben</option>
          <option value="BERECHNET">Rechnung geschrieben</option>
        </select>
        <select name="customer" defaultValue={s(sp.customer)} className="input">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" name="from" defaultValue={s(sp.from)} className="input" aria-label="Von" />
          <input type="date" name="to" defaultValue={s(sp.to)} className="input" aria-label="Bis" />
        </div>
        <div className="flex gap-2 md:col-span-6">
          <button type="submit" className="btn-secondary">
            Filtern
          </button>
          <Link href="/einsaetze" className="btn-secondary">
            Zurücksetzen
          </Link>
        </div>
      </form>

      <div className="card overflow-hidden">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-navy-400">Keine Einsätze gefunden.</p>
        ) : (
          <>
            {/* Mobil: Karten */}
            <ul className="divide-y divide-navy-100 md:hidden dark:divide-navy-800">
              {assignments.map((a) => {
                const p = progress(a);
                return (
                  <li key={a.id}>
                    <Link href={`/einsaetze/${a.id}`} className="block p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-navy-400">{a.einsatznummer}</span>
                        <span className="flex items-center gap-1">
                          <StatusBadge status={a.status} />
                          <AbrechnungBadge stand={a.abrechnung} />
                        </span>
                      </div>
                      <p className="mt-1 font-medium">{a.projekt}</p>
                      <p className="text-sm text-navy-400">
                        {a.customer.name} · {a.einsatzort}
                      </p>
                      <p className="mt-1 text-xs text-navy-400">
                        {formatKeyDE(dateOnlyKey(a.datumVon))} · {p.erfasst}/{p.gesamt} unterschrieben
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* Ab Tablet: Tabelle */}
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
                <tr>
                  <th className="px-4 py-2">Nr.</th>
                  <th className="px-4 py-2">Datum</th>
                  <th className="px-4 py-2">Projekt</th>
                  <th className="px-4 py-2">Kunde · Ort</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Erfasst</th>
                  <th className="px-4 py-2">Abrechnung</th>
                  <th className="px-4 py-2">Dokumente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
                {assignments.map((a) => {
                  const p = progress(a);
                  const docs = new Set(a.documentLinks.map((l) => l.document.category));
                  return (
                    <tr key={a.id} className="hover:bg-navy-50/60 dark:hover:bg-navy-800/40">
                      <td className="px-4 py-2 font-mono text-xs text-navy-500">
                        <Link href={`/einsaetze/${a.id}`}>{a.einsatznummer}</Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatKeyDE(dateOnlyKey(a.datumVon))}
                        {dateOnlyKey(a.datumVon) !== dateOnlyKey(a.datumBis) ? ` – ${formatKeyDE(dateOnlyKey(a.datumBis))}` : ""}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/einsaetze/${a.id}`} className="font-medium hover:underline">
                          {a.projekt}
                        </Link>
                        {a.artist && a.artist !== a.projekt ? <span className="text-navy-400"> · {a.artist}</span> : null}
                      </td>
                      <td className="px-4 py-2">
                        {a.customer.name}
                        <span className="block text-xs text-navy-400">{a.einsatzort}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        <span className={p.gesamt > 0 && p.erfasst === p.gesamt ? "text-emerald-600" : ""}>
                          {p.erfasst} / {p.gesamt}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <AbrechnungBadge stand={a.abrechnung} />
                        {a.rechnungsnummer ? <span className="ml-1 block text-xs text-navy-400">Nr. {a.rechnungsnummer}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-navy-400">
                        {docs.has("konkretisierung") ? "Konkretisierung " : ""}
                        {docs.has("stundennachweis") ? "Stundennachweis" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function progress(a: { shifts: Array<{ assignments: Array<{ status: string; timeEntries: Array<{ unterschriftZeitpunkt: Date | null }> }> }> }) {
  let gesamt = 0;
  let erfasst = 0;
  for (const s of a.shifts)
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      gesamt++;
      if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) erfasst++;
    }
  return { gesamt, erfasst };
}
