import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchReceipts } from "@/lib/bank/match";
import { formatEuro, formatDate } from "@/lib/format";
import { BookingRow } from "./booking-row";

export const metadata: Metadata = { title: "Buchungen" };

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Alle Buchungen pro Konto: pro Zeile Privat/Firma wählen, Beleg-Vorschlag
// bestätigen und die Buchung freigeben (abhaken).
export default async function BuchungenPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const status = s(sp.status) || "offen";

  const ownAccounts: Prisma.BankAccountWhereInput = isAdmin ? {} : { userId: user.id };
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: user.organizationId, active: true, ...ownAccounts },
    orderBy: { name: "asc" },
    select: { id: true, name: true, userId: true },
  });

  const accountId = s(sp.konto) || accounts[0]?.id || "";
  const account = accounts.find((a) => a.id === accountId) ?? null;

  const companies = await db.company.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, brandName: true, isPrivate: true },
  });

  const txns = account
    ? await db.bankTransaction.findMany({
        where: { organizationId: user.organizationId, bankAccountId: account.id },
        orderBy: { bookingDate: "desc" },
        take: 500,
        include: { matchedReceipt: { select: { id: true, receiptNumber: true, vendor: true } } },
      })
    : [];

  // Beleg-Pool für Vorschläge: Belege des Konto-Eigentümers ohne Verknüpfung
  const receipts = account
    ? await db.receipt.findMany({
        where: {
          organizationId: user.organizationId,
          status: "ABGELEGT",
          ...(account.userId ? { userId: account.userId } : {}),
        },
        select: {
          id: true,
          receiptNumber: true,
          vendor: true,
          grossAmount: true,
          receiptDate: true,
          kind: true,
          reimbursementStatus: true,
          transactions: { select: { id: true } },
        },
      })
    : [];
  const freeReceipts = receipts.filter((r) => r.transactions.length === 0);
  const pool = freeReceipts.map((r) => ({
    id: r.id,
    grossAmount: Number(r.grossAmount),
    receiptDate: r.receiptDate,
    vendor: r.vendor,
  }));
  const label = (id: string) => {
    const r = freeReceipts.find((x) => x.id === id)!;
    return `${r.receiptNumber ?? ""} · ${r.vendor || "Beleg"} · ${formatEuro(Number(r.grossAmount))} · ${formatDate(r.receiptDate)}`;
  };

  const openCount = txns.filter((t) => !t.reviewed && !t.ignored).length;
  const filtered = txns.filter((t) => {
    if (status === "offen") return !t.reviewed && !t.ignored;
    if (status === "frei") return t.reviewed;
    return true;
  });

  const rows = filtered.map((t) => {
    // Vorschlag: Ausgaben über das normale Matching, Eingänge gegen offene Auslagen
    let suggestion: { receiptId: string; label: string } | null = null;
    if (!t.matchedReceiptId && !t.ignored) {
      const amount = Number(t.amount);
      if (amount < 0) {
        const cands = matchReceipts(
          { amount, bookingDate: t.bookingDate, counterparty: t.counterparty, purpose: t.purpose },
          pool
        );
        if (cands[0]) suggestion = { receiptId: cands[0].receiptId, label: label(cands[0].receiptId) };
      } else if (amount > 0) {
        const open = freeReceipts.find(
          (r) =>
            r.kind === "AUSLAGE" &&
            (r.reimbursementStatus === "OFFEN" || r.reimbursementStatus === "EINGEREICHT") &&
            Math.abs(Number(r.grossAmount) - amount) < 0.005 &&
            r.receiptDate <= t.bookingDate
        );
        if (open) suggestion = { receiptId: open.id, label: label(open.id) };
      }
    }
    return {
      id: t.id,
      date: formatDate(t.bookingDate),
      amount: Number(t.amount),
      amountLabel: formatEuro(Number(t.amount)),
      counterparty: t.counterparty,
      purpose: t.purpose,
      companyId: t.companyId,
      ignored: t.ignored,
      reviewed: t.reviewed,
      matched: t.matchedReceipt
        ? { id: t.matchedReceipt.id, label: t.matchedReceipt.receiptNumber ?? t.matchedReceipt.vendor }
        : null,
      suggestion,
    };
  });

  const statusTabs = [
    { key: "offen", label: "Offen", count: openCount },
    { key: "frei", label: "Freigegeben", count: txns.filter((t) => t.reviewed).length },
    { key: "alle", label: "Alle", count: txns.length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Buchungen</h2>
        <p className="mt-1 text-sm text-navy-400">
          Jede Kontobewegung zuordnen – Privat oder Firma, passenden Beleg bestätigen – und
          freigeben. Offene Buchungen bleiben sichtbar, bis sie abgehakt sind.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="card px-6 py-8 text-center text-sm text-navy-400">
          Noch keine Bankkonten.{" "}
          <Link href="/abgleich/konten" className="underline">Konto anlegen →</Link>
        </div>
      ) : (
        <>
          {/* Konto-Auswahl + Status-Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/abgleich/buchungen?konto=${a.id}&status=${status}`}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  a.id === accountId
                    ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                    : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                }`}
              >
                {a.name}
              </Link>
            ))}
            <span className="mx-1 hidden text-navy-200 sm:inline dark:text-navy-700">|</span>
            {statusTabs.map((t) => (
              <Link
                key={t.key}
                href={`/abgleich/buchungen?konto=${accountId}&status=${t.key}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                  status === t.key
                    ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                    : "border-navy-200 text-navy-500 hover:border-navy-400 dark:border-navy-700 dark:text-navy-300"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 text-xs ${status === t.key ? "bg-white/20" : "bg-navy-100 dark:bg-navy-800"}`}>
                  {t.count}
                </span>
              </Link>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="card px-6 py-10 text-center text-sm text-navy-400">
              {status === "offen" ? "Alles freigegeben. 🎉" : "Keine Buchungen in dieser Ansicht."}
            </div>
          ) : (
            <div className="card divide-y divide-navy-100 dark:divide-navy-800">
              {rows.map((r) => (
                <BookingRow key={r.id} txn={r} companies={companies} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
