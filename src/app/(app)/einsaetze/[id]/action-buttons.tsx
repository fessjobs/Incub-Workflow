"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateKonkretisierungAction, generateStundennachweisAction, renewTokensAction, scheduleLinksAction, setStatusAction, type ActionResult } from "../actions";

export function ActionButtons({ assignmentId, status, dispo }: { assignmentId: string; status: string; dispo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; documentId?: string } | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Erledigt.", documentId: r.documentId } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {dispo ? (
          <>
            <button type="button" className="btn-accent" disabled={pending} onClick={() => run(() => generateKonkretisierungAction(assignmentId))} data-testid="konkretisierung-button">
              Konkretisierung erzeugen
            </button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => scheduleLinksAction(assignmentId, false))}>
              Links planen (24 h vorher)
            </button>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => scheduleLinksAction(assignmentId, true))}>
              Links jetzt versenden
            </button>
          </>
        ) : null}
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => generateStundennachweisAction(assignmentId))} data-testid="stundennachweis-button">
          Stundennachweis erzeugen
        </button>
        {dispo ? (
          <>
            {status !== "ABGESCHLOSSEN" && status !== "ABGERECHNET" ? (
              <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => setStatusAction(assignmentId, "ABGESCHLOSSEN"))}>
                Abschließen
              </button>
            ) : null}
            {status === "ABGESCHLOSSEN" ? (
              <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => setStatusAction(assignmentId, "ABGERECHNET"))}>
                Als abgerechnet markieren
              </button>
            ) : null}
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => renewTokensAction(assignmentId))} title="Neue Links für alle, die noch nicht unterschrieben haben">
              Links erneuern
            </button>
          </>
        ) : null}
      </div>
      {msg ? (
        <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {msg.text}
          {msg.documentId ? (
            <>
              {" "}
              <a href={`/api/documents/${msg.documentId}`} target="_blank" rel="noreferrer" className="underline" data-testid="pdf-link">
                PDF öffnen
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {pending ? <p className="text-xs text-navy-400">Wird ausgeführt …</p> : null}
    </div>
  );
}
