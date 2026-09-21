"use client";

// Namen einer eingeteilten Person richtigstellen. Geht auch noch, wenn der
// Kunde bestätigt hat – Namen ändern sich, und auf dem Nachweis muss der
// richtige stehen. Jede Änderung steht im Audit-Log; danach die Dokumente
// neu erzeugen.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renamePersonAction } from "../actions";

export function RenamePerson({ shiftAssignmentId, vorname, nachname, unterschrieben }: { shiftAssignmentId: string; vorname: string; nachname: string; unterschrieben: boolean }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [v, setV] = useState(vorname);
  const [n, setN] = useState(nachname);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (!offen) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOffen(true)} data-testid={`rename-open-${shiftAssignmentId}`}>
        Name ändern
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-navy-200 bg-navy-50 p-3 dark:border-navy-700 dark:bg-navy-800">
      {unterschrieben ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Diese Person hat bereits unterschrieben. Der neue Name erscheint erst auf einem neu erzeugten Stundennachweis – die bisherige Fassung bleibt mit ihrer Prüfsumme im Protokoll.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input className="input-accent w-40" value={v} onChange={(e) => setV(e.target.value)} placeholder="Vorname" aria-label="Vorname" data-testid={`rename-vorname-${shiftAssignmentId}`} />
        <input className="input-accent w-40" value={n} onChange={(e) => setN(e.target.value)} placeholder="Nachname" aria-label="Nachname" data-testid={`rename-nachname-${shiftAssignmentId}`} />
      </div>
      {fehler ? (
        <p className="text-xs text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-xs"
          disabled={laeuft}
          data-testid={`rename-save-${shiftAssignmentId}`}
          onClick={() =>
            starte(async () => {
              setFehler(null);
              const res = await renamePersonAction(shiftAssignmentId, { vorname: v.trim(), nachname: n.trim() });
              if (!res.ok) return setFehler(res.error);
              setOffen(false);
              router.refresh();
            })
          }
        >
          {laeuft ? "Speichert …" : "Übernehmen"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => {
            setOffen(false);
            setV(vorname);
            setN(nachname);
            setFehler(null);
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
