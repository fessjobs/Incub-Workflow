"use client";

// Zeigt der Dispo, welche Ist-Zeiten die Crew für eine Schicht übernommen hat
// – und lässt sie zurücknehmen, falls sie nicht passen.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearZeitvorgabeAction } from "../actions";

export function Zeitvorgabe({ shiftId, start, ende, pauseMinuten, von }: { shiftId: string; start: string; ende: string; pauseMinuten: number; von: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();

  return (
    <p className="text-xs text-navy-500" data-testid={`vorgabe-${shiftId}`}>
      <span className="badge-accent mr-2">Zeiten übernommen</span>
      {start}–{ende} · Pause {pauseMinuten} min · von {von} · bei allen offenen Erfassungen vorausgefüllt{" "}
      <button
        type="button"
        className="ml-1 text-navy-400 underline hover:text-navy-600 disabled:opacity-50"
        disabled={laeuft}
        data-testid={`vorgabe-loeschen-${shiftId}`}
        onClick={() =>
          starte(async () => {
            await clearZeitvorgabeAction(shiftId);
            router.refresh();
          })
        }
      >
        {laeuft ? "nimmt zurück …" : "zurücknehmen"}
      </button>
    </p>
  );
}
