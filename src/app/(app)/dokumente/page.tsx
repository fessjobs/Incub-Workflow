import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireModuleUser } from "@/lib/einsatz/access";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/einsatz/documents";
import { isValidDateKey, keyToDateOnly } from "@/lib/einsatz/tz";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dokumente" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Dokumentenspeicher des Einsatzmoduls: Konkretisierungen, Stundennachweise
// und Exporte – verknüpft mit Einsatz, Kunde, Datum und Mitarbeiter.
export default async function DokumentePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModuleUser();
  const sp = await searchParams;
  const where: Prisma.DocumentWhereInput = { organizationId: user.organizationId };
  if (s(sp.category)) where.category = s(sp.category);
  const linkFilter: Prisma.DocumentLinkWhereInput = {};
  if (s(sp.customerId)) linkFilter.customerId = s(sp.customerId);
  if (s(sp.employeeId)) linkFilter.employeeId = s(sp.employeeId);
  if (isValidDateKey(s(sp.from))) linkFilter.datum = { ...(linkFilter.datum as object), gte: keyToDateOnly(s(sp.from)) };
  if (isValidDateKey(s(sp.to))) linkFilter.datum = { ...(linkFilter.datum as object), lte: keyToDateOnly(s(sp.to)) };
  if (Object.keys(linkFilter).length > 0) where.links = { some: linkFilter };
  const q = s(sp.q).trim();
  if (q) where.filename = { contains: q, mode: "insensitive" };

  const [docs, customers, employees] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        category: true,
        filename: true,
        size: true,
        sha256: true,
        createdAt: true,
        mimeType: true,
        links: { select: { assignment: { select: { id: true, einsatznummer: true, projekt: true } }, customer: { select: { name: true } }, employee: { select: { vorname: true, nachname: true } } } },
      },
    }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { organizationId: user.organizationId }, orderBy: { nachname: "asc" }, select: { id: true, vorname: true, nachname: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Einsatzmodul</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dokumente</h1>
        <p className="mt-1 text-sm text-navy-400">Unveränderliche Ablage: Konkretisierungen, Stundennachweise, Exporte. Jede Datei mit SHA-256-Hash im Audit-Log.</p>
      </div>
      <form className="card grid gap-3 p-4 md:grid-cols-6" method="get">
        <select name="category" defaultValue={s(sp.category)} className="input">
          <option value="">Alle Kategorien</option>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="customerId" defaultValue={s(sp.customerId)} className="input">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="employeeId" defaultValue={s(sp.employeeId)} className="input">
          <option value="">Alle Mitarbeiter</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nachname}, {e.vorname}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={s(sp.from)} className="input" />
        <input type="date" name="to" defaultValue={s(sp.to)} className="input" />
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Dateiname" className="input" />
          <button type="submit" className="btn-secondary">
            Filtern
          </button>
        </div>
      </form>
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {docs.length === 0 ? <p className="p-5 text-sm text-navy-400">Keine Dokumente gefunden.</p> : null}
        {docs.map((d) => {
          const a = d.links.find((l) => l.assignment)?.assignment;
          const kunde = d.links.find((l) => l.customer)?.customer?.name;
          const personen = [...new Set(d.links.filter((l) => l.employee).map((l) => `${l.employee!.vorname} ${l.employee!.nachname}`))];
          return (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p>
                  <span className="badge-accent mr-2">{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</span>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {d.filename}
                  </a>
                </p>
                <p className="text-xs text-navy-400">
                  {formatDateTime(d.createdAt)} · {Math.round(d.size / 1024)} KB
                  {kunde ? ` · ${kunde}` : ""}
                  {a ? (
                    <>
                      {" · "}
                      <Link href={`/einsaetze/${a.id}`} className="hover:underline">
                        {a.einsatznummer} {a.projekt}
                      </Link>
                    </>
                  ) : null}
                  {personen.length > 0 ? ` · ${personen.slice(0, 4).join(", ")}${personen.length > 4 ? ` +${personen.length - 4}` : ""}` : ""}
                  {" · "}SHA-256 {d.sha256.slice(0, 12)}…
                </p>
              </div>
              <a href={`/api/documents/${d.id}?dl=1`} className="btn-secondary text-xs">
                Download
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
