import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireDispo } from "@/lib/einsatz/access";
import { BUNDESLAENDER } from "@/lib/einsatz/holidays";
import { CustomerForm } from "./customer-form";
import { toggleCustomer } from "./actions";

export const metadata: Metadata = { title: "Kunden" };
export const dynamic = "force-dynamic";

export default async function KundenPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireDispo();
  const { edit } = await searchParams;
  const customers = await db.customer.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ aktiv: "desc" }, { name: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });
  const editing = edit ? customers.find((c) => c.id === edit) ?? null : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Stammdaten</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kunden (Entleiher)</h1>
          </div>
          <a href="/einsaetze/kunden/import" className="btn-accent" data-testid="import-link">
            Liste importieren
          </a>
        </div>
        <div className="card divide-y divide-navy-100 dark:divide-navy-800">
          {customers.length === 0 ? <p className="p-5 text-sm text-navy-400">Noch keine Kunden.</p> : null}
          {customers.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {c.name}
                  {!c.aktiv ? <span className="ml-2 badge bg-navy-100 text-navy-500">inaktiv</span> : null}
                </p>
                <p className="text-xs text-navy-400">
                  {[c.adresse, c.ansprechpartner, c.standardEinsatzort, c.bundesland ? BUNDESLAENDER[c.bundesland] : null, c.aueVertragRef].filter(Boolean).join(" · ") || "–"} · {c._count.assignments} Einsätze
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/einsaetze/kunden?edit=${c.id}`} className="btn-secondary">
                  Bearbeiten
                </a>
                <form action={toggleCustomer.bind(null, c.id)}>
                  <button type="submit" className="btn-secondary">
                    {c.aktiv ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <CustomerForm key={editing?.id ?? "new"} customer={editing} bundeslaender={BUNDESLAENDER} />
      </div>
    </div>
  );
}
