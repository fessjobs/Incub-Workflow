"use client";

// Stundennachweis für eine einzelne Schicht neu erzeugen – etwa nach einer
// Korrektur. Der Kunde erzeugt ihn mit seiner Unterschrift von selbst.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateStundennachweisAction } from "../actions";

export function SchichtNachweis({ assignmentId, shiftId, bezeichnung }: { assignmentId: string; shiftId: string; bezeichnung: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={laeuft}
        title={`Stundennachweis nur für „${bezeichnung}“`}
        data-testid={`schicht-nachweis-${shiftId}`}
        onClick={() =>
          starte(async () => {
            const res = await generateStundennachweisAction(assignmentId, shiftId);
            setMeldung(res.ok ? (res.message ?? "Erzeugt.") : res.error);
            router.refresh();
          })
        }
      >
        {laeuft ? "erzeugt …" : "Stundennachweis dieser Schicht"}
      </button>
      {meldung ? <span className="text-xs text-navy-400">{meldung}</span> : null}
    </span>
  );
}
