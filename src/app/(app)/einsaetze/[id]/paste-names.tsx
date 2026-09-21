"use client";

// Namen aus der Zwischenablage in eine Schicht übernehmen: Liste einfügen,
// Abgleich gegen den Mitarbeiterstamm prüfen, dann übernehmen. Vor der
// Bestätigung wird nichts gespeichert.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VorschauZeile } from "@/lib/einsatz/service/besetzung";
import { addNamesAction, previewNamesAction } from "../actions";

type Zeile = VorschauZeile & { wahl: string };

// "" = nicht übernehmen, "__neu" = neu anlegen, sonst employeeId
function startWahl(z: VorschauZeile): string {
  if (z.schonDabei) return "";
  if (z.employeeId) return z.employeeId;
  return "__neu";
}

export function PasteNames({ shiftId, schicht }: { shiftId: string; schicht: string }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const uebernehmen = zeilen?.filter((z) => z.wahl !== "") ?? [];

  const pruefen = () =>
    starte(async () => {
      setFehler(null);
      setMeldung(null);
      const res = await previewNamesAction({ shiftId, text });
      if (!res.ok) {
        setZeilen(null);
        setFehler(res.error);
        return;
      }
      setZeilen(res.zeilen.map((z) => ({ ...z, wahl: startWahl(z) })));
    });

  const speichern = () =>
    starte(async () => {
      setFehler(null);
      const res = await addNamesAction({
        shiftId,
        personen: uebernehmen.map((z) => ({
          name: z.name,
          rolle: z.rolle,
          employeeId: z.wahl === "__neu" ? null : z.wahl,
          neuAnlegen: z.wahl === "__neu",
        })),
      });
      if (!res.ok) return setFehler(res.error);
      setMeldung(res.message ?? "Übernommen.");
      setZeilen(null);
      setText("");
      router.refresh();
    });

  if (!offen) {
    return (
      <div className="border-t border-navy-100 px-4 py-3 dark:border-navy-800">
        <button type="button" className="btn-secondary text-xs" onClick={() => setOffen(true)} data-testid={`paste-open-${shiftId}`}>
          + Namen einfügen
        </button>
        {meldung ? <span className="ml-3 text-xs text-emerald-700 dark:text-emerald-300">{meldung}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-navy-100 bg-navy-50/50 px-4 py-3 dark:border-navy-800 dark:bg-navy-900/40">
      <div>
        <label className="label" htmlFor={`paste-${shiftId}`}>
          Namen für „{schicht}“ einfügen
        </label>
        <textarea
          id={`paste-${shiftId}`}
          className="input-accent min-h-[110px] font-mono text-[13px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Mohammad Alhariri\nGülhan, Samira\nTobias Krämer (AP)\nJana Weidner"}
          data-testid={`paste-text-${shiftId}`}
        />
        <p className="mt-1 text-xs text-navy-400">
          Eine Person je Zeile. „Nachname, Vorname“ wird gedreht, Aufzählungszeichen und Kürzel wie (AP) oder (Spare) werden erkannt.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-accent text-xs" onClick={pruefen} disabled={laeuft || text.trim().length === 0} data-testid={`paste-check-${shiftId}`}>
          {laeuft && !zeilen ? "Prüft …" : "Namen prüfen"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => {
            setOffen(false);
            setZeilen(null);
            setText("");
            setFehler(null);
          }}
        >
          Abbrechen
        </button>
      </div>

      {fehler ? (
        <p className="text-sm text-red-600" role="alert">
          {fehler}
        </p>
      ) : null}

      {zeilen ? (
        <div className="space-y-2" data-testid={`paste-vorschau-${shiftId}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <th className="py-1">Eingefügt</th>
                <th className="py-1">Zuordnung</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={i} className="border-t border-navy-100 dark:border-navy-800">
                  <td className="py-1.5 pr-3">
                    {z.name}
                    {z.rolle !== "MITARBEITER" ? <span className="ml-2 badge-accent">{z.rolle === "ANSPRECHPARTNER" ? "AP" : "Spare"}</span> : null}
                    {z.schonDabei ? <span className="ml-2 text-xs text-navy-400">steht schon auf der Schicht</span> : null}
                  </td>
                  <td className="py-1.5">
                    <select
                      className={`input-accent ${z.wahl === "__neu" && !z.schonDabei ? "border-amber-400" : ""}`}
                      value={z.wahl}
                      onChange={(e) => setZeilen((l) => l!.map((x, j) => (j === i ? { ...x, wahl: e.target.value } : x)))}
                      data-testid={`paste-wahl-${i}`}
                    >
                      <option value="">– nicht übernehmen –</option>
                      {z.employeeId && z.sicher ? <option value={z.employeeId}>{z.kandidaten.find((k) => k.employeeId === z.employeeId)?.name ?? "zugeordnet"} · sicher</option> : null}
                      {z.kandidaten
                        .filter((k) => k.employeeId !== z.employeeId)
                        .map((k) => (
                          <option key={k.employeeId} value={k.employeeId}>
                            {k.name} · {Math.round(k.score * 100)} %{k.personalnummer ? ` · ${k.personalnummer}` : ""}
                          </option>
                        ))}
                      <option value="__neu">neu anlegen: {z.name}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-accent text-xs" onClick={speichern} disabled={laeuft || uebernehmen.length === 0} data-testid={`paste-apply-${shiftId}`}>
            {laeuft ? "Übernimmt …" : `${uebernehmen.length} Person(en) übernehmen`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
