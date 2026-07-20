import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receiptScope, seesAllReceipts } from "@/lib/receipts";
import { findPaymentHints } from "@/lib/payment-hint";
import { formatEuro, formatDate } from "@/lib/format";
import { DraftQueue } from "./draft-queue";
import { ReceiptFilters } from "./receipt-filters";
import { StatusBadge } from "./status-badge";
import { EmployeeReview } from "./employee-review";
import { DatevToggle } from "./datev-toggle";

export const metadata: Metadata = { title: "Belege" };

type SP = Record<string, string | string[] | undefined>;

function s(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function BelegePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isAdmin = user.role === "ADMIN";
  // Buchhaltung sieht wie der Admin alle Belege (lesend, für Export/Sortierung)
  const seesAll = seesAllReceipts(user);

  const [companies, categories, users, cards] = await Promise.all([
    db.company.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.category.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    seesAll
      ? db.user.findMany({
          // Admin: nur sich selbst + Mitarbeiter im Filter (keine anderen Admins)
          where: {
            organizationId: user.organizationId,
            ...(isAdmin ? { OR: [{ id: user.id }, { role: { not: "ADMIN" } }] } : {}),
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    db.corporateCard.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  // Firmen, für die der Nutzer einreichen darf (Einschränkung)
  const access = await db.userCompanyAccess.findMany({ where: { userId: user.id } });
  const allowedCompanies =
    access.length === 0 ? companies : companies.filter((c) => access.some((a) => a.companyId === c.id));

  // Entwürfe (immer eigene, ungefiltert)
  const drafts = await db.receipt.findMany({
    where: { ...receiptScope(user), status: "ENTWURF" },
    orderBy: { createdAt: "desc" },
    include: { company: true, category: true },
  });

  // Zahlungs-Hinweis: Passt zu einem Entwurf schon eine Abbuchung auf einem
  // hinterlegten Konto (Bankkonto/Firmenkarte)? Dann direkt anzeigen.
  const paymentHints = await findPaymentHints(
    user,
    drafts.map((d) => ({ id: d.id, grossAmount: Number(d.grossAmount), receiptDate: d.receiptDate }))
  );

  // Filter für abgelegte Belege
  const where: Prisma.ReceiptWhereInput = { ...receiptScope(user), status: "ABGELEGT" };
  const q = s(sp.q).trim();
  if (q) {
    where.OR = [
      { vendor: { contains: q, mode: "insensitive" } },
      { purpose: { contains: q, mode: "insensitive" } },
      { receiptNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (s(sp.company)) where.companyId = s(sp.company);
  if (s(sp.category)) where.categoryId = s(sp.category);
  if (s(sp.kind)) where.kind = s(sp.kind) as never;
  if (s(sp.reimb)) where.reimbursementStatus = s(sp.reimb) as never;
  if (s(sp.pay)) where.paymentMethod = s(sp.pay) as never;
  if (s(sp.card)) where.corporateCardId = s(sp.card);
  // "Auslagen Mitarbeiter"-Ordner: über den Mitarbeiter-Link eingereicht
  if (s(sp.ma) === "1") where.viaEmployeeLink = true;
  // DATEV-Status: offen / hochgeladen
  if (s(sp.datev) === "offen") where.datevUploadedAt = null;
  if (s(sp.datev) === "hochgeladen") where.datevUploadedAt = { not: null };
  if (seesAll && s(sp.user)) where.userId = s(sp.user);
  if (s(sp.from) || s(sp.to)) {
    where.receiptDate = {};
    if (s(sp.from)) (where.receiptDate as Prisma.DateTimeFilter).gte = new Date(s(sp.from));
    if (s(sp.to)) {
      const to = new Date(s(sp.to));
      to.setHours(23, 59, 59, 999);
      (where.receiptDate as Prisma.DateTimeFilter).lte = to;
    }
  }

  const filed = await db.receipt.findMany({
    where,
    // Mitarbeiter-Ordner: nach Name sortiert, sonst neueste zuerst
    orderBy:
      s(sp.ma) === "1"
        ? [{ submittedByName: "asc" }, { receiptDate: "desc" }]
        : [{ receiptDate: "desc" }, { createdAt: "desc" }],
    include: { company: true, category: true, user: true, corporateCard: true },
    take: 200,
  });

  const sum = filed.reduce((acc, r) => acc + Number(r.grossAmount), 0);

  // Ordner "Auslagen Mitarbeiter" (nur Admin/Buchhaltung)
  const employeeCount = seesAll
    ? await db.receipt.count({
        where: { organizationId: user.organizationId, status: "ABGELEGT", viaEmployeeLink: true },
      })
    : 0;
  // Wie viele davon warten noch auf die Admin-Freigabe?
  const pendingEmployeeCount =
    user.role === "ADMIN"
      ? await db.receipt.count({
          where: {
            organizationId: user.organizationId,
            status: "ABGELEGT",
            viaEmployeeLink: true,
            employeeReview: "AUSSTEHEND",
          },
        })
      : 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">02 / Belege</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Belege</h1>
        </div>
        <Link href="/belege/neu" className="btn-primary">
          + Belege erfassen
        </Link>
      </div>

      {/* Entwürfe: schnelle Zuordnung */}
      {drafts.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="eyebrow">Zuordnen</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {drafts.length} {drafts.length === 1 ? "Entwurf" : "Entwürfe"} warten
            </h2>
            <p className="mt-1 text-sm text-navy-400">
              Firma per Tap wählen, Felder prüfen, ablegen. Für Sonderfälle (Bewirtung, Eigenbeleg) „Details“ öffnen.
            </p>
          </div>
          <DraftQueue
            drafts={drafts.map((d) => ({
              id: d.id,
              vendor: d.vendor,
              grossAmount: Number(d.grossAmount),
              receiptDate: d.receiptDate.toISOString().slice(0, 10),
              companyId: d.companyId,
              categoryId: d.categoryId,
              kind: d.kind,
              approved: d.approved,
              paymentHint: paymentHints.get(d.id) ?? null,
            }))}
            companies={allowedCompanies.map((c) => ({ id: c.id, brandName: c.brandName, color: c.color, location: c.location, isPrivate: c.isPrivate }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </section>
      )}

      {/* Abgelegte Belege */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="eyebrow">Abgelegt</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Belegarchiv</h2>
          </div>
          <p className="text-sm text-navy-400">
            {filed.length} Belege · Summe {formatEuro(sum)}
          </p>
        </div>

        {/* Ordner: Auslagen Mitarbeiter (über den Mitarbeiter-Link eingereicht) */}
        {employeeCount > 0 && (
          <Link
            href="/belege?ma=1"
            className="card flex items-center gap-3 border-l-4 border-l-emerald-500 p-4 transition hover:bg-navy-50/50 dark:hover:bg-navy-800/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Auslagen Mitarbeiter</span>
              <span className="block text-xs text-navy-400">
                {employeeCount} Belege über den Mitarbeiter-Link · sortiert nach Name und Datum
              </span>
              {pendingEmployeeCount > 0 && (
                <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {pendingEmployeeCount} warten auf Freigabe
                </span>
              )}
            </span>
            <span className="text-sm text-navy-400">→</span>
          </Link>
        )}

        <ReceiptFilters
          companies={companies.map((c) => ({ id: c.id, brandName: c.brandName }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          users={users}
          cards={cards}
          isAdmin={seesAll}
        />

        {filed.length === 0 ? (
          <div className="card px-6 py-12 text-center text-sm text-navy-400">
            Keine Belege gefunden. Passe die Filter an oder erfasse neue Belege.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-100 text-left text-xs text-navy-400 dark:border-navy-800">
                    <th className="px-4 py-3 font-medium">Belegnr.</th>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Aussteller</th>
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="px-4 py-3 font-medium">Kategorie</th>
                    {seesAll && <th className="px-4 py-3 font-medium">Einreicher</th>}
                    <th className="px-4 py-3 text-right font-medium">Brutto</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {seesAll && <th className="px-4 py-3 font-medium">DATEV</th>}
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filed.map((r) => (
                    <tr key={r.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50 dark:border-navy-800/60 dark:hover:bg-navy-800/40">
                      <td className="px-4 py-3 font-mono text-xs">{r.receiptNumber}</td>
                      <td className="px-4 py-3">{formatDate(r.receiptDate)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/belege/${r.id}`} className="font-medium hover:underline">
                          {r.vendor || "–"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{r.company?.brandName ?? "–"}</td>
                      <td className="px-4 py-3 text-navy-500 dark:text-navy-300">{r.category?.name ?? "–"}</td>
                      {seesAll && (
                        <td className="px-4 py-3 text-navy-500 dark:text-navy-300">
                          {r.submittedByName || r.user.name}
                          {r.corporateCard && (
                            <span className="ml-1 text-xs text-navy-400">· {r.corporateCard.label}</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right tabular-nums">{formatEuro(Number(r.grossAmount))}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <StatusBadge kind={r.kind} approved={r.approved} reimbursement={r.reimbursementStatus} />
                          {r.viaEmployeeLink && (
                            <EmployeeReview
                              receiptId={r.id}
                              status={r.employeeReview}
                              comment={r.employeeReviewComment}
                              isAdmin={isAdmin}
                              compact
                            />
                          )}
                        </div>
                      </td>
                      {seesAll && (
                        <td className="px-4 py-3">
                          <DatevToggle
                            receiptId={r.id}
                            uploadedAt={r.datevUploadedAt ? r.datevUploadedAt.toISOString() : null}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <a href={`/belege/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs text-navy-500 underline-offset-2 hover:underline" title="PDF öffnen">
                            PDF
                          </a>
                          <Link href={`/belege/${r.id}`} className="text-xs text-navy-500 underline-offset-2 hover:underline">
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
