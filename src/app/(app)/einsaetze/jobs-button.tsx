"use client";

import { useState, useTransition } from "react";
import { runJobsAction } from "./actions";

// Manueller Anstoß der Job-Queue (Links versenden, PDFs) – der Worker läuft
// zusätzlich automatisch im Server.
export function JobsButton({ offen, fehler }: { offen: number; fehler: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg ? <span className="text-xs text-navy-400">{msg}</span> : null}
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runJobsAction();
            setMsg(r.ok ? r.message ?? "Erledigt." : r.error);
          })
        }
        title="Fällige Jobs (Link-Versand, PDFs) jetzt verarbeiten"
      >
        {pending ? "Läuft …" : `Jobs (${offen} offen${fehler ? `, ${fehler} Fehler` : ""})`}
      </button>
    </div>
  );
}
