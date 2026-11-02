"use client";
// Gemeinsame Bausteine der Monatszettel-Seiten (Personenlink, Kundenlink, Dashboard).
import { useEffect } from "react";
import { usePv, HEUTE } from "../state/store";
import { initialisiereMz, useMz, type MzZustand } from "../state/monatszettel-store";
import { Chip, Note } from "../ui/kit";
import { STATUS_TEXT, datumAnzeige, eintragMinuten, sortiert, summe, zettelStatus, type Summe, type MonatsZettel, type ZettelStatus } from "../logic/monatszettel";
import { dezimal, formatDezimal, formatEuro } from "../logic/zeit";

// Lädt den Browser-Zustand des Prototyps (Beispieldaten beim ersten Öffnen); null, solange er noch nicht da ist
export function useMzBereit(): MzZustand | null {
  const { s } = usePv();
  useEffect(() => {
    if (s.crew.length > 0) initialisiereMz(s.crew, HEUTE);
  }, [s.crew]);
  return useMz();
}

export function NurTestversion() {
  const { modus } = usePv();
  if (modus === "demo") return null;
  return <Note ton="warn">Der Monatszettel ist bisher nur als Klick-Prototyp in der Testversion zu sehen.</Note>;
}

const TON: Record<ZettelStatus, "gut" | "warn" | "err" | "info" | undefined> = { leer: undefined, in_arbeit: "info", wartet_kunde: "warn", zurueck: "err", fertig: "gut" };

export function StatusChip({ z }: { z: MonatsZettel }) {
  const st = zettelStatus(z);
  return <span data-testid={`mz-status-${z.id}`}><Chip ton={TON[st]}>{STATUS_TEXT[st]}</Chip></span>;
}

export const stundenText = (min: number) => `${formatDezimal(dezimal(min))} h`;

export function SummenLeiste({ s }: { s: Summe }) {
  return (
    <div className="row wrap gap2" data-testid="mz-summe">
      <Chip mono>{s.tage} Tage</Chip>
      <Chip mono>{formatDezimal(s.stunden)} h</Chip>
      {s.km > 0 ? <Chip mono>{String(s.km).replace(".", ",")} km Fahrt</Chip> : null}
      {s.spesen > 0 ? <Chip mono>{formatEuro(s.spesen)} Spesen</Chip> : null}
    </div>
  );
}

// Tageszeilen eines Zettels (nur lesen) – für Kunde, Detailansicht und PDF
export function EintragsTabelle({ z }: { z: MonatsZettel }) {
  const liste = sortiert(z.eintraege);
  return (
    <div className="pv-scroll">
      <table className="pv-table">
        <thead>
          <tr><th>Datum</th><th>Zeit</th><th>Pause</th><th style={{ textAlign: "right" }}>Stunden</th><th>Angaben</th></tr>
        </thead>
        <tbody>
          {liste.map((e) => {
            const angaben = [
              e.taetigkeit,
              e.fahrten.length > 0 ? `Fahrt: ${e.fahrten.map((f) => `${f.von || "?"} → ${f.nach || "?"}${f.km ? ` (${String(f.km).replace(".", ",")} km${e.privatPkw ? ", privater PKW" : ""})` : ""}`).join("; ")}` : "",
              e.spesen ? `Spesen ${formatEuro(e.spesen)}` : "",
              e.sonderabsprache ? `Absprache: ${e.sonderabsprache}` : "",
              e.getan ? `Getan: ${e.getan}` : "",
              e.notiz,
            ].filter(Boolean);
            return (
              <tr key={e.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{datumAnzeige(e.datum)}</td>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{e.start}–{e.ende}</td>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{e.pauseMin} min</td>
                <td className="mono" style={{ textAlign: "right" }}>{formatDezimal(dezimal(eintragMinuten(e)))}</td>
                <td className="small">{angaben.length > 0 ? angaben.join(" · ") : <span className="muted">–</span>}</td>
              </tr>
            );
          })}
          {liste.length === 0 ? <tr><td colSpan={5} className="muted">Keine Einträge.</td></tr> : null}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}><b>Summe</b></td><td className="mono" style={{ textAlign: "right" }}><b>{formatDezimal(summe(z).stunden)}</b></td><td className="small muted">{summe(z).tage} Tage</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function Unterschriftsbild({ bild, label, zeit }: { bild: string | null; label: string; zeit: string | null }) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ height: 84, borderBottom: "1.5px solid var(--navy)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {bild ? <img src={bild} alt={label} style={{ maxHeight: 80, maxWidth: "100%" }} /> : <span className="muted small" style={{ paddingBottom: 6 }}>— noch nicht unterschrieben —</span>}
      </div>
      <div className="small" style={{ marginTop: 4 }}><b>{label}</b>{zeit ? <span className="muted"> · {new Date(zeit).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}</span> : null}</div>
    </div>
  );
}
