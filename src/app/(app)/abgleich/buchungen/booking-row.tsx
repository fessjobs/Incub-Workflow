"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  setTransactionCompany,
  setTransactionReviewed,
  confirmMatch,
  unmatch,
  setIgnored,
} from "../actions";

type Company = { id: string; brandName: string; isPrivate: boolean };

type Txn = {
  id: string;
  date: string;
  amount: number;
  amountLabel: string;
  counterparty: string | null;
  purpose: string | null;
  companyId: string | null;
  ignored: boolean;
  reviewed: boolean;
  matched: { id: string; label: string } | null;
  suggestion: { receiptId: string; label: string } | null;
};

export function BookingRow({ txn, companies }: { txn: Txn; companies: Company[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${txn.reviewed ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""} ${txn.ignored ? "opacity-45" : ""}`}>
      {/* Datum + Gegenpartei */}
      <div className="min-w-0 flex-1 basis-52">
        <div className="flex items-center gap-2">
          <span className={`font-medium tabular-nums ${txn.amount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {txn.amountLabel}
          </span>
          <span className="text-xs text-navy-400">{txn.date}</span>
          {txn.ignored && <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">ignoriert</span>}
        </div>
        <p className="truncate text-sm">{txn.counterparty || txn.purpose || "—"}</p>
        {txn.counterparty && txn.purpose && (
          <p className="truncate text-xs text-navy-400">{txn.purpose}</p>
        )}
      </div>

      {/* Privat / Firma */}
      <select
        className="input !w-auto max-w-[11rem] !py-1.5 text-sm"
        value={txn.companyId ?? ""}
        disabled={busy}
        onChange={(e) => run(() => setTransactionCompany(txn.id, e.target.value || null))}
      >
        <option value="">– Privat/Firma? –</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.isPrivate ? "Privat" : c.brandName}
          </option>
        ))}
      </select>

      {/* Beleg */}
      <div className="min-w-0 flex-1 basis-56">
        {txn.matched ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
            <Link href={`/belege/${txn.matched.id}`} className="truncate font-mono text-xs hover:underline">
              {txn.matched.label}
            </Link>
            <button type="button" disabled={busy} className="text-xs text-navy-400 underline" onClick={() => run(() => unmatch(txn.id))}>
              lösen
            </button>
          </div>
        ) : txn.suggestion ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-xs text-navy-500 dark:text-navy-300" title={txn.suggestion.label}>
              {txn.suggestion.label}
            </span>
            <button
              type="button"
              disabled={busy}
              className="btn-primary !px-2.5 !py-1 text-xs"
              onClick={() => run(() => confirmMatch(txn.id, txn.suggestion!.receiptId))}
            >
              Zuordnen
            </button>
          </div>
        ) : (
          <span className="text-xs text-navy-300 dark:text-navy-600">kein Beleg-Vorschlag</span>
        )}
      </div>

      {/* Ignorieren + Freigabe */}
      <div className="flex items-center gap-2">
        {!txn.reviewed && (
          <button
            type="button"
            disabled={busy}
            title={txn.ignored ? "Nicht mehr ignorieren" : "Beleglos (z. B. Miete) – ignorieren"}
            className="btn-secondary !px-2.5 !py-1.5 text-xs"
            onClick={() => run(() => setIgnored(txn.id, !txn.ignored, false))}
          >
            {txn.ignored ? "aufheben" : "ignorieren"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setTransactionReviewed(txn.id, !txn.reviewed))}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
            txn.reviewed
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-navy-200 hover:border-emerald-500 dark:border-navy-700"
          }`}
          title={txn.reviewed ? "Freigabe zurücknehmen" : "Buchung freigeben"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {txn.reviewed ? "Freigegeben" : "Freigeben"}
        </button>
      </div>
    </div>
  );
}
