"use client";

// Einsatz nachträglich ändern: Kopfdaten und Schichtzeiten. Beides ist offen,
// solange der Kunde nicht bestätigt hat und keine Zeiten freigegeben sind –
// bis dahin ist der Einsatz ein Entwurf, den die Dispo anpassen darf.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssignmentAction, updateShiftAction } from "../actions";

type Kunde = { id: string; name: string };

function Hinweis({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{text}</p>;
}

export function EditKopf({
  assignmentId,
  kunden,
  werte,
  gesperrt,
}: {
  assignmentId: string;
  kunden: Kunde[];
  werte: { projekt: string; artist: string; customerId: string; einsatzort: string; einsatzbereich: string; aueVertragRef: string; bundesland: string; notizen: string };
  gesperrt: string | null;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [f, setF] = useState(werte);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const setz = (k: keyof typeof werte) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (gesperrt) {
    return (
      <p className="text-xs text-navy-400" data-testid="kopf-gesperrt">
        {gesperrt}
      </p>
    );
  }
  if (!offen) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOffen(true)} data-testid="kopf-bearbeiten">
        Einsatz bearbeiten
      </button>
    );
  }

  return (
    <div className="card w-full space-y-3 p-4" data-testid="kopf-formular">
      <p className="eyebrow">Einsatz bearbeiten</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="e-projekt">Projekt</label>
          <input id="e-projekt" className="input-accent" value={f.projekt} onChange={setz("projekt")} data-testid="e-projekt" />
        </div>
        <div>
          <label className="label" htmlFor="e-artist">Artist (optional)</label>
          <input id="e-artist" className="input-accent" value={f.artist} onChange={setz("artist")} />
        </div>
        <div>
          <label className="label" htmlFor="e-kunde">Kunde</label>
          <select id="e-kunde" className="input-accent" value={f.customerId} onChange={setz("customerId")} data-testid="e-kunde">
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-ort">Einsatzort</label>
          <input id="e-ort" className="input-accent" value={f.einsatzort} onChange={setz("einsatzort")} data-testid="e-ort" />
        </div>
        <div>
          <label className="label" htmlFor="e-bereich">Einsatzbereich (optional)</label>
          <input id="e-bereich" className="input-accent" value={f.einsatzbereich} onChange={setz("einsatzbereich")} />
        </div>
        <div>
          <label className="label" htmlFor="e-auev">AÜ-Vertrag (optional)</label>
          <input id="e-auev" className="input-accent" value={f.aueVertragRef} onChange={setz("aueVertragRef")} />
        </div>
        <div>
          <label className="label" htmlFor="e-bl">Bundesland für Feiertage</label>
          <input id="e-bl" className="input-accent" value={f.bundesland} onChange={setz("bundesland")} placeholder="BW" maxLength={2} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="e-notiz">Notizen (optional)</label>
        <textarea id="e-notiz" className="input-accent min-h-[70px]" value={f.notizen} onChange={setz("notizen")} />
      </div>
      {fehler ? (
        <p className="text-sm text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-sm"
          disabled={laeuft}
          data-testid="kopf-speichern"
          onClick={() =>
            starte(async () => {
              setFehler(null);
              const res = await updateAssignmentAction(assignmentId, f);
              if (!res.ok) return setFehler(res.error);
              setOffen(false);
              router.refresh();
            })
          }
        >
          {laeuft ? "Speichert …" : "Änderungen speichern"}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={() => { setOffen(false); setF(werte); setFehler(null); }}>
          Abbrechen
        </button>
      </div>
      <Hinweis text="Nach einer Änderung die Konkretisierung neu erzeugen, damit das PDF dem Einsatz entspricht." />
    </div>
  );
}

export function EditSchicht({
  shiftId,
  werte,
  gesperrt,
}: {
  shiftId: string;
  werte: { bezeichnung: string; taetigkeit: string; datum: string; start: string; endeDatum: string; ende: string; treffpunkt: string; anzahlSoll: string; garantieStunden: string };
  gesperrt: string | null;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [f, setF] = useState(werte);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const setz = (k: keyof typeof werte) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (!offen) {
    return gesperrt ? null : (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOffen(true)} data-testid={`schicht-bearbeiten-${shiftId}`}>
        Schicht bearbeiten
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-navy-200 bg-navy-50 p-3 dark:border-navy-700 dark:bg-navy-800" data-testid={`schicht-formular-${shiftId}`}>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">Bezeichnung</label>
          <input className="input-accent" value={f.bezeichnung} onChange={setz("bezeichnung")} data-testid={`s-bezeichnung-${shiftId}`} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Tätigkeit</label>
          <input className="input-accent" value={f.taetigkeit} onChange={setz("taetigkeit")} />
        </div>
        <div>
          <label className="label">Beginn (Datum)</label>
          <input type="date" className="input-accent" value={f.datum} onChange={setz("datum")} />
        </div>
        <div>
          <label className="label">Beginn (Zeit)</label>
          <input type="time" className="input-accent" value={f.start} onChange={setz("start")} data-testid={`s-start-${shiftId}`} />
        </div>
        <div>
          <label className="label">Ende (Datum)</label>
          <input type="date" className="input-accent" value={f.endeDatum} onChange={setz("endeDatum")} />
        </div>
        <div>
          <label className="label">Ende (Zeit)</label>
          <input type="time" className="input-accent" value={f.ende} onChange={setz("ende")} data-testid={`s-ende-${shiftId}`} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Treffpunkt (optional)</label>
          <input className="input-accent" value={f.treffpunkt} onChange={setz("treffpunkt")} />
        </div>
        <div>
          <label className="label">Soll-Anzahl</label>
          <input className="input-accent" value={f.anzahlSoll} onChange={setz("anzahlSoll")} inputMode="numeric" />
        </div>
        <div>
          <label className="label">Garantie (h)</label>
          <input className="input-accent" value={f.garantieStunden} onChange={setz("garantieStunden")} inputMode="decimal" />
        </div>
      </div>
      {fehler ? (
        <p className="text-sm text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-xs"
          disabled={laeuft}
          data-testid={`schicht-speichern-${shiftId}`}
          onClick={() =>
            starte(async () => {
              setFehler(null);
              const zahl = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
              const res = await updateShiftAction(shiftId, {
                bezeichnung: f.bezeichnung,
                taetigkeit: f.taetigkeit,
                datum: f.datum,
                start: f.start,
                endeDatum: f.endeDatum,
                ende: f.ende,
                treffpunkt: f.treffpunkt,
                anzahlSoll: zahl(f.anzahlSoll),
                garantieStunden: zahl(f.garantieStunden),
              });
              if (!res.ok) return setFehler(res.error);
              setOffen(false);
              router.refresh();
            })
          }
        >
          {laeuft ? "Speichert …" : "Schicht speichern"}
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => { setOffen(false); setF(werte); setFehler(null); }}>
          Abbrechen
        </button>
      </div>
      <p className="text-xs text-navy-400">Die Planzeiten der eingeteilten Personen ziehen mit – außer bei denen, die schon unterschrieben haben.</p>
    </div>
  );
}
