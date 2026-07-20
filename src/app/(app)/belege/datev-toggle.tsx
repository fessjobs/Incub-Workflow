"use client";

import { useState } from "react";
import { setDatevUploaded } from "./actions";

// Ein-Klick-Haken "in DATEV hochgeladen" in der Belegliste.
// Optimistisch: sofort umschalten, bei Fehler zurückrollen.
export function DatevToggle({ receiptId, uploadedAt }: { receiptId: string; uploadedAt: string | null }) {
  const [uploaded, setUploaded] = useState(Boolean(uploadedAt));
  const [date, setDate] = useState(uploadedAt);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !uploaded;
    setBusy(true);
    setUploaded(next);
    setDate(next ? new Date().toISOString() : null);
    const res = await setDatevUploaded(receiptId, next);
    if (!res.ok) {
      setUploaded(!next);
      setDate(uploadedAt);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={
        uploaded
          ? `In DATEV hochgeladen${date ? ` am ${new Date(date).toLocaleDateString("de-DE")}` : ""} – Klick zum Zurücksetzen`
          : "Als „in DATEV hochgeladen“ markieren"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        uploaded
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-navy-200 text-navy-400 hover:border-navy-400 hover:text-navy-600 dark:border-navy-700 dark:hover:border-navy-500"
      }`}
    >
      {uploaded ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          DATEV
        </>
      ) : (
        <>DATEV?</>
      )}
    </button>
  );
}
