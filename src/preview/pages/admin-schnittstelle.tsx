"use client";
// Schnittstelle zum bisherigen System: VORBEREITET, AUS. Diese Seite zeigt den Zustand der Schalter,
// nimmt Angaben für die spätere Einrichtung entgegen und zeigt, wie der Austausch aussehen würde –
// ohne dass irgendetwas zwischen den beiden Systemen übertragen wird.
import { useEffect, useMemo, useState } from "react";
import { Btn, Chip, Feld, Karte, Kopf, Note, Tabs, kopiere } from "../ui/kit";
import { usePv } from "../state/store";
import { baueAuftragFeed, type SchnittstelleStatus } from "@/lib/neu/schnittstelle";

type Tab = "stand" | "auftraege" | "stunden";

export function AdminSchnittstelle() {
  const { s, set, melde, echt } = usePv();
  const [tab, setTab] = useState<Tab>("stand");
  const [status, setStatus] = useState<SchnittstelleStatus | null>(null);
  const cfg = s.einst.schnittstelle;
  const istAdmin = !echt || echt.rolle === "admin";

  useEffect(() => {
    let weg = false;
    fetch("/api/neu/schnittstelle/status", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SchnittstelleStatus | null) => !weg && setStatus(j))
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, []);

  const feed = useMemo(() => JSON.stringify(baueAuftragFeed(s.jobs.slice(0, 3), s.zuweisung, s.crew, new Date().toISOString()), null, 2), [s.jobs, s.zuweisung, s.crew]);
  const aendere = (patch: Partial<typeof cfg>) => set((st) => ({ ...st, einst: { ...st.einst, schnittstelle: { ...st.einst.schnittstelle, ...patch } } }));

  if (!istAdmin) return <Note ton="warn">Nur die Administration sieht die Schnittstelle.</Note>;

  return (
    <>
      <Kopf eyebrow="System" titel="Schnittstelle zum bisherigen System" sub="Vorbereitet, aber ausgeschaltet. Solange sie aus ist, tauschen das bisherige und das neue System keine Daten aus." />
      <div className="pv-card" style={{ borderLeft: "6px solid var(--ok)" }} data-testid="schnittstelle-status">
        <div className="row between">
          <div><div className="eyebrow">Zustand</div><h2 className="mt1">AUS – es fließen keine Daten</h2></div>
          <Chip ton="gut">Parallelbetrieb getrennt</Chip>
        </div>
        <div className="small mt2">
          Umgebungsschalter <span className="mono">NEU_SCHNITTSTELLE</span>: <b data-testid="status-umgebung">{status ? (status.umgebung ? "an" : "aus") : "…"}</b> · Schalter hier: <b>{cfg.aktiv ? "vorgemerkt" : "aus"}</b> · Ablauf in dieser Version: <b>noch nicht eingebaut</b>
        </div>
        <div className="small muted mt1">Selbst wenn beide Schalter an wären, tut diese Version nichts: die beiden Adressen der Schnittstelle antworten dann nur „noch nicht eingebaut“. Eingeschaltet wird erst, wenn wir den Ablauf gemeinsam getestet haben.</div>
      </div>

      <div className="mt3"><Tabs wert={tab} onChange={setTab} tabs={[{ id: "stand", label: "Einrichtung vorbereiten" }, { id: "auftraege", label: "Aufträge → bisheriges System" }, { id: "stunden", label: "Stunden ← Einsatzzettel" }]} /></div>

      {tab === "stand" ? (
        <div className="pva-grid c2 mt2">
          <Karte titel="Was später zwischen den Systemen laufen soll">
            <label className="pv-check"><input type="checkbox" checked={cfg.auftraegeAnAltesSystem} onChange={(e) => aendere({ auftraegeAnAltesSystem: e.target.checked })} />Aufträge aus dem neuen System ziehen (das bisherige System holt sie ab)</label>
            <label className="pv-check mt1"><input type="checkbox" checked={cfg.stundenVomAltenSystem} onChange={(e) => aendere({ stundenVomAltenSystem: e.target.checked })} />Stunden aus den Einsatzzettel-PDFs übernehmen (Lesezugriff auf die Ablage)</label>
            <label className="pv-check mt1"><input type="checkbox" checked={cfg.aktiv} onChange={(e) => aendere({ aktiv: e.target.checked })} data-testid="schalter-vormerken" />Schalter vormerken (wirkt erst, wenn auch <span className="mono">NEU_SCHNITTSTELLE=an</span> gesetzt ist)</label>
            <div className="pv-hint">Diese Haken speichern nur deine Vorgaben für später. Sie schalten nichts ein.</div>
          </Karte>
          <Karte titel="Wo liegen die Einsatzzettel-PDFs?">
            <Feld label="Art der Ablage">
              <select className="pv-select" aria-label="Art der Ablage" value={cfg.pdfQuelle.art} onChange={(e) => aendere({ pdfQuelle: { ...cfg.pdfQuelle, art: e.target.value as typeof cfg.pdfQuelle.art } })}>
                <option value="keine">noch unklar</option>
                <option value="verzeichnis">Verzeichnis / Volume auf dem Server</option>
                <option value="s3">S3-kompatibler Speicher</option>
                <option value="http">Adresse des bisherigen Systems (HTTP)</option>
              </select>
            </Feld>
            <Feld label="Pfad / Bucket / Adresse (ohne Zugangsdaten!)"><input className="pv-input" aria-label="Pfad" value={cfg.pdfQuelle.pfad} onChange={(e) => aendere({ pdfQuelle: { ...cfg.pdfQuelle, pfad: e.target.value } })} /></Feld>
            <Feld label="Notizen für die Umsetzung"><textarea className="pv-textarea" aria-label="Notizen" value={cfg.notiz} onChange={(e) => aendere({ notiz: e.target.value })} /></Feld>
            <div className="pv-hint">Zugangsdaten gehören nie hierher, sondern als Umgebungsvariablen auf den Server.</div>
          </Karte>
          <Karte titel="Damit nichts versehentlich fließt">
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>Zwei Schalter nötig: Umgebungsvariable auf dem Server und dieser Haken.</li>
              <li>Die Adressen sind für Anmeldung gesperrt und antworten ohne Umgebungsschalter wie „nicht vorhanden“.</li>
              <li>Das neue System greift nicht auf Tabellen des bisherigen Systems zu – nur auf eigene Tabellen und die Konten (Anmeldung).</li>
              <li>Der Zugriff auf die PDF-Ablage wäre nur lesend; nichts im bisherigen System wird verändert.</li>
              <li>Übernommene Stunden kämen immer als „offen“ in die Stundentabelle und werden von einem Menschen geprüft.</li>
            </ul>
          </Karte>
          <Karte titel="Noch zu klären, bevor es losgeht">
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>Wo liegen die PDFs genau, und wie bekommt das neue System Lesezugriff?</li>
              <li>Soll das bisherige System die Aufträge abholen (Pull) oder das neue sie senden (Push)?</li>
              <li>Welche Personalnummer steht auf dem Zettel – dieselbe wie im Personalstamm?</li>
              <li>Wie erkennen wir, welcher Auftrag zu welcher PDF gehört (Auftragsnummer auf dem Zettel)?</li>
              <li>Welche Angaben vom Zettel sollen übernommen werden: nur Zeiten und Pausen oder auch Bemerkungen?</li>
            </ul>
          </Karte>
        </div>
      ) : null}

      {tab === "auftraege" ? (
        <Karte titel="So sähen die Aufträge für das bisherige System aus">
          <p className="small">Nur zur Ansicht, berechnet in deinem Browser aus den ersten drei Aufträgen – es wird nichts übertragen. Entwürfe sind nie enthalten; Besetzung nur mit Personalnummer und Name.</p>
          <pre className="mono small mt2" style={{ background: "var(--mist)", padding: "0.8rem", borderRadius: 8, maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap" }} data-testid="feed-vorschau">{feed}</pre>
          <div className="mt2"><Btn v="sec" groesse="sm" onClick={async () => melde((await kopiere(feed)) ? "Kopiert." : "Kopieren nicht möglich.")}>Kopieren</Btn></div>
        </Karte>
      ) : null}

      {tab === "stunden" ? (
        <Karte titel="So würden Stunden aus den Einsatzzetteln ankommen">
          <ol className="small" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>Das neue System liest (nur lesend) die PDFs aus der Ablage und merkt sich je Datei einen Fingerabdruck – dieselbe Datei zählt nie doppelt.</li>
            <li>Aus jeder PDF kommen Personalnummer, Datum, Beginn, Ende und Pausen je Person und die Auftragsnummer.</li>
            <li>Unbekannte Personalnummern werden gemeldet, nicht geraten.</li>
            <li>Die Zeilen landen in der Stundentabelle als <b>„offen“</b> mit Quelle „Zettel“ und Verweis auf die PDF.</li>
            <li>Ein Mensch prüft und gibt frei – wie bei allen Stunden. Danach läuft der bekannte Export zu zvoove.</li>
          </ol>
          <div className="mt2"><Note>Das Auslesen der PDF-Layouts ist noch nicht gebaut; dafür brauchen wir ein paar Beispiel-PDFs aus der Ablage.</Note></div>
        </Karte>
      ) : null}
    </>
  );
}
