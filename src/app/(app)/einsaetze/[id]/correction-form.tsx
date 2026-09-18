"use client";

// Dispo-Korrektur eines signierten Eintrags: erzeugt eine neue Version mit
// Pflicht-Begründung; die alte Version bleibt unverändert und protokolliert.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctEntryAction } from "../actions";

type EntryInput = {
  id: string;
  startDatum: string;
  start: string;
  endeDatum: string;
  ende: string;
  pauseMinuten: number;
  taetigkeit: string;
  notiz: string;
  pkw: boolean;
  pkwArt: "PRIVAT" | "FIRMA" | null;
  spesen: boolean;
  spesenBetrag: number | null;
  review: string;
};

export function CorrectionForm({ entry, name }: { entry: EntryInput; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ ...entry, grund: "", spesenBetrag: entry.spesenBetrag === null ? "" : String(entry.spesenBetrag) });

  if (entry.review === "FREIGEGEBEN") return <span className="text-xs text-navy-400">freigegeben – keine Korrektur</span>;
  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        Korrigieren
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40 md:col-span-4">
      <p className="mb-2 font-semibold">Korrektur für {name} (neue Version, Grund wird protokolliert)</p>
      <div className="grid gap-2 md:grid-cols-6">
        <input type="date" className="input" value={f.startDatum} onChange={(e) => setF({ ...f, startDatum: e.target.value })} />
        <input type="time" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" className="input" value={f.endeDatum} onChange={(e) => setF({ ...f, endeDatum: e.target.value })} />
        <input type="time" className="input" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} />
        <input type="number" className="input" value={f.pauseMinuten} min={0} onChange={(e) => setF({ ...f, pauseMinuten: Number(e.target.value) })} placeholder="Pause min" />
        <input className="input" value={f.taetigkeit} onChange={(e) => setF({ ...f, taetigkeit: e.target.value })} placeholder="Tätigkeit" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.pkw} onChange={(e) => setF({ ...f, pkw: e.target.checked })} /> PKW
        </label>
        <select className="input" value={f.pkwArt ?? ""} disabled={!f.pkw} onChange={(e) => setF({ ...f, pkwArt: (e.target.value || null) as "PRIVAT" | "FIRMA" | null })}>
          <option value="">Art</option>
          <option value="PRIVAT">privat</option>
          <option value="FIRMA">Firma</option>
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.spesen} onChange={(e) => setF({ ...f, spesen: e.target.checked })} /> Spesen
        </label>
        <input className="input" value={f.spesenBetrag} disabled={!f.spesen} onChange={(e) => setF({ ...f, spesenBetrag: e.target.value })} placeholder="Spesen €" />
        <input className="input md:col-span-2" value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} placeholder="Notiz" />
        <input className="input md:col-span-4" value={f.grund} onChange={(e) => setF({ ...f, grund: e.target.value })} placeholder="Grund der Korrektur (Pflicht)" />
        <div className="flex gap-2 md:col-span-2">
          <button
            type="button"
            className="btn-accent"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await correctEntryAction(entry.id, {
                  startDatum: f.startDatum,
                  start: f.start,
                  endeDatum: f.endeDatum,
                  ende: f.ende,
                  pauseMinuten: f.pauseMinuten,
                  taetigkeit: f.taetigkeit,
                  notiz: f.notiz,
                  pkw: f.pkw,
                  pkwArt: f.pkw ? f.pkwArt : null,
                  spesen: f.spesen,
                  spesenBetrag: f.spesen && f.spesenBetrag ? Number(String(f.spesenBetrag).replace(",", ".")) : null,
                  korrekturGrund: f.grund,
                });
                if (res.ok) {
                  setOpen(false);
                  router.refresh();
                } else setError(res.error);
              })
            }
          >
            {pending ? "Speichern …" : "Korrektur speichern"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-red-600">{error}</p> : null}
    </div>
  );
}
