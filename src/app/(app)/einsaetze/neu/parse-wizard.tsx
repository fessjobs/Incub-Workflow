"use client";

// Rohtext → Vorschau (editierbare Tabelle mit Namens-Zuordnung, Hinweisen,
// Konflikten) → Speichern (+ Konkretisierungs-PDF).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Conflict } from "@/lib/einsatz/conflicts";
import { createAssignmentAction } from "../actions";

type Customer = { id: string; name: string; standardEinsatzort: string | null; aueVertragRef: string | null; bundesland: string | null };
type Employee = { id: string; name: string; personalnummer: string | null };
type Candidate = { employeeId: string; name: string; personalnummer: string | null; score: number; method: string };

type PreviewPerson = { name: string; rolle: "MITARBEITER" | "ANSPRECHPARTNER" | "SPARE"; employeeId: string | null; sicher: boolean; kandidaten: Candidate[]; neuAnlegen?: boolean };
type PreviewShift = {
  bezeichnung: string;
  taetigkeit: string;
  datum: string | null;
  start: string | null;
  endeDatum: string | null;
  ende: string | null;
  endeGeschaetzt: boolean;
  anzahlSoll: number | null;
  treffpunkt?: string;
  garantieStunden?: string;
  personen: PreviewPerson[];
};
type ParseResponse = {
  quelle: "claude" | "heuristik";
  fehler: string | null;
  kunde: string | null;
  customerId: string | null;
  projekt: string | null;
  artist: string | null;
  einsatzort: string | null;
  datum: string | null;
  schichten: PreviewShift[];
  hinweise: string[];
  konflikte: Conflict[];
  parsedJson: unknown;
  error?: string;
};

const SAMPLE = `Artist: Reezy
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn 18.09.2026:
Call 2 | 08:00 Uhr | 2x Hands
Mohammad Alhariri
Saad Mohammad Hassan
Frühschicht | 08:00 Uhr | 2x Cateringhilfen
Mohammad Salama Alsmman
Samira Gülhan
Load-Out | 21:30 Uhr | 4x Hands
Manitarun Sundaram
Mohammad Alhariri
Assurance Erhis
Ibrahim Bouriahi`;

export function ParseWizard({ customers, employees }: { customers: Customer[]; employees: Employee[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [kundeName, setKundeName] = useState("");
  const [projekt, setProjekt] = useState("");
  const [artist, setArtist] = useState("");
  const [einsatzort, setEinsatzort] = useState("");
  const [einsatzbereich, setEinsatzbereich] = useState("");
  const [aueRef, setAueRef] = useState("");
  const [notizen, setNotizen] = useState("");
  const [schichten, setSchichten] = useState<PreviewShift[]>([]);
  const [konflikte, setKonflikte] = useState<Conflict[]>([]);
  const [akzeptiert, setAkzeptiert] = useState(false);
  const [mitPdf, setMitPdf] = useState(true);
  const [saving, startSave] = useTransition();

  const employeeOptions = useMemo(() => employees, [employees]);

  const parse = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/assignments/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText: raw }) });
      const j = (await res.json()) as ParseResponse;
      if (!res.ok) {
        setError(j.error ?? `Fehler ${res.status}`);
        return;
      }
      setPreview(j);
      setCustomerId(j.customerId ?? "");
      setKundeName(j.customerId ? "" : j.kunde ?? "");
      setProjekt(j.projekt ?? j.artist ?? "");
      setArtist(j.artist ?? "");
      setEinsatzort(j.einsatzort ?? "");
      const c = customers.find((x) => x.id === j.customerId);
      setAueRef(c?.aueVertragRef ?? "");
      setSchichten(j.schichten.map((s) => ({ ...s, treffpunkt: "", garantieStunden: "" })));
      setKonflikte(j.konflikte);
      setAkzeptiert(false);
    } catch {
      setError("Auswertung fehlgeschlagen (Netzwerk).");
    } finally {
      setLoading(false);
    }
  };

  const updateShift = (i: number, patch: Partial<PreviewShift>) => setSchichten((l) => l.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const updatePerson = (i: number, j: number, patch: Partial<PreviewPerson>) =>
    setSchichten((l) => l.map((s, idx) => (idx === i ? { ...s, personen: s.personen.map((p, pj) => (pj === j ? { ...p, ...patch } : p)) } : s)));

  const unresolved = schichten.flatMap((s) => s.personen.filter((p) => !p.employeeId && !p.neuAnlegen).map((p) => p.name));
  const missingTimes = schichten.filter((s) => !s.datum || !s.start || !s.endeDatum || !s.ende).length;

  const save = () => {
    setError(null);
    startSave(async () => {
      const input = {
        customerId: customerId || null,
        kundeName: customerId ? null : kundeName || null,
        projekt,
        artist: artist || null,
        einsatzort,
        einsatzbereich: einsatzbereich || null,
        aueVertragRef: aueRef || null,
        notizen: notizen || null,
        rawInput: raw,
        parsedJson: preview?.parsedJson,
        konflikteAkzeptiert: akzeptiert,
        schichten: schichten.map((s) => ({
          bezeichnung: s.bezeichnung,
          taetigkeit: s.taetigkeit,
          datum: s.datum,
          start: s.start,
          endeDatum: s.endeDatum,
          ende: s.ende,
          treffpunkt: s.treffpunkt || null,
          anzahlSoll: s.anzahlSoll,
          garantieStunden: s.garantieStunden ? Number(String(s.garantieStunden).replace(",", ".")) : null,
          personen: s.personen.map((p) => ({ name: p.name, rolle: p.rolle, employeeId: p.employeeId, neuAnlegen: Boolean(p.neuAnlegen) })),
        })),
      };
      const res = await createAssignmentAction(input, { konkretisierung: mitPdf });
      if (res.ok) {
        router.push(`/einsaetze/${res.id}`);
      } else {
        setError(res.error);
        if (res.konflikte.length > 0) setKonflikte(res.konflikte);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <label className="label" htmlFor="raw">
            Rohtext (WhatsApp / Mail)
          </label>
          <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setRaw(SAMPLE)}>
            Beispiel einfügen
          </button>
        </div>
        <textarea id="raw" className="input-accent min-h-[220px] font-mono text-[13px]" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Artist: …\nLocation: …\nKunde: …\nArbeitsbeginn 18.09.2026:\nCall 2 | 08:00 Uhr | 2x Hands\nName …"} data-testid="raw-input" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-accent" onClick={parse} disabled={loading || raw.trim().length < 5} data-testid="parse-button">
            {loading ? "Wird ausgewertet …" : "Auswerten"}
          </button>
          {preview ? (
            <span className="text-xs text-navy-400">
              Quelle: {preview.quelle === "claude" ? "Claude" : "Heuristik"}
              {preview.fehler ? ` · ${preview.fehler}` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      ) : null}

      {preview ? (
        <>
          {preview.hinweise.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-semibold">Hinweise</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {preview.hinweise.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="card grid gap-4 p-5 md:grid-cols-3">
            <div className="md:col-span-3">
              <p className="eyebrow">Einsatz</p>
            </div>
            <div>
              <label className="label">Kunde (Entleiher)</label>
              <select className="input-accent" value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c?.aueVertragRef) setAueRef(c.aueVertragRef); }}>
                <option value="">{kundeName ? `Neu anlegen: ${kundeName}` : "– bitte wählen –"}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!customerId ? <input className="input-accent mt-2" placeholder="Neuer Kundenname" value={kundeName} onChange={(e) => setKundeName(e.target.value)} /> : null}
            </div>
            <div>
              <label className="label">Projekt</label>
              <input className="input-accent" value={projekt} onChange={(e) => setProjekt(e.target.value)} data-testid="projekt" />
            </div>
            <div>
              <label className="label">Artist</label>
              <input className="input-accent" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div>
              <label className="label">Einsatzort</label>
              <input className="input-accent" value={einsatzort} onChange={(e) => setEinsatzort(e.target.value)} />
            </div>
            <div>
              <label className="label">Einsatzbereich</label>
              <input className="input-accent" value={einsatzbereich} onChange={(e) => setEinsatzbereich(e.target.value)} placeholder="z. B. Veranstaltungstechnik" />
            </div>
            <div>
              <label className="label">AÜ-Vertrag (Referenz)</label>
              <input className="input-accent" value={aueRef} onChange={(e) => setAueRef(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className="label">Notizen (intern)</label>
              <input className="input-accent" value={notizen} onChange={(e) => setNotizen(e.target.value)} />
            </div>
          </div>

          {schichten.map((s, i) => (
            <div key={i} className="card p-5">
              <div className="grid gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <label className="label">Schicht</label>
                  <input className="input-accent" value={s.bezeichnung} onChange={(e) => updateShift(i, { bezeichnung: e.target.value })} />
                </div>
                <div>
                  <label className="label">Tätigkeit</label>
                  <input className="input-accent" value={s.taetigkeit} onChange={(e) => updateShift(i, { taetigkeit: e.target.value })} />
                </div>
                <div>
                  <label className="label">Soll</label>
                  <input className="input-accent" type="number" min={0} value={s.anzahlSoll ?? ""} onChange={(e) => updateShift(i, { anzahlSoll: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Datum</label>
                  <input className="input-accent" type="date" value={s.datum ?? ""} onChange={(e) => updateShift(i, { datum: e.target.value || null, endeDatum: s.endeDatum ?? e.target.value })} />
                </div>
                <div>
                  <label className="label">Beginn</label>
                  <input className="input-accent" type="time" value={s.start ?? ""} onChange={(e) => updateShift(i, { start: e.target.value || null })} />
                </div>
                <div>
                  <label className="label">Ende (Datum)</label>
                  <input className="input-accent" type="date" value={s.endeDatum ?? ""} onChange={(e) => updateShift(i, { endeDatum: e.target.value || null })} />
                </div>
                <div>
                  <label className="label">Ende{s.endeGeschaetzt ? " (geschätzt)" : ""}</label>
                  <input className={`input-accent ${s.endeGeschaetzt ? "border-amber-400" : ""}`} type="time" value={s.ende ?? ""} onChange={(e) => updateShift(i, { ende: e.target.value || null, endeGeschaetzt: false })} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Treffpunkt</label>
                  <input className="input-accent" value={s.treffpunkt ?? ""} onChange={(e) => updateShift(i, { treffpunkt: e.target.value })} />
                </div>
                <div>
                  <label className="label">Garantie (h)</label>
                  <input className="input-accent" inputMode="decimal" value={s.garantieStunden ?? ""} onChange={(e) => updateShift(i, { garantieStunden: e.target.value })} placeholder="Regel" />
                </div>
                <div className="flex items-end">
                  <button type="button" className="btn-danger" onClick={() => setSchichten((l) => l.filter((_, idx) => idx !== i))}>
                    Schicht entfernen
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-navy-400">
                    <tr>
                      <th className="py-1 pr-3">Name im Text</th>
                      <th className="py-1 pr-3">Zuordnung Mitarbeiterstamm</th>
                      <th className="py-1 pr-3">Rolle</th>
                      <th className="py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.personen.map((p, j) => (
                      <tr key={j} className="border-t border-navy-100 dark:border-navy-800">
                        <td className="py-2 pr-3">
                          <input className="input-accent" value={p.name} onChange={(e) => updatePerson(i, j, { name: e.target.value })} />
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            className={`input-accent ${!p.employeeId && !p.neuAnlegen ? "border-amber-400" : ""}`}
                            value={p.neuAnlegen ? "__neu" : p.employeeId ?? ""}
                            onChange={(e) => updatePerson(i, j, e.target.value === "__neu" ? { employeeId: null, neuAnlegen: true } : { employeeId: e.target.value || null, neuAnlegen: false })}
                            data-testid={`person-${i}-${j}`}
                          >
                            <option value="">– nicht zugeordnet –</option>
                            {p.kandidaten.filter((k) => k.method === "fuzzy").length > 0 ? (
                              <optgroup label="Vorschläge (bitte bestätigen)">
                                {p.kandidaten.map((k) => (
                                  <option key={k.employeeId} value={k.employeeId}>
                                    {k.name} · {Math.round(k.score * 100)} %{k.personalnummer ? ` · ${k.personalnummer}` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            <optgroup label="Alle Mitarbeiter">
                              {employeeOptions.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                  {e.personalnummer ? ` · ${e.personalnummer}` : ""}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__neu">+ Neu anlegen: {p.name}</option>
                          </select>
                          {p.sicher ? <span className="mt-1 block text-[11px] text-emerald-600">automatisch zugeordnet</span> : p.kandidaten.length > 0 && !p.employeeId ? <span className="mt-1 block text-[11px] text-amber-600">unsicherer Treffer – bitte bestätigen</span> : null}
                        </td>
                        <td className="py-2 pr-3">
                          <select className="input-accent" value={p.rolle} onChange={(e) => updatePerson(i, j, { rolle: e.target.value as PreviewPerson["rolle"] })}>
                            <option value="MITARBEITER">Mitarbeiter</option>
                            <option value="ANSPRECHPARTNER">Ansprechpartner</option>
                            <option value="SPARE">Spare</option>
                          </select>
                        </td>
                        <td className="py-2 text-right">
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => updateShift(i, { personen: s.personen.filter((_, idx) => idx !== j) })}>
                            entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="mt-2 text-xs text-navy-500 hover:underline" onClick={() => updateShift(i, { personen: [...s.personen, { name: "", rolle: "MITARBEITER", employeeId: null, sicher: false, kandidaten: [] }] })}>
                  + Person hinzufügen
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setSchichten((l) => [...l, { bezeichnung: "Schicht", taetigkeit: "", datum: preview.datum, start: "08:00", endeDatum: preview.datum, ende: "16:00", endeGeschaetzt: false, anzahlSoll: null, personen: [] }])}>
            + Schicht hinzufügen
          </button>

          {konflikte.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="font-semibold">Arbeitszeitkonflikte (gegen alle Einsätze geprüft)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {konflikte.map((k, i) => (
                  <li key={i}>{k.message}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={akzeptiert} onChange={(e) => setAkzeptiert(e.target.checked)} />
                Konflikte geprüft, trotzdem speichern
              </label>
            </div>
          ) : null}

          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="text-sm text-navy-500">
              {unresolved.length > 0 ? <p className="text-amber-600">Nicht zugeordnet: {unresolved.join(", ")}</p> : null}
              {missingTimes > 0 ? <p className="text-amber-600">{missingTimes} Schicht(en) ohne vollständige Zeiten.</p> : null}
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={mitPdf} onChange={(e) => setMitPdf(e.target.checked)} />
                Konkretisierungs-PDF direkt erzeugen
              </label>
            </div>
            <button type="button" className="btn-accent" onClick={save} disabled={saving || unresolved.length > 0 || missingTimes > 0 || !projekt || !einsatzort || (!customerId && !kundeName)} data-testid="save-button">
              {saving ? "Speichern …" : "Einsatz speichern"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
