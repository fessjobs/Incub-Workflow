"use client";
import { useMemo, useState } from "react";
import { usePv, HEUTE } from "../state/store";
import { Btn, Chip, Kopf, Note, Offen, Stat } from "../ui/kit";
import { addTage, formatDatumDE } from "../logic/zeit";
import { MODULE, t } from "../data/trainings";
import { BELEG_BEZEICHNUNG } from "../logic/beleg";
import { vollName } from "./helfer";

type Typ = "Vertrag" | "Unterweisung" | "Stundennachweis" | "Beleg";

interface Dokument {
  id: string;
  typ: Typ;
  titel: string;
  person: string;
  pnr: string;
  auftrag: string;
  datum: string;
  quelle: string;
}

export function AdminUnterlagen() {
  const { s, melde } = usePv();
  const [typ, setTyp] = useState("");
  const [suche, setSuche] = useState("");
  const [auftrag, setAuftrag] = useState("");

  const alle = useMemo(() => {
    const out: Dokument[] = [];
    for (const c of s.crew) {
      if (c.contract) out.push({ id: `v-${c.id}`, typ: "Vertrag", titel: `Arbeitsvertrag ${c.contract.vertragsart}`, person: vollName(c), pnr: c.pnr, auftrag: "", datum: c.contract.gueltigVon, quelle: `DocuSign ${c.contract.docusignId}` });
      for (const [m, ack] of Object.entries(c.unterweisungen)) {
        const mod = MODULE.find((x) => x.id === m);
        out.push({ id: `u-${c.id}-${m}`, typ: "Unterweisung", titel: `Nachweis ${mod ? t(mod.titel, "de") : m}`, person: vollName(c), pnr: c.pnr, auftrag: "", datum: ack.bestaetigtAm, quelle: `Version ${ack.version}` });
      }
    }
    const nachAuftrag = new Map<string, { n: number; datum: string }>();
    for (const r of s.stunden) {
      if (!r.sourceRef) continue;
      const e = nachAuftrag.get(r.auftrag) ?? { n: 0, datum: r.datum };
      e.n++;
      if (r.datum > e.datum) e.datum = r.datum;
      nachAuftrag.set(r.auftrag, e);
    }
    for (const [a, e] of nachAuftrag) out.push({ id: `s-${a}`, typ: "Stundennachweis", titel: `Stundennachweis ${a} (${e.n} Zeilen)`, person: "", pnr: "", auftrag: a, datum: e.datum, quelle: "Bestehendes Einsatzmodul" });
    for (const b of s.belege) out.push({ id: b.id, typ: "Beleg", titel: `${BELEG_BEZEICHNUNG[b.art]} ${b.dateiname}`, person: s.crew.find((c) => c.pnr === b.pnr)?.vorname ?? b.pnr, pnr: b.pnr, auftrag: b.auftragId, datum: b.datum, quelle: "Beleg-Link" });
    return out.sort((a, b) => b.datum.localeCompare(a.datum));
  }, [s]);

  const q = suche.trim().toLowerCase();
  const liste = alle.filter((d) => (!typ || d.typ === typ) && (!auftrag || d.auftrag === auftrag) && (!q || `${d.titel} ${d.person} ${d.pnr} ${d.auftrag}`.toLowerCase().includes(q)));
  const zaehle = (x: Typ) => alle.filter((d) => d.typ === x).length;
  const auftraege = [...new Set(alle.map((d) => d.auftrag).filter(Boolean))].sort();

  return (
    <>
      <Kopf eyebrow="Abrechnung" titel="Unterlagen" sub="Alle Dokumente je Person und Auftrag an einem Ort. Das bestehende Einsatzmodul bleibt die Quelle für Stundennachweise." />
      <div className="pva-grid c4">
        <Stat wert={zaehle("Vertrag")} label="Verträge (DocuSign)" />
        <Stat wert={zaehle("Unterweisung")} label="Unterweisungsnachweise" />
        <Stat wert={zaehle("Stundennachweis")} label="Stundennachweise" />
        <Stat wert={zaehle("Beleg")} label="Belege aus dem Beleg-Link" />
      </div>
      <div className="row wrap mt3">
        <input className="pv-input" style={{ maxWidth: 260 }} placeholder="Suche: Person, Auftrag, Titel" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Suche" />
        <select className="pv-select" style={{ maxWidth: 190 }} value={typ} onChange={(e) => setTyp(e.target.value)} aria-label="Dokumenttyp">
          <option value="">Alle Typen</option>
          {(["Vertrag", "Unterweisung", "Stundennachweis", "Beleg"] as Typ[]).map((x) => <option key={x}>{x}</option>)}
        </select>
        <select className="pv-select" style={{ maxWidth: 230 }} value={auftrag} onChange={(e) => setAuftrag(e.target.value)} aria-label="Auftrag">
          <option value="">Alle Aufträge</option>
          {auftraege.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="small muted">{liste.length.toLocaleString("de-DE")} Dokumente</span>
      </div>
      <div className="pv-card pv-scroll mt2" style={{ padding: 0 }}>
        <table className="pv-table" data-testid="unterlagen-tabelle">
          <thead><tr><th>Typ</th><th>Dokument</th><th>Person</th><th>Auftrag</th><th>Datum</th><th>Quelle</th><th>Aufbewahrung</th><th /></tr></thead>
          <tbody>
            {liste.slice(0, 120).map((d) => (
              <tr key={d.id}>
                <td><Chip ton={d.typ === "Vertrag" ? "navy" : d.typ === "Beleg" ? "orange" : d.typ === "Unterweisung" ? "info" : undefined}>{d.typ}</Chip></td>
                <td>{d.titel}</td>
                <td>{d.person || "–"}<div className="tiny muted mono">{d.pnr}</div></td>
                <td className="small mono">{d.auftrag || "–"}</td>
                <td>{formatDatumDE(d.datum)}</td>
                <td className="small">{d.quelle}</td>
                <td className="small">{d.typ === "Beleg" || d.typ === "Stundennachweis" ? `bis ${formatDatumDE(addTage(d.datum, 3652))}` : "nach Vertragsende prüfen"}</td>
                <td><Btn groesse="sm" v="sec" onClick={() => melde("Prototyp: hier würde das PDF geladen.")}>Öffnen</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {liste.length > 120 ? <div className="small muted mt2">Angezeigt werden die ersten 120 von {liste.length}.</div> : null}
      <div className="row wrap mt2">
        <Offen>Aufbewahrungsfristen je Dokumenttyp mit dem Steuerberater klären (hier: 10 Jahre für Belege und Nachweise als Annahme)</Offen>
      </div>
      <div className="mt2"><Note>Belege und Auslagen im bestehenden System ({HEUTE.slice(0, 4)}) bleiben unverändert und werden hier nicht doppelt geführt.</Note></div>
    </>
  );
}
