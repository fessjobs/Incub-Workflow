"use client";
import { useMemo } from "react";
import { usePv, initialerZustand, type Einstellungen } from "../state/store";
import { Bar, Btn, Chip, Karte, Kopf, Note, Offen } from "../ui/kit";
import { bewertung } from "./helfer";
import { formatDezimal } from "../logic/zeit";

function Zahl({ label, wert, onChange, schritt = 1, hint, id }: { label: string; wert: number; onChange: (n: number) => void; schritt?: number; hint?: string; id: string }) {
  return (
    <div className="pv-field">
      <label className="pv-label" htmlFor={id}>{label}</label>
      <input id={id} type="number" className="pv-input mono" step={schritt} value={Number.isFinite(wert) ? wert : 0} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <div className="pv-hint">{hint}</div> : null}
    </div>
  );
}

export function AdminEinstellungen() {
  const { s, set, melde } = usePv();
  const e = s.einst;
  const ändere = (fn: (x: Einstellungen) => Einstellungen) => set((st) => ({ ...st, einst: fn(st.einst) }));

  const verteilung = useMemo(() => {
    const v = { A: 0, B: 0, C: 0 };
    for (const c of s.crew) {
      const b = bewertung(c, e);
      if (b) v[b.kategorie]++;
    }
    return v;
  }, [s.crew, e]);
  const gesamt = verteilung.A + verteilung.B + verteilung.C || 1;
  const gewichtSumme = e.scoring.gewicht.erfahrung + e.scoring.gewicht.mobilitaet + e.scoring.gewicht.qualifikation + e.scoring.gewicht.situation;

  const blockNamen: Array<[keyof Einstellungen["scoring"]["gewicht"], string]> = [["erfahrung", "Erfahrung"], ["mobilitaet", "Mobilität"], ["qualifikation", "Qualifikation"], ["situation", "Situationsfragen"]];

  return (
    <>
      <Kopf eyebrow="System" titel="Einstellungen" sub="Alle Werte, die später in der Tabelle „settings“ liegen. Hier ändern sie sich sofort im Prototyp." aktionen={<Btn v="sec" onClick={() => { const i = initialerZustand().einst; set((st) => ({ ...st, einst: i })); melde("Einstellungen auf Standard zurückgesetzt."); }}>Auf Standard zurücksetzen</Btn>} />

      <div className="pva-grid c2">
        <Karte titel="Score und Kategorien (Fragebogen)">
          <div className="col">
            {blockNamen.map(([k, label]) => (
              <div key={k}>
                <div className="row between"><label className="pv-label" htmlFor={`g-${k}`} style={{ margin: 0 }}>{label}</label><span className="mono small">{e.scoring.gewicht[k]} ({formatDezimal((e.scoring.gewicht[k] / (gewichtSumme || 1)) * 100, 0)} %)</span></div>
                <input id={`g-${k}`} type="range" min={0} max={100} value={e.scoring.gewicht[k]} style={{ width: "100%", accentColor: "var(--orange)" }} onChange={(ev) => ändere((x) => ({ ...x, scoring: { ...x.scoring, gewicht: { ...x.scoring.gewicht, [k]: Number(ev.target.value) } } }))} />
              </div>
            ))}
          </div>
          <div className="pva-grid c2 mt2">
            <Zahl id="schwelle-a" label="Kategorie A ab Punkten" wert={e.scoring.schwelleA} onChange={(n) => ändere((x) => ({ ...x, scoring: { ...x.scoring, schwelleA: n } }))} />
            <Zahl id="schwelle-b" label="Kategorie B ab Punkten" wert={e.scoring.schwelleB} onChange={(n) => ändere((x) => ({ ...x, scoring: { ...x.scoring, schwelleB: n } }))} />
            <Zahl id="leistung-anteil" label="Höchstanteil echte Leistung" wert={e.scoring.leistungMaxAnteil} schritt={0.05} hint="0,7 = höchstens 70 % des Scores aus echten Einsätzen" onChange={(n) => ändere((x) => ({ ...x, scoring: { ...x.scoring, leistungMaxAnteil: n } }))} />
            <Zahl id="leistung-einsaetze" label="… erreicht nach Einsätzen" wert={e.scoring.leistungEinsaetzeFuerMax} onChange={(n) => ändere((x) => ({ ...x, scoring: { ...x.scoring, leistungEinsaetzeFuerMax: n } }))} />
          </div>
          <h4 className="mt2">Verteilung der Crew (live)</h4>
          <div className="col gap1 mt1" data-testid="verteilung">
            {(["A", "B", "C"] as const).map((k) => (
              <div key={k} className="row"><Chip ton={k === "A" ? "gut" : k === "B" ? "info" : "warn"}>Kategorie {k}</Chip><div className="grow"><Bar anteil={verteilung[k] / gesamt} ton={k === "A" ? "gut" : k === "B" ? undefined : "warn"} /></div><span className="mono small">{verteilung[k]}</span></div>
            ))}
          </div>
        </Karte>

        <Karte titel="XP und Level">
          <div className="pva-grid c2">
            <Zahl id="xp-basis" label="Einsatz erschienen" wert={e.xp.basis} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, basis: n } }))} />
            <Zahl id="xp-puenktlich" label="pünktlich und Zettel vollständig" wert={e.xp.puenktlichUndZettel} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, puenktlichUndZettel: n } }))} />
            <Zahl id="xp-gut" label="Bewertung 4 oder besser" wert={e.xp.gutBewertet} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, gutBewertet: n } }))} />
            <Zahl id="xp-noshow" label="No-Show" wert={e.xp.noShow} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, noShow: n } }))} />
            <Zahl id="xp-zettel" label="Zettel fehlt" wert={e.xp.zettelFehlt} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, zettelFehlt: n } }))} />
          </div>
          <h4 className="mt2">Level-Schwellen <Offen>Annahme, im Plan nicht festgelegt</Offen></h4>
          <div className="pva-grid c2 mt1">
            {e.xp.levels.map((l, i) => (
              <Zahl key={l.name} id={`lv-${i}`} label={`${l.name} ab XP`} wert={l.ab} onChange={(n) => ändere((x) => ({ ...x, xp: { ...x.xp, levels: x.xp.levels.map((y, j) => (j === i ? { ...y, ab: n } : y)) } }))} />
            ))}
          </div>
        </Karte>

        <Karte titel="Grenzen und Sätze">
          <Zahl id="minijob" label="Minijob-Verdienstgrenze je Monat (€)" wert={e.minijobEur} schritt={1} hint="Annahme 603 € – vor dem Einsatz mit dem aktuellen Mindestlohn prüfen. Gilt für die Ampel in der Crew-Übersicht." onChange={(n) => ändere((x) => ({ ...x, minijobEur: n }))} />
          <Offen>Wert prüfen</Offen>
          <div className="mt2" />
          <Zahl id="km-satz" label="Kilometersatz privat (€ je km)" wert={e.exp.kmSatzPrivat} schritt={0.01} hint="Steuerfreier Satz für Privat-PKW, geht in den zvoove-Export." onChange={(n) => ändere((x) => ({ ...x, exp: { ...x.exp, kmSatzPrivat: n } }))} />
          <Note>70-Tage-Grenze für kurzfristig Beschäftigte und die Ruhezeit von 11 Stunden sind fest hinterlegt.</Note>
        </Karte>

        <Karte titel="Lohnarten für den zvoove-Export" aktionen={<Offen>mit Daniel abstimmen</Offen>}>
          <table className="pv-table" data-testid="lohnarten">
            <thead><tr><th>Position</th><th>Lohnart</th><th>Abgestimmt</th></tr></thead>
            <tbody>
              {e.exp.lohnarten.map((l) => (
                <tr key={l.schluessel}>
                  <td>{l.label}</td>
                  <td><input className="pv-input sm mono" style={{ width: 90 }} value={l.lohnart} aria-label={`Lohnart ${l.label}`} onChange={(ev) => ändere((x) => ({ ...x, exp: { ...x.exp, lohnarten: x.exp.lohnarten.map((y) => (y.schluessel === l.schluessel ? { ...y, lohnart: ev.target.value } : y)) } }))} /></td>
                  <td><input type="checkbox" checked={l.abgestimmt} aria-label={`${l.label} abgestimmt`} onChange={(ev) => ändere((x) => ({ ...x, exp: { ...x.exp, lohnarten: x.exp.lohnarten.map((y) => (y.schluessel === l.schluessel ? { ...y, abgestimmt: ev.target.checked } : y)) } }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pv-hint">Nacht, Sonntag und Feiertag rechnet zvoove über den Tarifvertrag. Positionen ohne Lohnart erscheinen im Prüfbericht des Exports.</div>
        </Karte>

        <Karte titel="Fragebogen-Nachricht (WhatsApp)">
          <textarea className="pv-textarea" value={e.fragebogenLinkText} onChange={(ev) => ändere((x) => ({ ...x, fragebogenLinkText: ev.target.value }))} aria-label="Nachrichtentext" />
          <div className="pv-hint">Platzhalter: {"{vorname}"} und {"{link}"}.</div>
        </Karte>
      </div>
    </>
  );
}
