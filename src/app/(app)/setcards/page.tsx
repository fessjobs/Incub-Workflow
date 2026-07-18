import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hasTheme, SETCARD_THEMES } from "@/lib/setcard/themes";
import { deleteSetcardAction, deletePersonAction } from "./actions";

export const metadata: Metadata = { title: "Setcards" };

export default async function SetcardsPage() {
  const admin = await requireAdmin();

  const [persons, setcards] = await Promise.all([
    db.person.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { setcards: true } } },
    }),
    db.setcard.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { person: { select: { firstName: true, lastName: true } }, company: { select: { brandName: true, shortCode: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">07 / Setcards</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Setcard-Maker</h1>
          <p className="mt-1 text-sm text-navy-400">
            Personal-Setcards im Design der jeweiligen Firma – Unterlagen einlesen, Firma und
            Einsatzbereich wählen, PDF speichern. Personen werden gemerkt und beim nächsten Mal
            vorbefüllt.
          </p>
        </div>
        <Link href="/setcards/neu" className="btn-primary">+ Neue Setcard</Link>
      </div>

      {/* Setcard-Archiv */}
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Archiv</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Erstellte Setcards</h2>
        </div>
        {setcards.length === 0 ? (
          <div className="card px-6 py-10 text-center text-sm text-navy-400">
            Noch keine Setcards – erstelle die erste über „+ Neue Setcard“.
          </div>
        ) : (
          <div className="card divide-y divide-navy-100 dark:divide-navy-800">
            {setcards.map((s) => {
              const theme = SETCARD_THEMES[s.company.shortCode];
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="h-9 w-9 rounded-lg" style={{ background: theme?.primary ?? "#888" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {s.person.firstName} {s.person.lastName}
                      <span className="ml-2 font-mono text-xs text-navy-400">{s.profileNo}</span>
                    </p>
                    <p className="truncate text-xs text-navy-400">
                      {s.company.brandName} · {s.einsatzbereich} · {formatDate(s.createdAt)}
                    </p>
                  </div>
                  <a href={`/setcards/${s.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-1.5">
                    PDF
                  </a>
                  <a href={`/setcards/${s.id}/pdf?dl=1`} className="btn-secondary !px-3 !py-1.5" title="Herunterladen">↓</a>
                  <form action={async () => { "use server"; await deleteSetcardAction(s.id); }}>
                    <button type="submit" className="btn-secondary !px-3 !py-1.5 !text-red-600">Löschen</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Personal-Stamm */}
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Personal-Stamm</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{persons.length} Personen</h2>
        </div>
        {persons.length > 0 && (
          <div className="card divide-y divide-navy-100 dark:divide-navy-800">
            {persons.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white dark:bg-white dark:text-navy-900">
                  {(p.firstName[0] ?? "") + (p.lastName[0] ?? "")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                  <p className="truncate text-xs text-navy-400">
                    {[p.city, p.languages].filter(Boolean).join(" · ") || "–"} · {p._count.setcards} Setcards
                  </p>
                </div>
                <Link href={`/setcards/neu?person=${p.id}`} className="btn-secondary !px-3 !py-1.5">
                  Setcard erstellen
                </Link>
                {p._count.setcards === 0 && (
                  <form action={async () => { "use server"; await deletePersonAction(p.id); }}>
                    <button type="submit" className="btn-secondary !px-3 !py-1.5 !text-red-600">Löschen</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
