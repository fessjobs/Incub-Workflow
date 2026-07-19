import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receiptScope as buildReceiptScope } from "@/lib/receipts";
import { accountVisibility } from "@/lib/bank/scope";
import { CompanyChip } from "@/components/company-chip";
import { OnboardingCard } from "./onboarding-card";
import { formatEuro } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  const isAdmin = user.role === "ADMIN";
  // Sichtbarkeit: eigene Belege + Mitarbeiter (Admins sehen andere Admins nicht)
  const receiptScope = buildReceiptScope(user);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });

  const [
    companies,
    usersCount,
    receiptsCount,
    monthAgg,
    yearAgg,
    openExpenses,
    recent,
    oldReimbursements,
    unmatchedOld,
  ] = await Promise.all([
    db.company.findMany({ where: { organizationId: orgId, active: true }, orderBy: { sortOrder: "asc" } }),
    isAdmin ? db.user.count({ where: { organizationId: orgId, active: true } }) : Promise.resolve(0),
    db.receipt.count({ where: { ...receiptScope, status: "ABGELEGT" } }),
    db.receipt.aggregate({ where: { ...receiptScope, status: "ABGELEGT", receiptDate: { gte: monthStart } }, _sum: { grossAmount: true } }),
    db.receipt.aggregate({ where: { ...receiptScope, status: "ABGELEGT", receiptDate: { gte: yearStart } }, _sum: { grossAmount: true } }),
    db.receipt.aggregate({
      where: { ...receiptScope, status: "ABGELEGT", kind: "AUSLAGE", reimbursementStatus: { in: ["OFFEN", "EINGEREICHT"] } },
      _sum: { grossAmount: true },
      _count: true,
    }),
    db.receipt.findMany({
      where: { ...receiptScope, status: "ABGELEGT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { company: true, user: true },
    }),
    db.receipt.count({
      where: { ...receiptScope, status: "ABGELEGT", kind: "AUSLAGE", reimbursementStatus: { in: ["OFFEN", "EINGEREICHT"] }, receiptDate: { lt: twoWeeksAgo } },
    }),
    isAdmin
      ? db.bankTransaction.count({
          where: {
            organizationId: orgId,
            bankAccount: accountVisibility(user),
            amount: { lt: 0 },
            matchedReceiptId: null,
            ignored: false,
            bookingDate: { lt: twoWeeksAgo },
          },
        })
      : Promise.resolve(0),
  ]);

  const stats = [
    { label: "Ausgaben Monat", value: formatEuro(Number(monthAgg._sum.grossAmount ?? 0)) },
    { label: "Ausgaben Jahr", value: formatEuro(Number(yearAgg._sum.grossAmount ?? 0)) },
    { label: "Offene Auslagen", value: formatEuro(Number(openExpenses._sum.grossAmount ?? 0)) },
    isAdmin ? { label: "Nutzer", value: String(usersCount) } : { label: "Belege", value: String(receiptsCount) },
  ];

  const reminders: { text: string; href: string }[] = [];
  if (isAdmin && unmatchedOld > 0) {
    reminders.push({ text: `${unmatchedOld} Zahlung${unmatchedOld === 1 ? "" : "en"} ohne Beleg älter als 14 Tage`, href: "/abgleich?v=ohne-beleg" });
  }
  if (oldReimbursements > 0) {
    reminders.push({ text: `${oldReimbursements} offene Auslage${oldReimbursements === 1 ? "" : "n"} älter als 14 Tage`, href: "/abgleich?v=auslagen" });
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">01 / Übersicht</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isAdmin ? "Unternehmensgruppe" : `Hallo, ${user.name.split(" ")[0]}`}
          </h1>
          <p className="mt-1 text-sm text-navy-400">
            {isAdmin ? "Alle Firmen, Belege und Auswertungen auf einen Blick." : "Deine Belege und Auslagen auf einen Blick."}
          </p>
        </div>
        <Link href="/belege/neu" className="btn-primary">+ Belege erfassen</Link>
      </div>

      {isAdmin && !org.onboarded && <OnboardingCard companiesCount={companies.length} />}

      {/* Erinnerungs-Widget */}
      {reminders.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs font-semibold uppercase tracking-eyebrow text-amber-700 dark:text-amber-300">Erinnerungen</p>
          <ul className="mt-2 space-y-1">
            {reminders.map((r, i) => (
              <li key={i}>
                <Link href={r.href} className="text-sm text-amber-900 underline-offset-2 hover:underline dark:text-amber-200">
                  → {r.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-navy-400">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Zuletzt erfasst */}
        <section>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="eyebrow">Zuletzt erfasst</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Neueste Belege</h2>
            </div>
            <Link href="/belege" className="text-sm text-navy-500 hover:underline">Alle →</Link>
          </div>
          <div className="card mt-4 divide-y divide-navy-100 dark:divide-navy-800">
            {recent.length === 0 ? (
              <p className="p-4 text-sm text-navy-400">Noch keine Belege erfasst.</p>
            ) : (
              recent.map((r) => (
                <Link key={r.id} href={`/belege/${r.id}`} className="flex items-center gap-3 p-4 text-sm hover:bg-navy-50/50 dark:hover:bg-navy-800/40">
                  <span className="font-mono text-xs text-navy-400">{r.receiptNumber}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.vendor}</span>
                  <span className="text-xs text-navy-400">{r.company?.brandName ?? "–"}</span>
                  <span className="tabular-nums font-medium">{formatEuro(Number(r.grossAmount))}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Firmen */}
        <section>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="eyebrow">Firmen</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Unternehmensgruppe</h2>
            </div>
            {isAdmin && <Link href="/einstellungen/firmen" className="text-sm text-navy-500 hover:underline">Verwalten →</Link>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {companies.map((c) => (
              <CompanyChip key={c.id} name={c.brandName} location={c.location} color={c.color} isPrivate={c.isPrivate} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
