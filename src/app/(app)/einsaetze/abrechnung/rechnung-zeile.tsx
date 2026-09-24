"use client";

// Rechnungsnummer direkt aus der Liste heraus eintragen – die Buchhaltung
// arbeitet den Korb „Freigegeben" von oben nach unten ab, ohne jeden Einsatz
// einzeln öffnen zu müssen.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceAction } from "../actions";

export function RechnungZeile({ assignmentId, einsatznummer }: { assignmentId: string; einsatznummer: string }) {
  const router = useRouter();
  const [nummer, setNummer] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`rechnung-${einsatznummer}`}>
      <input
        className="input w-40 text-xs"
        value={nummer}
        onChange={(e) => setNummer(e.target.value)}
        maxLength={60}
        placeholder="Rechnungsnummer"
        aria-label={`Rechnungsnummer für Einsatz ${einsatznummer}`}
        data-testid={`rechnungsnummer-${einsatznummer}`}
      />
      <button
        type="button"
        className="btn-accent text-xs"
        disabled={laeuft || nummer.trim() === ""}
        data-testid={`rechnung-setzen-${einsatznummer}`}
        onClick={() =>
          starte(async () => {
            setFehler(null);
            const res = await setInvoiceAction(assignmentId, { rechnungsnummer: nummer });
            if (!res.ok) return setFehler(res.error);
            router.refresh();
          })
        }
      >
        {laeuft ? "…" : "Geschrieben"}
      </button>
      {fehler ? (
        <p className="w-full text-xs text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
