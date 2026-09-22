import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRater } from "@/lib/einsatz/access";
import { bewertungsVerlauf, erfahrungFuer, erfahrungOder, stufe } from "@/lib/einsatz/service/personal";
import { berlinDateKey, formatKeyDE } from "@/lib/einsatz/tz";
import { formatDateTime } from "@/lib/format";
import { BilanzBadge, WERT_LABEL } from "../../rating-badges";

export const metadata: Metadata = { title: "Mitarbeiterprofil" };
export const dynamic = "force-dynamic";

const WERT_STIL: Record<string, string> = {
  POSITIV: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  NEUTRAL: "badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300",
  NEGATIV: "badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// Internes Profil: Erfahrung je Tätigkeit und der Verlauf der Beurteilungen.
// Nur fürs Backend – die Person sieht davon in ihrem Link nichts.
export default async function MitarbeiterProfilPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRater();
  const { id } = await params;
  const e = await db.employee.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!e) notFound();

  const [erfahrungMap, verlauf] = await Promise.all([erfahrungFuer(user.organizationId, [e.id]), bewertungsVerlauf(user.organizationId, e.id)]);
  const erf = erfahrungOder(erfahrungMap, e.id);
  const zulagen = ((e.lohnartDefaults as { zulagen?: string[] } | null)?.zulagen ?? []).join(", ");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">
          <Link href="/einsaetze/personal" className="hover:underline">
            Personal
          </Link>{" "}
          · Profil
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {e.vorname} {e.nachname}
          {e.status === "INAKTIV" ? <span className="ml-2 badge bg-navy-100 text-navy-500">inaktiv</span> : null}
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          {[e.personalnummer ? `PN ${e.personalnummer}` : "ohne Personalnummer", e.email, e.mobil, zulagen ? `Zulagen: ${zulagen}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="badge-accent" data-testid="profil-schichten">
            {erf.schichten} {erf.schichten === 1 ? "Schicht" : "Schichten"} · {stufe(erf.schichten)}
          </span>
          <span className="badge bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-200">{erf.stunden.toFixed(2).replace(".", ",")} h gesamt</span>
          <BilanzBadge bilanz={erf.bilanz} testId="profil-bilanz" />
          {erf.letzterEinsatz ? <span className="text-xs text-navy-400">zuletzt im Einsatz {formatKeyDE(berlinDateKey(erf.letzterEinsatz))}</span> : null}
        </div>
        <Link href={`/einsaetze/personal?edit=${e.id}`} className="btn-secondary mt-3 inline-flex">
          Stammdaten bearbeiten
        </Link>
      </div>

      <div className="card p-5">
        <p className="eyebrow">Erfahrung je Tätigkeit</p>
        <p className="mt-1 text-sm text-navy-400">Gezählt werden Schichten, für die diese Person ihre Zeiten erfasst und unterschrieben hat.</p>
        {erf.taetigkeiten.length === 0 ? (
          <p className="mt-3 text-sm text-navy-400" data-testid="profil-keine-erfahrung">
            Noch keine unterschriebene Schicht.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm" data-testid="profil-taetigkeiten">
            <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
              <tr>
                <th className="px-3 py-2">Tätigkeit</th>
                <th className="px-3 py-2">Schichten</th>
                <th className="px-3 py-2">Stunden</th>
                <th className="px-3 py-2">Stufe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
              {erf.taetigkeiten.map((t) => (
                <tr key={t.taetigkeit}>
                  <td className="px-3 py-2 font-medium">{t.taetigkeit}</td>
                  <td className="px-3 py-2 tabular-nums">{t.schichten}</td>
                  <td className="px-3 py-2 tabular-nums">{t.stunden.toFixed(2).replace(".", ",")}</td>
                  <td className="px-3 py-2">
                    <span className="badge-accent">{stufe(t.schichten)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-5">
        <p className="eyebrow">Beurteilungen</p>
        <p className="mt-1 text-sm text-navy-400">
          Interne Einschätzung der Disposition nach einem Einsatz. Sie steht in keinem Mitarbeiter-Link, auf keinem PDF und in keinem Export.
        </p>
        {verlauf.length === 0 ? (
          <p className="mt-3 text-sm text-navy-400" data-testid="profil-keine-bewertung">
            Noch nicht bewertet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-navy-100 text-sm dark:divide-navy-800" data-testid="profil-verlauf">
            {verlauf.map((b) => (
              <li key={b.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={WERT_STIL[b.wert]}>{WERT_LABEL[b.wert]}</span>
                  <Link href={`/einsaetze/${b.shiftAssignment.shift.assignment.id}`} className="font-medium hover:underline">
                    {b.shiftAssignment.shift.assignment.einsatznummer} {b.shiftAssignment.shift.assignment.projekt}
                  </Link>
                  <span className="text-xs text-navy-400">
                    {b.shiftAssignment.shift.assignment.customer.name} · {b.shiftAssignment.shift.bezeichnung}
                    {b.shiftAssignment.shift.taetigkeit ? ` · ${b.shiftAssignment.shift.taetigkeit}` : ""} · {formatKeyDE(berlinDateKey(b.shiftAssignment.planStart))}
                  </span>
                </div>
                {b.notiz ? <p className="mt-0.5 text-sm text-navy-500">„{b.notiz}“</p> : null}
                <p className="text-xs text-navy-400">bewertet {formatDateTime(b.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
