"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkPaymentMatch, linkPayment, type PaymentMatch } from "../actions";

// "Passt eine Kontobewegung zu diesem Beleg?" – jederzeit auch im Nachhinein
// prüfbar; verknüpft Beleg und Zahlung mit einem Klick.
export function PaymentCheck({ receiptId, alreadyLinked }: { receiptId: string; alreadyLinked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<PaymentMatch[] | null>(null);
  const [linked, setLinked] = useState(alreadyLinked);

  async function check() {
    setBusy(true);
    const res = await checkPaymentMatch(receiptId);
    setMatches(res.matches);
    setBusy(false);
  }

  async function link(transactionId: string) {
    setBusy(true);
    const res = await linkPayment(receiptId, transactionId);
    setBusy(false);
    if (res.ok) {
      setLinked(true);
      setMatches(null);
      router.refresh();
    }
  }

  return (
    <div className="card p-4">
      <p className="eyebrow mb-3">Zahlungs-Check</p>
      {linked ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <span>✓</span> Mit einer Kontobewegung verknüpft.
        </p>
      ) : (
        <>
          <button type="button" disabled={busy} className="btn-secondary w-full justify-center" onClick={check}>
            {busy ? "Prüfe …" : "Passt eine Zahlung?"}
          </button>
          {matches !== null && matches.length === 0 && (
            <p className="mt-2 text-xs text-navy-400">
              Keine passende Kontobewegung gefunden. Nach dem nächsten Auszug-Import einfach erneut prüfen.
            </p>
          )}
          {matches !== null && matches.length > 0 && (
            <div className="mt-3 space-y-2">
              {matches.map((m) => (
                <div key={m.transactionId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">{m.label}</span>
                  <button type="button" disabled={busy} className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => link(m.transactionId)}>
                    Verknüpfen
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
