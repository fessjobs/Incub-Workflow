"use client";

// Export-Bereich: Excel oder zvoove-CSV je Zeitraum, Kunde, Person –
// zvoove wird vor dem Download validiert (Fehlerliste), Export wahlweise
// ohne die fehlerhaften Zeilen.
import { useState } from "react";

type Err = { zeile: number; personalnummer: string; name: string; datum: string; problem: string };

export function ExportPanel({ von, bis, customers, employees, customerId, employeeId }: { von: string; bis: string; customers: Array<{ id: string; name: string }>; employees: Array<{ id: string; name: string }>; customerId?: string; employeeId?: string }) {
  const [f, setF] = useState({ von, bis, customerId: customerId ?? "", employeeId: employeeId ?? "", archivieren: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; zeilen: number; fehler: Err[]; hinweis?: string | null; mapping?: { quelle: string; spalten: string[]; zeichensatz: string; trennzeichen: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = (format: "xlsx" | "zvoove", extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ format, von: f.von, bis: f.bis, archivieren: f.archivieren ? "1" : "0", ...extra });
    if (f.customerId) p.set("customerId", f.customerId);
    if (f.employeeId) p.set("employeeId", f.employeeId);
    return `/auswertung/export?${p.toString()}`;
  };

  const validate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(query("zvoove", { validate: "1" }));
      const j = await res.json();
      if (!res.ok) setError(j.error ?? `Fehler ${res.status}`);
      else setResult(j);
    } catch {
      setError("Validierung fehlgeschlagen (Netzwerk).");
    } finally {
      setBusy(false);
    }
  };

  const monat = (offset: number) => {
    const [y, m] = f.von.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    setF({ ...f, von: `${d.getUTCFullYear()}-${mm}-01`, bis: `${d.getUTCFullYear()}-${mm}-${String(last).padStart(2, "0")}` });
    setResult(null);
  };

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Export (nur freigegebene Zeiten)</p>
          <p className="mt-1 text-sm text-navy-400">Excel mit 4 Blättern oder zvoove-CSV für die Stundenschnellerfassung. Beide Exporte werden im Dokumentenspeicher archiviert.</p>
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn-secondary text-xs" onClick={() => monat(-1)}>
            ← Monat
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={() => monat(1)}>
            Monat →
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <input type="date" className="input" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} aria-label="Von" />
        <input type="date" className="input" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} aria-label="Bis" />
        <select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
          <option value="">Alle Personen</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.archivieren} onChange={(e) => setF({ ...f, archivieren: e.target.checked })} /> archivieren
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={query("xlsx")} className="btn-accent" data-testid="export-xlsx">
          Excel herunterladen
        </a>
        <button type="button" className="btn-secondary" onClick={validate} disabled={busy} data-testid="zvoove-validate">
          {busy ? "Prüfe …" : "zvoove-CSV prüfen"}
        </button>
        {result ? (
          result.ok ? (
            <a href={query("zvoove")} className="btn-accent" data-testid="export-zvoove">
              zvoove-CSV herunterladen ({result.zeilen} Zeilen)
            </a>
          ) : (
            <a href={query("zvoove", { ohneFehler: "1" })} className="btn-secondary" data-testid="export-zvoove-ohne-fehler">
              Ohne fehlerhafte Zeilen exportieren
            </a>
          )
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? (
        <div className="text-sm">
          {result.hinweis ? <p className="text-amber-600">{result.hinweis}</p> : null}
          {result.mapping ? (
            <p className="text-xs text-navy-400">
              Mapping: {result.mapping.quelle} · {result.mapping.spalten.join(" | ")} · {result.mapping.zeichensatz} · Trenner „{result.mapping.trennzeichen === "\t" ? "Tab" : result.mapping.trennzeichen}“
            </p>
          ) : null}
          {result.fehler.length === 0 ? (
            <p className="text-emerald-600">Validierung erfolgreich – {result.zeilen} Zeilen bereit.</p>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
              <p className="font-semibold text-red-700 dark:text-red-300">
                {result.fehler.length} Fehler in {result.zeilen} Zeilen – bitte beheben (Personalnummern unter Personal, Lohnarten unter Lohnarten) oder ohne die fehlerhaften Zeilen exportieren.
              </p>
              <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-700 dark:text-red-300">
                {result.fehler.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    Zeile {e.zeile}: {e.name}
                    {e.personalnummer ? ` (PN ${e.personalnummer})` : ""} · {e.datum} · {e.problem}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
