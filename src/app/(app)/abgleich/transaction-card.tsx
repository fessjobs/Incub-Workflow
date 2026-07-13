"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmMatch, setIgnored, setTransactionCompany } from "./actions";

type Suggestion = { id: string; label: string };
type Company = { id: string; brandName: string };

export function TransactionCard({
  txn,
  companies,
  suggestions,
}: {
  txn: {
    id: string;
    account: string;
    bookingDate: string;
    amount: string;
    counterparty: string | null;
    purpose: string | null;
    companyId: string | null;
  };
  companies: Company[];
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(txn.companyId);

  async function match(receiptId: string) {
    setBusy(true);
    await confirmMatch(txn.id, receiptId);
    router.refresh();
  }
  async function ignore() {
    setBusy(true);
    await setIgnored(txn.id, true, remember);
    router.refresh();
  }
  async function pickCompany(id: string | null) {
    const next = id === companyId ? null : id;
    setCompanyId(next);
    setBusy(true);
    await setTransactionCompany(txn.id, next);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{txn.amount}</span>
            <span className="text-xs text-navy-400">{txn.bookingDate}</span>
            <span className="text-xs text-navy-400">· {txn.account}</span>
          </div>
          <p className="mt-1 truncate text-sm font-medium">{txn.counterparty || "—"}</p>
          {txn.purpose && <p className="truncate text-xs text-navy-400">{txn.purpose}</p>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-navy-400">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 rounded accent-navy-900" />
            merken
          </label>
          <button type="button" disabled={busy} className="btn-secondary !px-3 !py-1.5" onClick={ignore}>
            Ignorieren
          </button>
        </div>
      </div>

      {/* Für welche Firma war diese Ausgabe? */}
      {companies.length > 0 && (
        <div className="mt-3 border-t border-navy-100 pt-3 dark:border-navy-800">
          <p className="mb-1.5 text-xs text-navy-400">Ausgabe für Firma:</p>
          <div className="flex flex-wrap gap-1.5">
            {companies.map((c) => {
              const selected = c.id === companyId;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pickCompany(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    selected
                      ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                      : "border-navy-200 text-navy-500 hover:border-navy-400 dark:border-navy-700 dark:text-navy-300"
                  }`}
                >
                  {c.brandName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-navy-100 pt-3 dark:border-navy-800">
          <p className="text-xs text-navy-400">Passende Belege:</p>
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{s.label}</span>
              <button type="button" disabled={busy} className="btn-primary !px-3 !py-1.5" onClick={() => match(s.id)}>
                Zuordnen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
