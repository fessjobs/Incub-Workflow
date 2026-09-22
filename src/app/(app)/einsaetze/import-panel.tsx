"use client";

// Gemeinsame Oberfläche für die Stammdaten-Importe: Datei wählen, Vorschau
// mit Befund je Zeile prüfen, dann übernehmen. Vor der Bestätigung wird
// nichts gespeichert.
//
// Beide Schritte rufen dieselbe Server Action auf und unterscheiden sich nur
// im Feld "schritt". Die gewählte Datei wird dabei im State gehalten und
// nicht aus dem Formular gelesen: React leert nach einer Formular-Action alle
// unkontrollierten Felder, der File-Input wäre für den zweiten Schritt also
// leer – und aus JavaScript lässt er sich nicht wieder befüllen.
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SchrittErgebnis } from "./import-actions";

type Props = {
  titel: string;
  hinweis: string;
  beispielSpalten: string[];
  action: (prev: SchrittErgebnis | null, formData: FormData) => Promise<SchrittErgebnis>;
  zurueckHref: string;
  // PDF-Listen liest die Claude API aus; ohne Schlüssel gibt es nur Excel/CSV
  pdfMoeglich: boolean;
};

const BEFUND_STIL: Record<string, string> = {
  neu: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  aktualisierung: "badge-accent",
  unveraendert: "badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300",
  fehler: "badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const BEFUND_TEXT: Record<string, string> = { neu: "neu", aktualisierung: "wird ergänzt", unveraendert: "unverändert", fehler: "Fehler" };

export function ImportPanel({ titel, hinweis, beispielSpalten, action, zurueckHref, pdfMoeglich }: Props) {
  const router = useRouter();
  const [datei, setDatei] = useState<File | null>(null);
  const [aktualisieren, setAktualisieren] = useState(true);
  const [stand, submit, laeuft] = useActionState<SchrittErgebnis | null, FormData>(action, null);
  const [, starte] = useTransition();

  function schicke(schritt: "vorschau" | "import") {
    if (!datei) return;
    const fd = new FormData();
    fd.set("datei", datei);
    fd.set("schritt", schritt);
    if (aktualisieren) fd.set("aktualisieren", "on");
    starte(() => submit(fd));
  }

  const vorschau = stand?.vorschau ?? null;
  const ergebnis = stand?.import ?? null;
  const z = vorschau?.ok ? vorschau.vorschau.zusammenfassung : null;
  const uebernehmbar = z ? z.neu + z.aktualisierung : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Stammdaten</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{titel}</h1>
        <p className="mt-1 text-sm text-navy-400">{hinweis}</p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          schicke("vorschau");
        }}
      >
        <div className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="datei">
              Datei (Excel .xlsx, CSV{pdfMoeglich ? " oder PDF" : ""})
            </label>
            <input
              id="datei"
              name="datei"
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,.tsv,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="input-accent"
              data-testid="import-datei"
              required
              onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-xs text-navy-400">
              Die Spalten werden an den Überschriften erkannt, die Reihenfolge ist egal. Erkannt werden unter anderem: {beispielSpalten.join(", ")}.
            </p>
            <p className="mt-1 text-xs text-navy-400">
              {pdfMoeglich
                ? "Ein PDF – auch eine eingescannte Liste – wird von der Claude API ausgelesen. Die Vorschau zeigt danach, was erkannt wurde; gespeichert wird erst nach deiner Bestätigung."
                : "PDF-Listen bräuchten die Claude API (ANTHROPIC_API_KEY ist nicht gesetzt). Excel und CSV gehen ohne."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aktualisieren" checked={aktualisieren} onChange={(e) => setAktualisieren(e.target.checked)} />
            Vorhandene Einträge ergänzen (leere Felder in der Datei überschreiben nichts)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-accent" disabled={laeuft} data-testid="vorschau-button">
              {laeuft ? "Datei wird gelesen …" : "Vorschau anzeigen"}
            </button>
            <a href={zurueckHref} className="btn-secondary">
              Zurück
            </a>
          </div>
          {vorschau && !vorschau.ok ? (
            <p className="text-sm text-red-600" role="alert">
              {vorschau.error}
            </p>
          ) : null}
        </div>

        {vorschau?.ok ? (
          <div className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Vorschau · {vorschau.dateiname}</p>
                <p className="mt-1 text-sm">
                  <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{z!.neu} neu</span>{" "}
                  <span className="badge-accent">{z!.aktualisierung} zu ergänzen</span>{" "}
                  <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">{z!.unveraendert} unverändert</span>{" "}
                  {z!.fehler > 0 ? <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">{z!.fehler} Fehler</span> : null}
                </p>
              </div>
              <button type="button" onClick={() => schicke("import")} className="btn-accent" disabled={laeuft} data-testid="import-button">
                {laeuft ? "Wird übernommen …" : `${uebernehmbar} Einträge übernehmen`}
              </button>
            </div>

            {vorschau.vorschau.fehlendePflicht.length > 0 ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                Pflichtspalte nicht gefunden: {vorschau.vorschau.fehlendePflicht.join(", ")}. Bitte die Überschrift in der Datei ergänzen.
              </p>
            ) : null}

            <p className="text-xs text-navy-400">
              Erkannte Spalten:{" "}
              {Object.entries(vorschau.vorschau.erkannt).length === 0
                ? "keine"
                : Object.entries(vorschau.vorschau.erkannt)
                    .map(([feld, spalte]) => `${feld} ← „${spalte}“`)
                    .join(" · ")}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
                  <tr>
                    <th className="px-3 py-2">Zeile</th>
                    <th className="px-3 py-2">Befund</th>
                    {Object.keys(vorschau.vorschau.zeilen[0]?.werte ?? {}).map((k) => (
                      <th key={k} className="px-3 py-2">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
                  {vorschau.vorschau.zeilen.slice(0, 200).map((zeile) => (
                    <tr key={zeile.nr} className={zeile.befund === "fehler" ? "bg-red-50/50 dark:bg-red-950/30" : ""}>
                      <td className="px-3 py-2 tabular-nums text-navy-400">{zeile.nr}</td>
                      <td className="px-3 py-2">
                        <span className={BEFUND_STIL[zeile.befund]}>{BEFUND_TEXT[zeile.befund]}</span>
                        {zeile.meldung ? <span className="ml-2 text-xs text-navy-400">{zeile.meldung}</span> : null}
                      </td>
                      {Object.values(zeile.werte).map((v, i) => (
                        <td key={i} className="px-3 py-2">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {vorschau.vorschau.zeilen.length > 200 ? (
                <p className="mt-2 text-xs text-navy-400">… und {vorschau.vorschau.zeilen.length - 200} weitere Zeilen (werden mit übernommen).</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      {ergebnis ? (
        ergebnis.ok ? (
          <div className="card space-y-2 p-5" data-testid="import-ergebnis">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              {ergebnis.neu} neu angelegt, {ergebnis.aktualisiert} ergänzt, {ergebnis.uebersprungen} übersprungen.
            </p>
            {ergebnis.fehler.length > 0 ? (
              <div className="text-sm">
                <p className="font-medium text-red-700 dark:text-red-300">{ergebnis.fehler.length} Zeilen konnten nicht übernommen werden:</p>
                <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-700 dark:text-red-300">
                  {ergebnis.fehler.map((f, i) => (
                    <li key={i}>
                      Zeile {f.nr}: {f.meldung}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => router.push(zurueckHref)}>
              Zur Liste
            </button>
          </div>
        ) : (
          <p className="text-sm text-red-600" role="alert">
            {ergebnis.error}
          </p>
        )
      ) : null}
    </div>
  );
}
