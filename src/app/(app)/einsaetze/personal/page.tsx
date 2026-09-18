import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireDispo } from "@/lib/einsatz/access";
import { EmployeeForm } from "./employee-form";

export const metadata: Metadata = { title: "Personal" };
export const dynamic = "force-dynamic";

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string }> }) {
  const user = await requireDispo();
  const { edit, q } = await searchParams;
  const employees = await db.employee.findMany({
    where: {
      organizationId: user.organizationId,
      ...(q ? { OR: [{ vorname: { contains: q, mode: "insensitive" } }, { nachname: { contains: q, mode: "insensitive" } }, { personalnummer: { contains: q } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { nachname: "asc" }, { vorname: "asc" }],
    include: { _count: { select: { shiftAssignments: true } } },
  });
  const editing = edit ? employees.find((e) => e.id === edit) ?? null : null;
  const ohneNummer = employees.filter((e) => e.status === "AKTIV" && !e.personalnummer).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <p className="eyebrow">Stammdaten</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Personal</h1>
          <p className="mt-1 text-sm text-navy-400">
            {employees.length} Personen{ohneNummer > 0 ? ` · ${ohneNummer} aktive ohne zvoove-Personalnummer (Export-Validierung schlägt an)` : ""}
          </p>
        </div>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Name oder Personalnummer" className="input" />
          <button type="submit" className="btn-secondary">
            Suchen
          </button>
        </form>
        <div className="card divide-y divide-navy-100 dark:divide-navy-800">
          {employees.length === 0 ? <p className="p-5 text-sm text-navy-400">Keine Mitarbeiter gefunden.</p> : null}
          {employees.map((e) => {
            const zulagen = ((e.lohnartDefaults as { zulagen?: string[] } | null)?.zulagen ?? []).join(", ");
            return (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.nachname}, {e.vorname}
                    {e.status === "INAKTIV" ? <span className="ml-2 badge bg-navy-100 text-navy-500">inaktiv</span> : null}
                    {!e.personalnummer ? <span className="ml-2 badge bg-amber-100 text-amber-700">ohne Personalnummer</span> : null}
                  </p>
                  <p className="text-xs text-navy-400">
                    {[e.personalnummer ? `PN ${e.personalnummer}` : null, e.email, e.mobil, zulagen ? `Zulagen: ${zulagen}` : null].filter(Boolean).join(" · ") || "–"} · {e._count.shiftAssignments} Einteilungen
                  </p>
                </div>
                <a href={`/einsaetze/personal?edit=${e.id}`} className="btn-secondary">
                  Bearbeiten
                </a>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <EmployeeForm key={editing?.id ?? "new"} employee={editing} />
      </div>
    </div>
  );
}
