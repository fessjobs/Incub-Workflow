"use client";

// Kästchen „Stunden in zvoove“: einfach abhaken, wenn die Stunden übertragen sind.
import { useState, useTransition } from "react";
import { setzeZvooveAction } from "./zvoove-actions";

export function ZvooveHaken({ assignmentId, erledigt, info, einsatznummer, mobil = false }: { assignmentId: string; erledigt: boolean; info: string | null; einsatznummer: string; mobil?: boolean }) {
  const [an, setAn] = useState(erledigt);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2" title={an && info ? info : fehler ?? undefined}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={an}
        disabled={pending}
        aria-label={`Stunden von ${einsatznummer} in zvoove`}
        data-testid={`zvoove-${mobil ? "m-" : ""}${assignmentId}`}
        onChange={(e) => {
          const neu = e.target.checked;
          setAn(neu);
          setFehler(null);
          start(async () => {
            const r = await setzeZvooveAction({ assignmentId, erledigt: neu });
            if (!r.ok) {
              setAn(!neu);
              setFehler(r.error);
            }
          });
        }}
      />
      {fehler ? <span className="text-xs text-red-600">{fehler}</span> : an ? <span className="text-xs text-emerald-600">erledigt</span> : null}
    </label>
  );
}
