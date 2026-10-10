"use client";
// Arbeitskleidung gegen Pfand: Was wird gebraucht (nach Größe), was ist ausgegeben,
// welches Pfand ist offen. Die Auswahl treffen die Leute im Fragebogen.
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, neueAudit, HEUTE } from "../state/store";
import { Btn, Chip, Feld, Karte, Kopf, Note, Stat, Tabs, ladeTextHerunter } from "../ui/kit";
import { artikelLabel, bedarf, csv, groesseFuer, offeneAusgaben, offenesPfand, sortiereGroessen } from "../logic/kleidung";
import { formatDatumDE, formatEuro } from "../logic/zeit";
import type { Crew, KleidungAusgabe } from "../logic/types";
import type { KleidungArtikel } from "../logic/einstellungen-neu";
import { neueId } from "./formulare";
import { vollName } from "./helfer";
import { bearbeiter } from "./stunden-aktionen";

type Tab = "bedarf" | "ausgabe" | "einstellungen";

export function AdminKleidung() {
  const { s, set, melde, echt, modus } = usePv();
  const [tab, setTab] = useState<Tab>("bedarf");
  const [offenArtikel, setOffenArtikel] = useState<string | null>(null);
  const k = s.einst.kleidung;
  const istAdmin = modus !== "echt" || echt?.rolle === "admin";
  const zeilen = useMemo(() => bedarf(s.crew, k.artikel), [s.crew, k.artikel]);
  const wuensche = s.crew.filter((c) => c.profile?.kleidung?.wunsch).length;
  const ausgegeben = s.crew.flatMap((c) => offeneAusgaben(c).map((x) => ({ c, x })));
  const ohneGroesse = zeilen.reduce((n, z) => n + (z.nachGroesse.get("ohne Größe")?.length ?? 0), 0);

  const bestellliste = () => {
    const kopf = ["Artikel", "Größe", "Anzahl"];
    const rows = zeilen.flatMap((z) => sortiereGroessen([...z.nachGroesse.keys()]).map((g) => [z.artikel.label, g, String(z.nachGroesse.get(g)?.length ?? 0)]));
    ladeTextHerunter(`kleidung-bestellliste-${HEUTE}.csv`, csv([kopf, ...rows]));
  };
  const personenliste = () => {
    const rows: string[][] = [["Name", "Personalnummer", "Handy", "Artikel", "Größe"]];
    for (const z of zeilen) for (const [g, ps] of z.nachGroesse) for (const c of ps) rows.push([vollName(c), c.pnr, c.telefon, z.artikel.label, g]);
    ladeTextHerunter(`kleidung-personen-${HEUTE}.csv`, csv(rows));
  };

  const aendereArtikel = (id: string, patch: Partial<KleidungArtikel>) => set((st) => ({ ...st, einst: { ...st.einst, kleidung: { ...st.einst.kleidung, artikel: st.einst.kleidung.artikel.map((a) => (a.id === id ? { ...a, ...patch } : a)) } } }));

  return (
    <>
      <Kopf eyebrow="Personal" titel="Arbeitskleidung" sub="Wer welche Kleidung gegen Pfand möchte – nach Größe gezählt. Ausgabe und Rückgabe trägst du am Profil der Person ein." />
      <div className="pva-grid c4">
        <Stat wert={wuensche} label="Personen mit Kleidungswunsch" />
        <Stat wert={zeilen.reduce((n, z) => n + z.summe, 0)} label="Teile noch zu besorgen oder auszugeben" />
        <Stat wert={ausgegeben.length} label="Teile ausgegeben" />
        <Stat wert={formatEuro(offenesPfand(s.crew))} label="Pfand offen (bei Ausgabe erfasst)" ton={ausgegeben.length ? "warn" : undefined} />
      </div>
      {ohneGroesse > 0 ? <div className="mt2"><Note ton="warn">Bei {ohneGroesse} Wünschen fehlt die Größe. Diese Personen bitte nachfragen.</Note></div> : null}
      <div className="mt3"><Tabs wert={tab} onChange={setTab} tabs={[{ id: "bedarf", label: "Bedarf nach Größe" }, { id: "ausgabe", label: "Ausgegeben und Pfand", n: ausgegeben.length }, ...(istAdmin ? [{ id: "einstellungen" as const, label: "Artikel und Pfand" }] : [])]} /></div>

      {tab === "bedarf" ? (
        <Karte aktionen={<span className="row"><Btn v="sec" groesse="sm" onClick={bestellliste} data-testid="kleidung-bestellliste">Bestellliste (CSV)</Btn><Btn v="sec" groesse="sm" onClick={personenliste}>Personenliste (CSV)</Btn></span>}>
          {zeilen.every((z) => z.summe === 0) ? <div className="muted">Noch keine Kleidungswünsche. Sie kommen aus dem Fragebogen (Etappe „Ausrüstung“).</div> : null}
          <div className="col">
            {zeilen.filter((z) => z.summe > 0).map((z) => (
              <div key={z.artikel.id}>
                <div className="row between">
                  <b>{z.artikel.label}</b>
                  <button type="button" className="pv-btn ghost sm" onClick={() => setOffenArtikel(offenArtikel === z.artikel.id ? null : z.artikel.id)}>{z.summe} Stück {offenArtikel === z.artikel.id ? "▲" : "▼"}</button>
                </div>
                <div className="row wrap mt1">
                  {sortiereGroessen([...z.nachGroesse.keys()]).map((g) => <Chip key={g} ton={g === "ohne Größe" ? "warn" : undefined} mono>{g}: {z.nachGroesse.get(g)?.length}</Chip>)}
                </div>
                {offenArtikel === z.artikel.id ? (
                  <table className="pv-table mt1"><tbody>
                    {sortiereGroessen([...z.nachGroesse.keys()]).flatMap((g) => (z.nachGroesse.get(g) ?? []).map((c) => (
                      <tr key={c.id + g}><td><Link href={`/admin/crew/${c.id}`}>{vollName(c)}</Link> <span className="tiny muted mono">{c.pnr}</span></td><td>{g}</td></tr>
                    )))}
                  </tbody></table>
                ) : null}
              </div>
            ))}
          </div>
        </Karte>
      ) : null}

      {tab === "ausgabe" ? (
        <Karte>
          {ausgegeben.length === 0 ? <div className="muted">Noch nichts ausgegeben. Ausgabe am Profil der Person eintragen (Tab „Kleidung“).</div> : null}
          {ausgegeben.length > 0 ? (
            <table className="pv-table" data-testid="ausgabe-tabelle">
              <thead><tr><th>Person</th><th>Artikel</th><th>Größe</th><th>Pfand</th><th>Seit</th></tr></thead>
              <tbody>
                {ausgegeben.map(({ c, x }) => (
                  <tr key={x.id}><td><Link href={`/admin/crew/${c.id}`}>{vollName(c)}</Link></td><td>{artikelLabel(k.artikel, x.artikel)}</td><td>{x.groesse || "–"}</td><td className="mono">{formatEuro(x.pfandEur)}</td><td>{formatDatumDE(x.ausgegebenAm)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Karte>
      ) : null}

      {tab === "einstellungen" && istAdmin ? (
        <div className="col gap2">
          <Karte titel="Fragebogen">
            <label className="pv-check"><input type="checkbox" checked={k.aktiv} onChange={(e) => set((st) => ({ ...st, einst: { ...st.einst, kleidung: { ...st.einst.kleidung, aktiv: e.target.checked } } }))} />Frage nach Arbeitskleidung im Fragebogen zeigen</label>
            <Feld label="Pfand-Hinweis (steht im Fragebogen unter der Frage)"><textarea className="pv-textarea" aria-label="Pfand-Hinweis" value={k.pfandHinweis} onChange={(e) => set((st) => ({ ...st, einst: { ...st.einst, kleidung: { ...st.einst.kleidung, pfandHinweis: e.target.value } } }))} /></Feld>
          </Karte>
          <Karte titel="Artikel und Pfand">
            <table className="pv-table">
              <thead><tr><th>Artikel</th><th>Größe nach</th><th>Pfand (€)</th><th /></tr></thead>
              <tbody>
                {k.artikel.map((a) => (
                  <tr key={a.id}>
                    <td><input className="pv-input sm" aria-label={`Name ${a.id}`} value={a.label} onChange={(e) => aendereArtikel(a.id, { label: e.target.value })} /></td>
                    <td>
                      <select className="pv-select sm" aria-label={`Größenart ${a.label}`} value={a.groessen} onChange={(e) => aendereArtikel(a.id, { groessen: e.target.value as KleidungArtikel["groessen"] })}>
                        <option value="shirt">Shirtgröße</option><option value="hose">Hosengröße</option><option value="schuh">Schuhgröße</option><option value="keine">keine Größe</option>
                      </select>
                    </td>
                    <td><input className="pv-input sm mono" style={{ width: 90 }} aria-label={`Pfand ${a.label}`} inputMode="decimal" value={a.pfandEur === null ? "" : String(a.pfandEur)} placeholder="offen" onChange={(e) => { const t = e.target.value.replace(",", "."); aendereArtikel(a.id, { pfandEur: t === "" || !Number.isFinite(Number(t)) ? null : Math.max(0, Number(t)) }); }} /></td>
                    <td><Btn v="ghost" groesse="sm" aria-label={`${a.label} entfernen`} onClick={() => set((st) => ({ ...st, einst: { ...st.einst, kleidung: { ...st.einst.kleidung, artikel: st.einst.kleidung.artikel.filter((x) => x.id !== a.id) } } }))}>✕</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt2"><Btn v="sec" groesse="sm" onClick={() => set((st) => ({ ...st, einst: { ...st.einst, kleidung: { ...st.einst.kleidung, artikel: [...st.einst.kleidung.artikel, { id: neueId("k"), label: "Neuer Artikel", groessen: "keine", pfandEur: null }] } } }))}>+ Artikel</Btn></div>
            <div className="pv-hint">Pfandbeträge sind leer, bis du sie einträgst – beim Ausgeben kannst du sie überschreiben. Gewünschte Artikel, die du hier entfernst, erscheinen nicht mehr im Bedarf.</div>
          </Karte>
        </div>
      ) : null}
    </>
  );
}

// Tab „Kleidung“ am Profil einer Person
export function KleidungTab({ c }: { c: Crew }) {
  const { s, set, melde, echt, modus } = usePv();
  const k = s.einst.kleidung;
  const darf = modus !== "echt" || echt?.rolle === "admin" || echt?.rolle === "dispo";
  const wunsch = c.profile?.kleidung;
  const [artikelId, setArtikelId] = useState(k.artikel[0]?.id ?? "");
  const gewaehlt = k.artikel.find((a) => a.id === artikelId);
  const [groesse, setGroesse] = useState("");
  const [pfand, setPfand] = useState("");
  const wer = echt?.benutzer ?? bearbeiter();

  const speichere = (liste: KleidungAusgabe[], text: string) => set((st) => ({ ...st, crew: st.crew.map((x) => (x.id === c.id ? { ...x, kleidungAusgabe: liste } : x)), audit: [neueAudit(wer, "crew", c.id, "kleidung", "", text, null), ...st.audit] }));
  const ausgeben = () => {
    if (!gewaehlt) return;
    const g = groesse.trim() || groesseFuer(c, gewaehlt);
    const p = pfand.trim() === "" ? gewaehlt.pfandEur ?? 0 : Number(pfand.replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return melde("Das Pfand ist keine Zahl.");
    speichere([...(c.kleidungAusgabe ?? []), { id: neueId("ka"), artikel: gewaehlt.id, groesse: g === "–" ? "" : g, pfandEur: p, ausgegebenAm: HEUTE, zurueckAm: null, notiz: "" }], `${gewaehlt.label} ausgegeben`);
    setGroesse("");
    setPfand("");
    melde(`${gewaehlt.label} an ${vollName(c)} ausgegeben.`);
  };

  return (
    <div className="pva-grid c2">
      <Karte titel="Wunsch aus dem Fragebogen">
        {!c.profile ? <div className="muted">Fragebogen noch nicht abgeschickt.</div> : (
          <table className="pv-table"><tbody>
            <tr><td>Schuhgröße</td><td>{c.profile.schuhgroesse || "–"}</td></tr>
            <tr><td>Shirtgröße</td><td>{c.profile.shirtgroesse || "–"}</td></tr>
            <tr><td>Hosengröße</td><td>{wunsch?.hosengroesse || "–"}</td></tr>
            <tr><td>Kleidung gegen Pfand</td><td>{wunsch?.wunsch ? wunsch.artikel.map((id) => artikelLabel(k.artikel, id)).join(", ") || "ja, ohne Auswahl" : "nein"}</td></tr>
          </tbody></table>
        )}
      </Karte>
      <Karte titel="Ausgegeben">
        {(c.kleidungAusgabe ?? []).length === 0 ? <div className="muted">Noch nichts ausgegeben.</div> : null}
        <table className="pv-table"><tbody>
          {(c.kleidungAusgabe ?? []).map((x) => (
            <tr key={x.id}>
              <td>{artikelLabel(k.artikel, x.artikel)}{x.groesse ? ` (${x.groesse})` : ""}<div className="tiny muted">seit {formatDatumDE(x.ausgegebenAm)}</div></td>
              <td className="mono">{formatEuro(x.pfandEur)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {x.zurueckAm ? <Chip ton="gut">zurück {formatDatumDE(x.zurueckAm)}</Chip> : darf ? <Btn groesse="sm" v="sec" data-testid="kleidung-zurueck" onClick={() => speichere((c.kleidungAusgabe ?? []).map((y) => (y.id === x.id ? { ...y, zurueckAm: HEUTE } : y)), `${artikelLabel(k.artikel, x.artikel)} zurückgegeben, Pfand erstatten`)}>Zurückgegeben</Btn> : <Chip ton="warn">ausgegeben</Chip>}
              </td>
            </tr>
          ))}
        </tbody></table>
        {darf ? (
          <div className="mt2">
            <div className="pva-grid c3">
              <Feld label="Artikel"><select className="pv-select sm" aria-label="Artikel" value={artikelId} onChange={(e) => { setArtikelId(e.target.value); setGroesse(""); setPfand(""); }}>{k.artikel.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Feld>
              <Feld label="Größe"><input className="pv-input sm" aria-label="Größe" value={groesse} placeholder={gewaehlt ? groesseFuer(c, gewaehlt) : ""} onChange={(e) => setGroesse(e.target.value)} /></Feld>
              <Feld label="Pfand (€)"><input className="pv-input sm mono" aria-label="Pfand" inputMode="decimal" value={pfand} placeholder={gewaehlt?.pfandEur !== null && gewaehlt?.pfandEur !== undefined ? String(gewaehlt.pfandEur) : "0"} onChange={(e) => setPfand(e.target.value)} /></Feld>
            </div>
            <Btn groesse="sm" onClick={ausgeben} disabled={!gewaehlt} data-testid="kleidung-ausgeben">Ausgeben</Btn>
          </div>
        ) : null}
      </Karte>
    </div>
  );
}
