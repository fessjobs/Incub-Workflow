"use client";

// Freigabe-Steuerung für Mitarbeiter-Link-Belege: Status-Badge, Freigeben,
// Ablehnen mit Kommentarfeld (Kommentar sieht der Mitarbeiter im Belegtool).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewEmployeeReceipt } from "./actions";

export function EmployeeReview({
  receiptId,
  status,
  comment,
  isAdmin,
  compact = false,
}: {
  receiptId: string;
  status: "AUSSTEHEND" | "FREIGEGEBEN" | "ABGELEHNT" | null;
  comment: string | null;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [text, setText] = useState(comment ?? "");

  async function decide(decision: "FREIGEGEBEN" | "ABGELEHNT") {
    setBusy(true);
    await reviewEmployeeReceipt(receiptId, decision, decision === "ABGELEHNT" ? text : undefined);
    setBusy(false);
    setRejecting(false);
    router.refresh();
  }

  const badge =
    status === "FREIGEGEBEN" ? (
      <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">✓ freigegeben</span>
    ) : status === "ABGELEHNT" ? (
      <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" title={comment ?? undefined}>
        ✕ abgelehnt
      </span>
    ) : (
      <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">wartet auf Freigabe</span>
    );

  if (!isAdmin) return badge;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {badge}
        {status !== "FREIGEGEBEN" && (
          <button type="button" disabled={busy} className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => decide("FREIGEGEBEN")}>
            Freigeben
          </button>
        )}
        {status !== "ABGELEHNT" && !rejecting && (
          <button type="button" disabled={busy} className="btn-secondary !px-2.5 !py-1 text-xs !text-red-600" onClick={() => setRejecting(true)}>
            Ablehnen…
          </button>
        )}
      </div>
      {status === "ABGELEHNT" && comment && !rejecting && (
        <p className="text-xs text-red-600 dark:text-red-400">Kommentar: {comment}</p>
      )}
      {rejecting && (
        <div className="space-y-1.5">
          <textarea
            className="input min-h-16 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kommentar für den Mitarbeiter, z. B. 'Beleg unscharf – bitte neu fotografieren' (wird im Belegtool angezeigt)"
          />
          <div className="flex gap-1.5">
            <button type="button" disabled={busy} className="btn-secondary !px-2.5 !py-1 text-xs !text-red-600" onClick={() => decide("ABGELEHNT")}>
              {busy ? "…" : "Ablehnen bestätigen"}
            </button>
            <button type="button" className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setRejecting(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
