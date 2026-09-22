"use client";

// Löschen mit Anlauf: erst fragen, was mitgeht, dann löschen. Wo es
// endgültig wird (Unterschriften, Einteilungen), muss zusätzlich ein Wort
// getippt werden – Einsatznummer oder Nachname.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "./actions";

export function DeleteButton({
  label,
  frage,
  mitgeht,
  bestaetigungWort,
  gesperrtGrund,
  onDelete,
  weiterNach,
  testId,
}: {
  label: string;
  frage: string;
  // Was das Löschen mitnimmt – in Klartext, bevor jemand zustimmt
  mitgeht: string[];
  // null = ohne Eintippen; sonst muss genau dieses Wort getippt werden
  bestaetigungWort: string | null;
  // gesetzt = Löschen geht nicht, der Knopf erklärt nur warum
  gesperrtGrund: string | null;
  onDelete: (bestaetigung: string | null) => Promise<ActionResult>;
  weiterNach?: string;
  testId: string;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [wort, setWort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (gesperrtGrund) {
    return (
      <span className="text-xs text-navy-400" title={gesperrtGrund} data-testid={`${testId}-gesperrt`}>
        {gesperrtGrund}
      </span>
    );
  }

  if (!offen) {
    return (
      <button
        type="button"
        className="btn-secondary text-xs text-red-700 hover:border-red-300 dark:text-red-300"
        onClick={() => setOffen(true)}
        data-testid={testId}
      >
        {label}
      </button>
    );
  }

  const bereit = bestaetigungWort === null || wort.trim().toLowerCase() === bestaetigungWort.trim().toLowerCase();

  return (
    <div className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950" data-testid={`${testId}-dialog`}>
      <p className="text-sm font-medium text-red-800 dark:text-red-200">{frage}</p>
      {mitgeht.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700 dark:text-red-300">
          {mitgeht.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-red-700 dark:text-red-300">
        Das lässt sich nicht rückgängig machen. Was gelöscht wurde, steht mit allen Daten im Protokoll.
      </p>
      {bestaetigungWort !== null ? (
        <div>
          <label className="label text-red-800 dark:text-red-200" htmlFor={`${testId}-wort`}>
            Zur Bestätigung „{bestaetigungWort}“ eintippen
          </label>
          <input id={`${testId}-wort`} className="input" value={wort} onChange={(e) => setWort(e.target.value)} autoComplete="off" data-testid={`${testId}-wort`} />
        </div>
      ) : null}
      {fehler ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {fehler}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-xs text-red-700 hover:border-red-300 disabled:opacity-50 dark:text-red-300"
          disabled={laeuft || !bereit}
          data-testid={`${testId}-ja`}
          onClick={() =>
            starte(async () => {
              setFehler(null);
              const res = await onDelete(bestaetigungWort === null ? null : wort.trim());
              if (!res.ok) return setFehler(res.error);
              setOffen(false);
              if (weiterNach) router.push(weiterNach);
              router.refresh();
            })
          }
        >
          {laeuft ? "Löscht …" : "Endgültig löschen"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => {
            setOffen(false);
            setWort("");
            setFehler(null);
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
