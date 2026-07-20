import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchReceipts, matchCombinations } from "@/lib/bank/match";
import { accountVisibility } from "@/lib/bank/scope";
import { receiptVisibility } from "@/lib/receipts";
import { formatEuro, formatDate } from "@/lib/format";
import { StatementUpload } from "./statement-upload";
import { TransactionCard } from "./transaction-card";
import { UnpaidReceiptRow } from "./unpaid-receipt-row";

export const metadata: Metadata = { title: "Abgleich" };

type SP = Record<string, string | string[] | undefined>;

export default async function AbgleichPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const orgId = user.organizationId;
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const view = (typeof sp.v === "string" ? sp.v : "") || "ohne-beleg";

  // Sichtbarkeit: eigene Konten/Belege + die der Mitarbeiter (Admins sehen
  // die anderer Admins nicht)
  const ownAccounts = accountVisibility(user);
  const ownReceipts = receiptVisibility(user);

  const accounts = await db.bankAccount.findMany({
    where: { organizationId: orgId, active: true, ...ownAccounts },
    orderBy: { name: "asc" },
  });

  // Firmen für die Zuordnung "diese Ausgabe war für Firma X"
  const companies = await db.company.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, brandName: true },
  });

  // Kandidaten-Belege für Matching-Vorschläge (abgelegt, nicht gematcht)
  const allReceipts = await db.receipt.findMany({
    where: { organizationId: orgId, status: "ABGELEGT", ...ownReceipts },
    select: {
      id: true,
      receiptNumber: true,
      grossAmount: true,
      receiptDate: true,
      vendor: true,
      kind: true,
      reimbursementStatus: true,
      company: { select: { brandName: true } },
      user: { select: { name: true } },
      transactions: { select: { id: true } },
      paymentLinks: { select: { id: true } },
    },
  });
  const unmatchedReceipts = allReceipts.filter((r) => r.transactions.length === 0 && r.paymentLinks.length === 0);

  // (1) Zahlung ohne Beleg – Ausgaben ohne zugeordneten Beleg, nicht ignoriert
  const unpaidTxns = await db.bankTransaction.findMany({
    where: {
      organizationId: orgId,
      amount: { lt: 0 },
      matchedReceiptId: null,
      ignored: false,
      bankAccount: { ...ownAccounts },
    },
    orderBy: { bookingDate: "desc" },
    include: { bankAccount: { select: { name: true } } },
  });

  // (2) Beleg ohne Zahlung – abgelegte Belege ohne Kontobewegung
  const receiptsWithoutPayment = unmatchedReceipts;

  // (3) Auslagen offen – Auslagen ohne gematchte Erstattung
  const openExpenses = allReceipts.filter(
    (r) => r.kind === "AUSLAGE" && (r.reimbursementStatus === "OFFEN" || r.reimbursementStatus === "EINGEREICHT")
  );

  const receiptPool = unmatchedReceipts.map((r) => ({
    id: r.id,
    grossAmount: Number(r.grossAmount),
    receiptDate: r.receiptDate,
    vendor: r.vendor,
  }));

  const views = [
    { key: "ohne-beleg", label: "Zahlung ohne Beleg", count: unpaidTxns.length },
    { key: "ohne-zahlung", label: "Beleg ohne Zahlung", count: receiptsWithoutPayment.length },
    { key: "auslagen", label: "Auslagen offen", count: openExpenses.length },
  ];

  return (
    <div className="space-y-8">
      <StatementUpload accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      {accounts.length === 0 && (
        <div className="card px-6 py-8 text-center text-sm text-navy-400">
          Noch keine Bankkonten angelegt.{" "}
          <Link href="/abgleich/konten" className="text-navy-600 underline dark:text-navy-200">
            Konto anlegen →
          </Link>
        </div>
      )}

      {/* Ansichts-Umschalter */}
      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <Link
            key={v.key}
            href={`/abgleich?v=${v.key}`}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              view === v.key
                ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
            }`}
          >
            {v.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                view === v.key ? "bg-white/20" : "bg-navy-100 dark:bg-navy-800"
              }`}
            >
              {v.count}
            </span>
          </Link>
        ))}
      </div>

      {/* (1) Zahlung ohne Beleg */}
      {view === "ohne-beleg" && (
        <section className="space-y-3">
          <p className="text-sm text-navy-400">
            Kontobewegungen, denen noch kein Beleg gegenübersteht. Passenden Beleg zuordnen oder als
            beleglos ignorieren (z. B. Miete, Gehälter).
          </p>
          {unpaidTxns.length === 0 ? (
            <Empty text="Alle Zahlungen haben einen Beleg. 🎉" />
          ) : (
            unpaidTxns.map((t) => {
              const cands = matchReceipts(
                { amount: Number(t.amount), bookingDate: t.bookingDate, counterparty: t.counterparty, purpose: t.purpose },
                receiptPool
              ).slice(0, 3);
              const suggestions = cands.map((c) => {
                const r = unmatchedReceipts.find((x) => x.id === c.receiptId)!;
                return {
                  ids: [r.id],
                  label: `${r.receiptNumber ?? ""} · ${r.vendor} · ${formatEuro(Number(r.grossAmount))} · ${formatDate(r.receiptDate)}`,
                };
              });
              // Sammel-Abbuchung: Kombination mehrerer Belege ergibt den Betrag
              // (z. B. Amazon bündelt Einzelrechnungen in einer Abbuchung)
              for (const combo of matchCombinations({ amount: Number(t.amount), bookingDate: t.bookingDate }, receiptPool, 2)) {
                const parts = combo.receiptIds.map((id) => {
                  const r = unmatchedReceipts.find((x) => x.id === id)!;
                  return `${r.receiptNumber ?? r.vendor} ${formatEuro(Number(r.grossAmount))}`;
                });
                suggestions.push({
                  ids: combo.receiptIds,
                  label: `${combo.receiptIds.length} Belege${combo.sameVendor ? " (gleicher Lieferant)" : ""}: ${parts.join(" + ")} = ${formatEuro(Math.abs(Number(t.amount)))}`,
                });
              }
              return (
                <TransactionCard
                  key={t.id}
                  txn={{
                    id: t.id,
                    account: t.bankAccount.name,
                    bookingDate: formatDate(t.bookingDate),
                    amount: formatEuro(Number(t.amount)),
                    counterparty: t.counterparty,
                    purpose: t.purpose,
                    companyId: t.companyId,
                  }}
                  companies={companies}
                  suggestions={suggestions}
                />
              );
            })
          )}
        </section>
      )}

      {/* (2) Beleg ohne Zahlung */}
      {view === "ohne-zahlung" && (
        <section className="space-y-3">
          <p className="text-sm text-navy-400">
            Erfasste Belege, denen keine Kontobewegung gegenübersteht (bar bezahlt, oder Auslage noch
            nicht erstattet).
          </p>
          {receiptsWithoutPayment.length === 0 ? (
            <Empty text="Jeder Beleg ist einer Zahlung zugeordnet." />
          ) : (
            <div className="card divide-y divide-navy-100 dark:divide-navy-800">
              {receiptsWithoutPayment.map((r) => (
                <UnpaidReceiptRow
                  key={r.id}
                  receipt={{
                    id: r.id,
                    receiptNumber: r.receiptNumber,
                    vendor: r.vendor,
                    amount: formatEuro(Number(r.grossAmount)),
                    date: formatDate(r.receiptDate),
                    company: r.company?.brandName ?? "–",
                    user: r.user.name,
                    kind: r.kind,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* (3) Auslagen offen */}
      {view === "auslagen" && (
        <section className="space-y-3">
          <p className="text-sm text-navy-400">
            Auslagen mit Status „offen/eingereicht“, bei denen noch keine Erstattung gematcht wurde.
            Sobald die Erstattung auf einem importierten Auszug erscheint, wird der Status automatisch
            auf „erstattet“ gesetzt.
          </p>
          {openExpenses.length === 0 ? (
            <Empty text="Keine offenen Auslagen." />
          ) : (
            <div className="card divide-y divide-navy-100 dark:divide-navy-800">
              {openExpenses.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <Link href={`/belege/${r.id}`} className="font-mono text-xs hover:underline">
                    {r.receiptNumber}
                  </Link>
                  <span className="flex-1 truncate">{r.vendor}</span>
                  <span className="text-navy-400">{r.user.name}</span>
                  <span className="text-navy-400">{formatDate(r.receiptDate)}</span>
                  <span className="tabular-nums font-medium">{formatEuro(Number(r.grossAmount))}</span>
                  <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    {r.reimbursementStatus === "EINGEREICHT" ? "eingereicht" : "offen"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card px-6 py-10 text-center text-sm text-navy-400">{text}</div>;
}
