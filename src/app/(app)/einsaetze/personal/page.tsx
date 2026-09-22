import type { Metadata } from "next";
import { db } from "@/lib/db";
import { canRate, requireDispo } from "@/lib/einsatz/access";
import { bilanzUrteil, erfahrungFuer, erfahrungOder, stufe } from "@/lib/einsatz/service/personal";
import { BilanzBadge, ErfahrungZeile } from "../rating-badges";
import { EmployeeForm } from "./employee-form";

export const metadata: Metadata = { title: "Personal" };
export const dynamic = "force-dynamic";

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string; sort?: string }> }) {
  const user = await requireDispo();
  const { edit, q, sort } = await searchParams;
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

  // Erfahrung und Bewertungsbilanz – nur fürs Backend
  const darfBewerten = canRate(user);
  const erfahrung = darfBewerten ? await erfahrungFuer(user.organizationId, employees.map((e) => e.id)) : new Map();
  const liste = [...employees];
  if (darfBewerten && sort === "schichten") {
    liste.sort((a, b) => erfahrungOder(erfahrung, b.id).schichten - erfahrungOder(erfahrung, a.id).schichten);
  } else if (darfBewerten && sort === "bewertung") {
    // Auffälliges zuerst: überwiegend negativ, dann gemischt, dann der Rest
    const rang = { negativ: 0, gemischt: 1, positiv: 2, offen: 3 } as const;
    liste.sort((a, b) => rang[bilanzUrteil(erfahrungOder(erfahrung, a.id).bilanz)] - rang[bilanzUrteil(erfahrungOder(erfahrung, b.id).bilanz)]);
  }
  const bewertet = darfBewerten ? [...erfahrung.values()].filter((e) => e.bilanz.positiv + e.bilanz.neutral + e.bilanz.negativ > 0).length : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <p className="eyebrow">Stammdaten</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Personal</h1>
          <p className="mt-1 text-sm text-navy-400">
            {employees.length} Personen{ohneNummer > 0 ? ` · ${ohneNummer} aktive ohne zvoove-Personalnummer (Export-Validierung schlägt an)` : ""}
            {darfBewerten ? ` · ${bewertet} bewertet` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/einsaetze/personal/import" className="btn-accent" data-testid="import-link">
            Liste importieren
          </a>
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Name oder Personalnummer" className="input max-w-xs" />
          {darfBewerten ? (
            <select name="sort" defaultValue={sort ?? ""} className="input max-w-[14rem]" aria-label="Sortierung" data-testid="personal-sort">
              <option value="">Sortierung: Name</option>
              <option value="schichten">Meiste Schichten zuerst</option>
              <option value="bewertung">Auffällige Bewertungen zuerst</option>
            </select>
          ) : null}
          <button type="submit" className="btn-secondary">
            Anzeigen
          </button>
        </form>
        <div className="card divide-y divide-navy-100 dark:divide-navy-800">
          {liste.length === 0 ? <p className="p-5 text-sm text-navy-400">Keine Mitarbeiter gefunden.</p> : null}
          {liste.map((e) => {
            const zulagen = ((e.lohnartDefaults as { zulagen?: string[] } | null)?.zulagen ?? []).join(", ");
            const erf = erfahrungOder(erfahrung, e.id);
            return (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid={`personal-${e.id}`}>
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.nachname}, {e.vorname}
                    {e.status === "INAKTIV" ? <span className="ml-2 badge bg-navy-100 text-navy-500">inaktiv</span> : null}
                    {!e.personalnummer ? <span className="ml-2 badge bg-amber-100 text-amber-700">ohne Personalnummer</span> : null}
                  </p>
                  <p className="text-xs text-navy-400">
                    {[e.personalnummer ? `PN ${e.personalnummer}` : null, e.email, e.mobil, zulagen ? `Zulagen: ${zulagen}` : null].filter(Boolean).join(" · ") || "–"} · {e._count.shiftAssignments} Einteilungen
                  </p>
                  {darfBewerten ? (
                    <p className="mt-1.5" data-testid={`erfahrung-${e.id}`}>
                      <ErfahrungZeile e={erf} /> <BilanzBadge bilanz={erf.bilanz} testId={`bilanz-${e.id}`} />
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {darfBewerten ? (
                    <a href={`/einsaetze/personal/${e.id}`} className="btn-secondary" data-testid={`profil-${e.id}`}>
                      Profil
                    </a>
                  ) : null}
                  <a href={`/einsaetze/personal?edit=${e.id}`} className="btn-secondary">
                    Bearbeiten
                  </a>
                </div>
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
