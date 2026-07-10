import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CompanyChip } from "@/components/company-chip";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  const isAdmin = user.role === "ADMIN";

  // Member sehen ausschließlich eigene Belege (Spec Abschnitt 3)
  const receiptScope = isAdmin ? { organizationId: orgId } : { organizationId: orgId, userId: user.id };

  const [companies, categoriesCount, usersCount, receiptsCount, openExpenses] = await Promise.all([
    db.company.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.category.count({ where: { organizationId: orgId, active: true } }),
    isAdmin ? db.user.count({ where: { organizationId: orgId, active: true } }) : Promise.resolve(0),
    db.receipt.count({ where: receiptScope }),
    db.receipt.count({
      where: { ...receiptScope, kind: "AUSLAGE", reimbursementStatus: { in: ["OFFEN", "EINGEREICHT"] } },
    }),
  ]);

  const stats = [
    { label: "Erfasste Belege", value: receiptsCount },
    { label: "Offene Auslagen", value: openExpenses },
    { label: "Aktive Firmen", value: companies.length },
    ...(isAdmin
      ? [{ label: "Nutzer", value: usersCount }]
      : [{ label: "Kategorien", value: categoriesCount }]),
  ];

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">01 / Übersicht</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {isAdmin ? "Unternehmensgruppe" : `Hallo, ${user.name.split(" ")[0]}`}
        </h1>
        <p className="mt-1 text-sm text-navy-400">
          {isAdmin
            ? "Alle Firmen, Belege und Auswertungen auf einen Blick."
            : "Deine Belege und Auslagen auf einen Blick."}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-navy-400">{s.label}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="eyebrow">02 / Firmen</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Unternehmensgruppe</h2>
          </div>
          {isAdmin && (
            <Link href="/einstellungen/firmen" className="text-sm text-navy-500 underline-offset-4 hover:underline">
              Verwalten →
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {companies.map((c) => (
            <CompanyChip key={c.id} name={c.brandName} location={c.location} color={c.color} isPrivate={c.isPrivate} />
          ))}
        </div>
      </section>

      <section className="card flex flex-col items-start gap-3 p-6">
        <p className="eyebrow">03 / Nächster Schritt</p>
        <h2 className="text-lg font-semibold tracking-tight">Beleg-Erfassung folgt in Sprint 2</h2>
        <p className="max-w-xl text-sm leading-relaxed text-navy-400">
          Das Fundament steht: Anmeldung, Rollen, Firmen, Kategorien und Nutzerverwaltung.
          Als Nächstes kommt der Kern-Flow – Beleg fotografieren, automatisch auslesen,
          Beiblatt als PDF ablegen.
        </p>
      </section>
    </div>
  );
}
