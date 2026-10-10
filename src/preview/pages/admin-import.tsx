"use client";
// Import: Personalstamm (zvoove oder eigene Liste) und Aufträge (Regio-Tabelle).
// Datei hochladen oder aus Excel/Google Tabellen einfügen, Spalten prüfen, Vorschau ansehen,
// erst dann übernehmen. Nichts wird gelöscht; Vorhandenes wird nur ergänzt oder aktualisiert.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "../nav";
import { usePv, neueAudit, HEUTE } from "../state/store";
import { Btn, Chip, Feld, Karte, Kopf, Note, Stat, Tabs } from "../ui/kit";
import { findeKopfzeile, parseText, tabelleAusRohdaten, zelle, type Tabelle } from "@/lib/neu/import/tabelle";
import { AUFTRAG_FELDER, erkenneAuftragSpalten, kopfAuftraege, planeAuftragImport, uebernehmeAuftraege, type AuftragFeld, type AuftragOptionen } from "@/lib/neu/import/auftraege";
import { PERSONAL_FELDER, VERTRAGSARTEN, erkennePersonalSpalten, kopfPersonal, planePersonalImport, uebernehmePersonal, type Aktion, type PersonalFeld, type PersonalOptionen } from "@/lib/neu/import/personal";
import { TAETIGKEITEN, type Taetigkeit, type Vertragsart } from "../logic/types";
import { formatDatumDE } from "../logic/zeit";
import { neueId } from "./formulare";
import { bearbeiter } from "./stunden-aktionen";

interface Blatt {
  name: string;
  zeilen: string[][];
  gesamt: number;
}

type Art = "personal" | "auftraege";

// ─── Einlesen (Datei oder Einfügen) ─────────────────────────────────────────

function Einlesen({ onBlaetter }: { onBlaetter: (b: Blatt[], quelle: string) => void }) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const hochladen = async (datei: File) => {
    setLaeuft(true);
    setFehler(null);
    try {
      const fd = new FormData();
      fd.append("datei", datei);
      const r = await fetch("/api/neu/import/parse", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await r.json().catch(() => null)) as { blaetter?: Blatt[]; error?: string } | null;
      if (!r.ok || !j?.blaetter) return setFehler(j?.error ?? "Die Datei konnte nicht gelesen werden.");
      onBlaetter(j.blaetter, datei.name);
    } catch {
      setFehler("Die Datei konnte nicht hochgeladen werden.");
    } finally {
      setLaeuft(false);
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  const einfuegen = () => {
    const zeilen = parseText(text);
    if (zeilen.length < 2) return setFehler("Bitte mindestens die Überschrift und eine Zeile einfügen.");
    setFehler(null);
    onBlaetter([{ name: "Eingefügte Tabelle", zeilen: zeilen.slice(0, 6000), gesamt: zeilen.length }], "eingefügt");
  };

  return (
    <div className="pva-grid c2">
      <Karte titel="Datei hochladen">
        <p className="small">Excel (.xlsx) oder CSV. Ältere .xls-Dateien bitte in Excel als .xlsx speichern. Größe bis 8 MB.</p>
        <div className="mt2">
          <input ref={eingabe} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt" aria-label="Datei auswählen" data-testid="import-datei" disabled={laeuft} onChange={(e) => { const f = e.target.files?.[0]; if (f) void hochladen(f); }} />
        </div>
        {laeuft ? <div className="small muted mt2">Wird gelesen …</div> : null}
      </Karte>
      <Karte titel="Oder aus der Tabelle einfügen">
        <p className="small">Zellen in Excel oder der Online-Tabelle markieren, kopieren (Strg+C) und hier einfügen (Strg+V). Die Überschriftenzeile gehört dazu.</p>
        <textarea className="pv-textarea mt1" style={{ minHeight: 110 }} aria-label="Tabelle einfügen" data-testid="import-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Vorname\tNachname\tPersonalnummer\t…"} />
        <div className="mt2"><Btn v="sec" onClick={einfuegen} disabled={!text.trim()} data-testid="import-einlesen">Einlesen</Btn></div>
      </Karte>
      {fehler ? <div className="pv-error" role="alert" style={{ gridColumn: "1 / -1" }}>{fehler}</div> : null}
    </div>
  );
}

// ─── Gemeinsame Bausteine ───────────────────────────────────────────────────

function BlattWahl({ blaetter, idx, onIdx, kopf, onKopf, max }: { blaetter: Blatt[]; idx: number; onIdx: (i: number) => void; kopf: number; onKopf: (i: number) => void; max: number }) {
  return (
    <div className="row wrap">
      {blaetter.length > 1 ? (
        <Feld label="Tabellenblatt"><select className="pv-select sm" aria-label="Tabellenblatt" value={idx} onChange={(e) => onIdx(Number(e.target.value))}>{blaetter.map((b, i) => <option key={i} value={i}>{b.name} ({b.gesamt} Zeilen)</option>)}</select></Feld>
      ) : null}
      <Feld label="Überschriften stehen in Zeile"><select className="pv-select sm" aria-label="Überschriftenzeile" value={kopf} onChange={(e) => onKopf(Number(e.target.value))}>{Array.from({ length: Math.min(max, 15) }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></Feld>
    </div>
  );
}

function Spaltenwahl<F extends string>({ felder, kopf, werte, onChange, stichprobe }: { felder: Array<{ feld: F; label: string; hinweis?: string }>; kopf: string[]; werte: Record<F, number>; onChange: (f: F, i: number) => void; stichprobe: Tabelle }) {
  return (
    <table className="pv-table" data-testid="spaltenwahl">
      <thead><tr><th>Das brauchen wir</th><th>Spalte in deiner Tabelle</th><th>Beispiel</th></tr></thead>
      <tbody>
        {felder.map((f) => (
          <tr key={f.feld}>
            <td><b>{f.label}</b>{f.hinweis ? <div className="tiny muted">{f.hinweis}</div> : null}</td>
            <td>
              <select className="pv-select sm" aria-label={f.label} value={werte[f.feld]} onChange={(e) => onChange(f.feld, Number(e.target.value))}>
                <option value={-1}>– nicht vorhanden –</option>
                {kopf.map((k, i) => (k.trim() ? <option key={i} value={i}>{k}</option> : null))}
              </select>
            </td>
            <td className="small muted">{werte[f.feld] >= 0 ? stichprobe.zeilen.slice(0, 3).map((z) => zelle(z, werte[f.feld])).filter(Boolean).join(" · ").slice(0, 70) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AktionChip({ a }: { a: Aktion | "neu" | "aktualisieren" | "unveraendert" }) {
  const m: Record<string, { t: string; ton?: "gut" | "warn" | "err" | "info" }> = {
    neu: { t: "neu", ton: "gut" },
    aktualisieren: { t: "wird aktualisiert", ton: "info" },
    unveraendert: { t: "unverändert" },
    fehler: { t: "Fehler", ton: "err" },
    uebersprungen: { t: "übersprungen", ton: "warn" },
  };
  return <Chip ton={m[a].ton}>{m[a].t}</Chip>;
}

function Fertig({ children, onNochmal }: { children: ReactNode; onNochmal: () => void }) {
  return (
    <Karte ton="orange">
      <div data-testid="import-fertig">{children}</div>
      <div className="mt2"><Btn v="sec" onClick={onNochmal}>Weitere Datei importieren</Btn></div>
    </Karte>
  );
}

// ─── Personal ───────────────────────────────────────────────────────────────

function PersonalImport() {
  const { s, set, melde, echt } = usePv();
  const [blaetter, setBlaetter] = useState<Blatt[] | null>(null);
  const [quelle, setQuelle] = useState("");
  const [blatt, setBlatt] = useState(0);
  const [kopfZeile, setKopfZeile] = useState(0);
  const [sp, setSp] = useState<Record<PersonalFeld, number> | null>(null);
  const [opt, setOpt] = useState<Omit<PersonalOptionen, "minijobEur" | "vertragZuordnung">>({ neuAnlegen: true, bestehendeAktualisieren: true, ausgeschiedeneUebernehmen: true, sofortFreigeben: false });
  const [vertraege, setVertraege] = useState<Record<string, Vertragsart | "keiner">>({});
  const [filter, setFilter] = useState<Aktion | "alle">("alle");
  const [ergebnisText, setErgebnisText] = useState<string | null>(null);

  const rohe = blaetter?.[blatt]?.zeilen ?? null;
  const tabelle = useMemo(() => (rohe ? tabelleAusRohdaten(rohe, kopfZeile) : null), [rohe, kopfZeile]);

  const lade = (b: Blatt[], q: string) => {
    setBlaetter(b);
    setQuelle(q);
    setBlatt(0);
    setErgebnisText(null);
    setVertraege({});
    const k = findeKopfzeile(b[0].zeilen, kopfPersonal());
    setKopfZeile(k);
    setSp(erkennePersonalSpalten(tabelleAusRohdaten(b[0].zeilen, k).kopf));
  };
  // Kopfzeile oder Blatt gewechselt: Spalten neu erkennen
  const neuErkennen = (b: number, k: number) => {
    setBlatt(b);
    setKopfZeile(k);
    const z = blaetter?.[b]?.zeilen;
    if (z) setSp(erkennePersonalSpalten(tabelleAusRohdaten(z, k).kopf));
  };

  const plan = useMemo(() => {
    if (!tabelle || !sp) return null;
    let n = 0;
    return planePersonalImport(tabelle, sp, s.crew, { ...opt, minijobEur: s.einst.minijobEur, vertragZuordnung: vertraege }, HEUTE, () => neueId(`c${n++}`));
  }, [tabelle, sp, s.crew, opt, vertraege, s.einst.minijobEur]);

  if (ergebnisText) return <Fertig onNochmal={() => { setBlaetter(null); setErgebnisText(null); }}><b>Import fertig.</b> {ergebnisText}<div className="mt1"><Link href="/admin/crew">Zur Crew-Liste →</Link></div></Fertig>;
  if (!blaetter || !tabelle || !sp || !plan) return <Einlesen onBlaetter={lade} />;

  const sichtbar = plan.zeilen.filter((z) => filter === "alle" || z.aktion === filter);
  const z = plan.zusammenfassung;
  const kannUebernehmen = plan.fehlendePflicht.every((x) => !x.startsWith("Name")) && z.neu + z.aktualisieren > 0;

  const uebernehmen = () => {
    const wer = echt?.benutzer ?? bearbeiter();
    set((st) => {
      const r = uebernehmePersonal(st.crew, plan);
      return { ...st, crew: r.crew, audit: [neueAudit(wer, "crew", "import", "import", quelle, `Personalimport: ${r.neu} neu, ${r.aktualisiert} aktualisiert`, null), ...st.audit] };
    });
    const text = `${z.neu} neu angelegt, ${z.aktualisieren} aktualisiert, ${z.unveraendert} unverändert, ${z.fehler + z.uebersprungen} nicht übernommen.`;
    melde(`Personalimport: ${text}`);
    setErgebnisText(text);
  };

  return (
    <div className="col gap2">
      <Karte titel={`Quelle: ${quelle}`} aktionen={<Btn v="ghost" groesse="sm" onClick={() => setBlaetter(null)}>Andere Datei</Btn>}>
        <BlattWahl blaetter={blaetter} idx={blatt} onIdx={(i) => neuErkennen(i, findeKopfzeile(blaetter[i].zeilen, kopfPersonal()))} kopf={kopfZeile} onKopf={(k) => neuErkennen(blatt, k)} max={rohe?.length ?? 1} />
        <div className="small muted mt1">{tabelle.zeilen.length} Datenzeilen, {tabelle.kopf.filter(Boolean).length} Spalten.</div>
      </Karte>

      <Karte titel="1 · Spalten zuordnen">
        <Spaltenwahl felder={PERSONAL_FELDER} kopf={tabelle.kopf} werte={sp} onChange={(f, i) => setSp({ ...sp, [f]: i })} stichprobe={tabelle} />
        {plan.fehlendePflicht.length > 0 ? <div className="mt2"><Note ton="warn">Fehlt: {plan.fehlendePflicht.join("; ")}</Note></div> : null}
        {plan.ausgelassen.length > 0 ? (
          <div className="mt2"><Note>Diese Spalten werden <b>nicht</b> gelesen und nicht gespeichert (sensible Daten): {plan.ausgelassen.map((x) => `${x.spalte} (${x.grund})`).join(", ")}.</Note></div>
        ) : null}
      </Karte>

      <Karte titel="2 · Einstellungen">
        <div className="col gap1">
          <label className="pv-check"><input type="checkbox" checked={opt.neuAnlegen} onChange={(e) => setOpt({ ...opt, neuAnlegen: e.target.checked })} />Neue Personen anlegen</label>
          <label className="pv-check"><input type="checkbox" checked={opt.bestehendeAktualisieren} onChange={(e) => setOpt({ ...opt, bestehendeAktualisieren: e.target.checked })} />Vorhandene Personen aktualisieren (erkannt über Personalnummer, E-Mail oder Namen mit vorläufiger Nummer)</label>
          <label className="pv-check"><input type="checkbox" checked={opt.ausgeschiedeneUebernehmen} onChange={(e) => setOpt({ ...opt, ausgeschiedeneUebernehmen: e.target.checked })} />Ausgeschiedene (Austritt in der Vergangenheit) als „ausgeschieden“ übernehmen</label>
          <label className="pv-check"><input type="checkbox" checked={opt.sofortFreigeben} onChange={(e) => setOpt({ ...opt, sofortFreigeben: e.target.checked })} data-testid="import-freigeben" />Alle gleich für Aufträge freigeben (sonst erst nach Fragebogen und deiner Bestätigung)</label>
        </div>
        {plan.unbekannteVertraege.length > 0 ? (
          <div className="mt2" data-testid="vertrag-zuordnung">
            <b>Diese Vertragsarten kennen wir nicht – was sind sie?</b>
            <div className="col gap1 mt1">
              {plan.unbekannteVertraege.map((t) => (
                <div key={t} className="row"><span style={{ minWidth: 200 }}>„{t}“</span>
                  <select className="pv-select sm" aria-label={`Vertragsart für ${t}`} value={vertraege[t] ?? ""} onChange={(e) => setVertraege({ ...vertraege, [t]: e.target.value as Vertragsart | "keiner" })}>
                    <option value="">noch offen</option>
                    {VERTRAGSARTEN.map((v) => <option key={v} value={v}>{v}</option>)}
                    <option value="keiner">keinen Vertrag eintragen</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Karte>

      <Karte titel="3 · Vorschau" aktionen={<select className="pv-select sm" aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Aktion | "alle")}><option value="alle">Alle Zeilen</option><option value="neu">nur neue</option><option value="aktualisieren">nur Aktualisierungen</option><option value="fehler">nur Fehler</option><option value="uebersprungen">nur übersprungene</option></select>}>
        <div className="pva-grid c4">
          <Stat wert={z.neu} label="neu" ton="gut" />
          <Stat wert={z.aktualisieren} label="werden aktualisiert" />
          <Stat wert={z.unveraendert} label="unverändert" />
          <Stat wert={z.fehler + z.uebersprungen} label="nicht übernommen" ton={z.fehler ? "warn" : undefined} />
        </div>
        <div className="pv-scroll mt2">
          <table className="pv-table" data-testid="import-vorschau">
            <thead><tr><th>Zeile</th><th>Person</th><th>Nr.</th><th>Ergebnis</th><th>Details</th></tr></thead>
            <tbody>
              {sichtbar.slice(0, 300).map((r) => (
                <tr key={r.nr}>
                  <td className="mono small">{r.nr}</td>
                  <td>{r.name || "–"}</td>
                  <td className="mono small">{r.person?.pnr ?? r.pnr}</td>
                  <td><AktionChip a={r.aktion} /></td>
                  <td className="small">
                    {r.meldung ? <div>{r.meldung}</div> : null}
                    {r.aenderungen.map((a, i) => <div key={i} className="muted">{a}</div>)}
                    {r.person && r.aktion === "neu" && r.person.contract ? <div className="muted">{r.person.contract.vertragsart}{r.person.contract.gueltigBis ? `, befristet bis ${formatDatumDE(r.person.contract.gueltigBis)}` : ", unbefristet"}</div> : null}
                    {r.warnungen.map((w, i) => <div key={i} style={{ color: "var(--warn)" }}>⚠ {w}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sichtbar.length > 300 ? <div className="small muted mt1">Angezeigt werden die ersten 300 von {sichtbar.length} Zeilen.</div> : null}
        <div className="row mt3">
          <Btn onClick={uebernehmen} disabled={!kannUebernehmen} data-testid="import-uebernehmen">Jetzt übernehmen ({z.neu} neu, {z.aktualisieren} aktualisieren)</Btn>
          <span className="small muted">Es wird nichts gelöscht. Änderungen stehen im Änderungsprotokoll.</span>
        </div>
      </Karte>
    </div>
  );
}

// ─── Aufträge ───────────────────────────────────────────────────────────────

function AuftragsImport() {
  const { s, set, melde, echt } = usePv();
  const [blaetter, setBlaetter] = useState<Blatt[] | null>(null);
  const [quelle, setQuelle] = useState("");
  const [blatt, setBlatt] = useState(0);
  const [kopfZeile, setKopfZeile] = useState(0);
  const [sp, setSp] = useState<Record<AuftragFeld, number> | null>(null);
  const [opt, setOpt] = useState<AuftragOptionen>({ sofortVeroeffentlichen: false, standardTaetigkeit: "Stagehand" });
  const [ergebnisText, setErgebnisText] = useState<string | null>(null);

  const rohe = blaetter?.[blatt]?.zeilen ?? null;
  const tabelle = useMemo(() => (rohe ? tabelleAusRohdaten(rohe, kopfZeile) : null), [rohe, kopfZeile]);

  const lade = (b: Blatt[], q: string) => {
    setBlaetter(b);
    setQuelle(q);
    setBlatt(0);
    setErgebnisText(null);
    const k = findeKopfzeile(b[0].zeilen, kopfAuftraege());
    setKopfZeile(k);
    setSp(erkenneAuftragSpalten(tabelleAusRohdaten(b[0].zeilen, k)));
  };
  const neuErkennen = (b: number, k: number) => {
    setBlatt(b);
    setKopfZeile(k);
    const z = blaetter?.[b]?.zeilen;
    if (z) setSp(erkenneAuftragSpalten(tabelleAusRohdaten(z, k)));
  };

  const plan = useMemo(() => (tabelle && sp ? planeAuftragImport(tabelle, sp, s.jobs, opt) : null), [tabelle, sp, s.jobs, opt]);

  if (ergebnisText) return <Fertig onNochmal={() => { setBlaetter(null); setErgebnisText(null); }}><b>Import fertig.</b> {ergebnisText}<div className="mt1"><Link href="/admin/dispo">Zur Disposition →</Link></div></Fertig>;
  if (!blaetter || !tabelle || !sp || !plan) return <Einlesen onBlaetter={lade} />;

  const z = plan.zusammenfassung;
  const uebernehmen = () => {
    const wer = echt?.benutzer ?? bearbeiter();
    set((st) => {
      const r = uebernehmeAuftraege(st.jobs, st.auftraege, plan);
      return { ...st, jobs: r.jobs, auftraege: r.auftraege, audit: [neueAudit(wer, "job", "import", "import", quelle, `Auftragsimport: ${r.neu} neu, ${r.aktualisiert} aktualisiert`, null), ...st.audit] };
    });
    const text = `${z.neu} Aufträge neu angelegt${opt.sofortVeroeffentlichen ? "" : " (als Entwurf – noch nicht für die Crew sichtbar)"}, ${z.aktualisieren} aktualisiert, ${z.unveraendert} unverändert.`;
    melde(`Auftragsimport: ${text}`);
    setErgebnisText(text);
  };

  return (
    <div className="col gap2">
      <Karte titel={`Quelle: ${quelle}`} aktionen={<Btn v="ghost" groesse="sm" onClick={() => setBlaetter(null)}>Andere Datei</Btn>}>
        <BlattWahl blaetter={blaetter} idx={blatt} onIdx={(i) => neuErkennen(i, findeKopfzeile(blaetter[i].zeilen, kopfAuftraege()))} kopf={kopfZeile} onKopf={(k) => neuErkennen(blatt, k)} max={rohe?.length ?? 1} />
        <div className="small muted mt1">{tabelle.zeilen.length} Datenzeilen. Jede Zeile ist eine Schicht; Zeilen desselben Auftrags werden zusammengefasst.</div>
      </Karte>

      <Karte titel="1 · Spalten zuordnen">
        <Spaltenwahl felder={AUFTRAG_FELDER} kopf={tabelle.kopf} werte={sp} onChange={(f, i) => setSp({ ...sp, [f]: i })} stichprobe={tabelle} />
        {plan.fehlendePflicht.length > 0 ? <div className="mt2"><Note ton="warn">Fehlt: {plan.fehlendePflicht.join("; ")}</Note></div> : null}
      </Karte>

      <Karte titel="2 · Einstellungen">
        <div className="col gap1">
          <label className="pv-check"><input type="checkbox" checked={opt.sofortVeroeffentlichen} onChange={(e) => setOpt({ ...opt, sofortVeroeffentlichen: e.target.checked })} />Neue Aufträge sofort für die Crew veröffentlichen (sonst Entwurf)</label>
          <Feld label="Wenn die Tätigkeit nicht erkannt wird, einsetzen:"><select className="pv-select sm" aria-label="Standard-Tätigkeit" value={opt.standardTaetigkeit} onChange={(e) => setOpt({ ...opt, standardTaetigkeit: e.target.value as Taetigkeit })}>{TAETIGKEITEN.map((t) => <option key={t}>{t}</option>)}</select></Feld>
        </div>
      </Karte>

      <Karte titel="3 · Vorschau">
        <div className="pva-grid c4">
          <Stat wert={z.neu} label="Aufträge neu" ton="gut" />
          <Stat wert={z.aktualisieren} label="werden aktualisiert" />
          <Stat wert={z.unveraendert} label="unverändert" />
          <Stat wert={z.schichten} label="Schichten in der Tabelle" />
        </div>
        {plan.fehler.length > 0 ? (
          <div className="mt2"><Note ton="warn"><b>{plan.fehler.length} Zeilen nicht lesbar:</b> {plan.fehler.slice(0, 6).map((f) => `Zeile ${f.nr}: ${f.meldung}`).join("; ")}{plan.fehler.length > 6 ? " …" : ""}</Note></div>
        ) : null}
        <div className="pv-scroll mt2">
          <table className="pv-table" data-testid="import-vorschau">
            <thead><tr><th>Auftrag</th><th>Ort</th><th>Zeitraum</th><th>Schichten</th><th>Ergebnis</th><th>Hinweise</th></tr></thead>
            <tbody>
              {plan.plaene.slice(0, 200).map((p) => (
                <tr key={p.key}>
                  <td><b>{p.job.titel}</b><div className="tiny muted">{p.job.kunde} · <span className="mono">{p.job.id}</span></div></td>
                  <td>{p.job.plz} {p.job.ort}</td>
                  <td className="small">{formatDatumDE(p.job.datumVon)}{p.job.datumBis !== p.job.datumVon ? ` – ${formatDatumDE(p.job.datumBis)}` : ""}</td>
                  <td className="small">{p.job.schichten.length} ({p.schichtenNeu} neu{p.schichtenGeaendert ? `, ${p.schichtenGeaendert} geändert` : ""})</td>
                  <td><AktionChip a={p.aktion} /></td>
                  <td className="small">
                    {p.aenderungen.map((a, i) => <div key={i} className="muted">{a}</div>)}
                    {p.schichtenNichtInTabelle > 0 ? <div className="muted">{p.schichtenNichtInTabelle} vorhandene Schichten stehen nicht mehr in der Tabelle (bleiben bestehen)</div> : null}
                    {p.warnungen.map((w, i) => <div key={i} style={{ color: "var(--warn)" }}>⚠ {w}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row mt3">
          <Btn onClick={uebernehmen} disabled={z.neu + z.aktualisieren === 0} data-testid="import-uebernehmen">Jetzt übernehmen ({z.neu} neu, {z.aktualisieren} aktualisieren)</Btn>
          <span className="small muted">Bestehende Besetzungen und Status bleiben unverändert. Es wird nichts gelöscht.</span>
        </div>
      </Karte>
    </div>
  );
}

// ─── Seite ──────────────────────────────────────────────────────────────────

export function AdminImport() {
  const { echt } = usePv();
  const rolle = echt?.rolle ?? "admin";
  const darfPersonal = rolle === "admin";
  const darfAuftraege = rolle === "admin" || rolle === "dispo";
  const [art, setArt] = useState<Art>(darfPersonal ? "personal" : "auftraege");
  useEffect(() => {
    if (art === "personal" && !darfPersonal) setArt("auftraege");
  }, [art, darfPersonal]);
  if (!darfAuftraege) return <Note ton="warn">Für deine Rolle ist der Import nicht freigegeben.</Note>;
  return (
    <>
      <Kopf eyebrow="System" titel="Import" sub="Personalstamm aus zvoove und Aufträge aus der Regio-Tabelle einlesen. Erst Vorschau, dann übernehmen – nichts wird gelöscht." />
      <Tabs wert={art} onChange={setArt} tabs={[...(darfPersonal ? [{ id: "personal" as const, label: "Personal (zvoove / Excel)" }] : []), { id: "auftraege" as const, label: "Aufträge (Regio-Tabelle)" }]} />
      <div className="mt3">{art === "personal" ? <PersonalImport /> : <AuftragsImport />}</div>
    </>
  );
}
