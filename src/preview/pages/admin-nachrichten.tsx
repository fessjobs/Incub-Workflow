"use client";
// Nachrichten: für jede Person eine vorgefertigte Nachricht mit persönlichem Link.
// Es wird nichts automatisch verschickt – kopieren oder WhatsApp mit vorbereitetem Text öffnen,
// selbst senden und optional als „gesendet“ markieren.
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, neueAudit, HEUTE } from "../state/store";
import { Btn, Chip, Feld, Karte, Kopf, Note, Stat, kopiere, ladeTextHerunter } from "../ui/kit";
import { brauchtLink, fuelleVorlage, waLink, PLATZHALTER } from "../logic/nachricht";
import { csv } from "../logic/kleidung";
import { freigabeStand } from "../logic/freigabe";
import { formatDatumDE } from "../logic/zeit";
import type { Crew } from "../logic/types";
import type { NachrichtVorlage } from "../logic/einstellungen-neu";
import { EINLADUNG_TEXT } from "../logic/einstellungen-neu";
import { neueId } from "./formulare";
import { vollName } from "./helfer";
import { bearbeiter } from "./stunden-aktionen";

type Gruppe = "ohne-fragebogen" | "wartet" | "freigegeben" | "alle";

const GRUPPEN: Array<{ id: Gruppe; label: string }> = [
  { id: "ohne-fragebogen", label: "Fragebogen noch offen" },
  { id: "wartet", label: "Warten auf Freigabe" },
  { id: "freigegeben", label: "Freigegeben" },
  { id: "alle", label: "Alle (ohne Ausgeschiedene)" },
];

export function AdminNachrichten() {
  const { s, set, melde, echt, basis } = usePv();
  const istAdmin = echt?.rolle === "admin";
  const vorlagen: NachrichtVorlage[] = useMemo(() => [{ id: "einladung", name: "Einladung zum Fragebogen", text: s.einst.fragebogenLinkText }, ...s.einst.nachrichten], [s.einst.fragebogenLinkText, s.einst.nachrichten]);
  const [vorlageId, setVorlageId] = useState("einladung");
  const vorlage = vorlagen.find((v) => v.id === vorlageId) ?? vorlagen[0];
  const [text, setText] = useState(vorlage.text);
  const [gruppe, setGruppe] = useState<Gruppe>("ohne-fragebogen");
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Record<string, string>>({});
  const [tage, setTage] = useState(14);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const waehleVorlage = (id: string) => {
    setVorlageId(id);
    setText(vorlagen.find((v) => v.id === id)?.text ?? "");
  };

  const personen = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return s.crew
      .filter((c) => c.status !== "ausgeschieden")
      .filter((c) => {
        const st = freigabeStand(c, s.einst.schulung, HEUTE);
        if (gruppe === "ohne-fragebogen") return c.profile === null;
        if (gruppe === "wartet") return st === "wartet";
        if (gruppe === "freigegeben") return st === "freigegeben";
        return true;
      })
      .filter((c) => !q || `${vollName(c)} ${c.pnr} ${c.telefon}`.toLowerCase().includes(q));
  }, [s.crew, s.einst.schulung, gruppe, suche]);

  const auswahl = personen.filter((c) => gewaehlt.has(c.id));
  const mitLink = brauchtLink(text);
  const basisUrl = (basis ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const linkFuer = (c: Crew) => (links[c.id] ? `${basisUrl}${links[c.id]}` : "");
  const nachricht = (c: Crew) => fuelleVorlage(text, c, mitLink ? linkFuer(c) || "{link}" : "");
  const bereit = auswahl.length > 0 && (!mitLink || auswahl.every((c) => links[c.id]));

  const umschalten = (id: string) => setGewaehlt((g) => {
    const n = new Set(g);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const alle = personen.length > 0 && personen.every((c) => gewaehlt.has(c.id));

  const erzeugen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      // In Päckchen zu 250 Personen (der Server nimmt höchstens 300 je Anfrage).
      // Frisch angelegte Personen sind erst nach dem Speichern auf dem Server: kurz warten und erneut versuchen.
      let offen = auswahl.map((c) => c.id);
      for (let versuch = 0; versuch < 6 && offen.length > 0; versuch++) {
        const unbekannt: string[] = [];
        for (let i = 0; i < offen.length; i += 250) {
          const r = await fetch("/api/neu/crew/invite-bulk", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ crewIds: offen.slice(i, i + 250), tage }) });
          const j = (await r.json().catch(() => null)) as { links?: Record<string, string>; unbekannt?: string[]; error?: string } | null;
          if (!r.ok || !j?.links) return setFehler(j?.error ?? "Links konnten nicht erzeugt werden.");
          setLinks((alt) => ({ ...alt, ...j.links }));
          unbekannt.push(...(j.unbekannt ?? []));
        }
        offen = unbekannt;
        if (offen.length > 0 && versuch < 5) await new Promise((res) => setTimeout(res, 800));
      }
      if (offen.length > 0) setFehler(`${offen.length} Personen sind noch nicht gespeichert – bitte kurz warten und erneut erzeugen.`);
    } catch {
      setFehler("Links konnten nicht erzeugt werden.");
    } finally {
      setLaeuft(false);
    }
  };

  const markiere = (ids: string[]) => {
    const wer = echt?.benutzer ?? bearbeiter();
    set((st) => ({
      ...st,
      crew: st.crew.map((c) => (ids.includes(c.id) ? { ...c, kontakt: { vorlage: vorlage.name, am: HEUTE, von: wer } } : c)),
      audit: [...ids.map((id) => neueAudit(wer, "crew", id, "nachricht", "", `„${vorlage.name}“ bereitgestellt`, null)), ...st.audit],
    }));
    melde(`${ids.length} als gesendet markiert.`);
  };

  const speichereVorlage = () => {
    if (!istAdmin) return;
    if (vorlageId === "einladung") set((st) => ({ ...st, einst: { ...st.einst, fragebogenLinkText: text } }));
    else set((st) => ({ ...st, einst: { ...st.einst, nachrichten: st.einst.nachrichten.map((v) => (v.id === vorlageId ? { ...v, text } : v)) } }));
    melde("Vorlage gespeichert.");
  };
  const neueVorlage = () => {
    const name = window.prompt("Name der neuen Vorlage");
    if (!name?.trim()) return;
    const v: NachrichtVorlage = { id: neueId("v"), name: name.trim().slice(0, 60), text };
    set((st) => ({ ...st, einst: { ...st.einst, nachrichten: [...st.einst.nachrichten, v] } }));
    setVorlageId(v.id);
  };
  const loescheVorlage = () => {
    if (vorlageId === "einladung") return;
    set((st) => ({ ...st, einst: { ...st.einst, nachrichten: st.einst.nachrichten.filter((v) => v.id !== vorlageId) } }));
    waehleVorlage("einladung");
  };

  const alleKopieren = async () => {
    const t = auswahl.map((c) => `${vollName(c)} (${c.telefon || "keine Nummer"})\n${nachricht(c)}`).join("\n\n");
    melde((await kopiere(t)) ? `${auswahl.length} Nachrichten kopiert.` : "Kopieren nicht möglich.");
  };
  const alsCsv = () => ladeTextHerunter(`nachrichten-${HEUTE}.csv`, csv([["Name", "Personalnummer", "Handy", "Nachricht"], ...auswahl.map((c) => [vollName(c), c.pnr, c.telefon, nachricht(c)])]));

  return (
    <>
      <Kopf eyebrow="Personal" titel="Nachrichten" sub="Eine vorgefertigte Nachricht je Person, mit persönlichem Link. Du schickst sie selbst per WhatsApp – hier wird nichts automatisch gesendet." />
      <div className="pva-grid c4">
        <Stat wert={s.crew.filter((c) => c.status !== "ausgeschieden").length} label="Personen im Stamm" />
        <Stat wert={s.crew.filter((c) => c.status !== "ausgeschieden" && c.profile === null).length} label="Fragebogen noch offen" ton="warn" />
        <Stat wert={s.crew.filter((c) => c.kontakt).length} label="schon angeschrieben" />
        <Stat wert={s.crew.filter((c) => c.status !== "ausgeschieden" && !c.telefon).length} label="ohne Handynummer" ton="warn" />
      </div>

      <div className="pva-grid c2 mt3">
        <Karte titel="1 · Vorlage">
          <Feld label="Vorlage"><select className="pv-select" aria-label="Vorlage" value={vorlageId} onChange={(e) => waehleVorlage(e.target.value)}>{vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Feld>
          <Feld label="Text" hint={`Platzhalter: ${PLATZHALTER.join(" ")}. {link} ist der persönliche Link der Person.`}>
            <textarea className="pv-textarea" style={{ minHeight: 120 }} aria-label="Nachrichtentext" data-testid="nachricht-text" value={text} onChange={(e) => setText(e.target.value)} />
          </Feld>
          {istAdmin ? (
            <div className="row wrap">
              <Btn v="sec" groesse="sm" onClick={speichereVorlage} disabled={text === vorlage.text}>Vorlage speichern</Btn>
              <Btn v="sec" groesse="sm" onClick={neueVorlage}>Als neue Vorlage</Btn>
              {vorlageId !== "einladung" ? <Btn v="ghost" groesse="sm" onClick={loescheVorlage}>Vorlage löschen</Btn> : <Btn v="ghost" groesse="sm" onClick={() => setText(EINLADUNG_TEXT)}>Standardtext</Btn>}
            </div>
          ) : <div className="small muted">Änderungen am Text gelten nur für diese Sitzung; Vorlagen speichert die Administration.</div>}
        </Karte>

        <Karte titel="2 · Empfänger">
          <div className="row wrap">
            {GRUPPEN.map((g) => <button key={g.id} type="button" className={`pv-btn ${gruppe === g.id ? "navy" : "sec"} sm`} aria-pressed={gruppe === g.id} onClick={() => { setGruppe(g.id); setGewaehlt(new Set()); }}>{g.label}</button>)}
          </div>
          <input className="pv-input mt2" placeholder="Name, Nummer oder Handy suchen" aria-label="Suche" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div className="small muted mt1">{personen.length} Personen in dieser Auswahl, {auswahl.length} ausgewählt.</div>
          <div className="pv-card flat mt1" style={{ maxHeight: 220, overflow: "auto", padding: "0.4rem 0.6rem" }} data-testid="empfaenger">
            <label className="pv-check"><input type="checkbox" checked={alle} onChange={() => setGewaehlt(alle ? new Set() : new Set(personen.map((c) => c.id)))} aria-label="Alle auswählen" /><b>Alle auswählen</b></label>
            {personen.map((c) => (
              <label key={c.id} className="pv-check"><input type="checkbox" checked={gewaehlt.has(c.id)} onChange={() => umschalten(c.id)} aria-label={vollName(c)} /><span>{vollName(c)} <span className="tiny muted mono">{c.pnr}</span>{!c.telefon ? <Chip ton="warn">keine Nummer</Chip> : null}{c.kontakt ? <span className="tiny muted"> · zuletzt „{c.kontakt.vorlage}“ {formatDatumDE(c.kontakt.am)}</span> : null}</span></label>
            ))}
            {personen.length === 0 ? <div className="muted small">Niemand in dieser Auswahl.</div> : null}
          </div>
        </Karte>
      </div>

      <Karte titel="3 · Nachrichten" aktionen={
        <span className="row wrap">
          {mitLink ? <>
            <select className="pv-select sm" aria-label="Gültigkeit" value={tage} onChange={(e) => setTage(Number(e.target.value))}><option value={7}>Links gültig 7 Tage</option><option value={14}>14 Tage</option><option value={30}>30 Tage</option><option value={60}>60 Tage</option></select>
            <Btn groesse="sm" onClick={erzeugen} disabled={auswahl.length === 0 || laeuft} data-testid="links-erzeugen">{laeuft ? "Erzeuge …" : `Links erzeugen (${auswahl.length})`}</Btn>
          </> : null}
          <Btn v="sec" groesse="sm" onClick={alleKopieren} disabled={!bereit}>Alle kopieren</Btn>
          <Btn v="sec" groesse="sm" onClick={alsCsv} disabled={!bereit}>CSV</Btn>
          <Btn v="sec" groesse="sm" onClick={() => markiere(auswahl.map((c) => c.id))} disabled={!bereit} data-testid="alle-gesendet">Alle als gesendet markieren</Btn>
        </span>
      }>
        {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
        {auswahl.length === 0 ? <div className="muted">Wähle oben Personen aus.</div> : null}
        {mitLink && auswahl.length > 0 && !bereit ? <Note>Diese Vorlage enthält einen persönlichen Link. Mit „Links erzeugen“ bekommt jede ausgewählte Person ihren eigenen. Der Link gilt {tage} Tage und kann nur von der Person selbst genutzt werden – bitte nicht weiterleiten.</Note> : null}
        {bereit ? (
          <div className="col mt2" data-testid="nachrichten-liste">
            {auswahl.length > 150 ? <Note>{auswahl.length} Nachrichten sind fertig. Angezeigt werden die ersten 150 – „Alle kopieren“ und „CSV“ enthalten alle.</Note> : null}
            {auswahl.slice(0, 150).map((c) => {
              const n = nachricht(c);
              const wa = waLink(c.telefon, n);
              return (
                <div key={c.id} className="pv-card flat" style={{ background: "var(--mist)" }}>
                  <div className="row between">
                    <span><b>{vollName(c)}</b> <span className="tiny muted mono">{c.pnr} · {c.telefon || "keine Nummer"}</span></span>
                    {c.kontakt && c.kontakt.am === HEUTE ? <Chip ton="gut">heute markiert</Chip> : null}
                  </div>
                  <div className="small mt1" style={{ whiteSpace: "pre-wrap" }}>{n}</div>
                  <div className="row wrap mt2">
                    <Btn groesse="sm" onClick={async () => melde((await kopiere(n)) ? `Nachricht für ${c.vorname} kopiert.` : "Kopieren nicht möglich.")} data-testid={`kopieren-${c.pnr}`}>Kopieren</Btn>
                    {wa ? <a className="pv-btn sec sm" href={wa} target="_blank" rel="noopener noreferrer" data-testid={`whatsapp-${c.pnr}`}>In WhatsApp öffnen</a> : <Chip ton="warn">Handynummer prüfen</Chip>}
                    <Btn v="ghost" groesse="sm" onClick={() => markiere([c.id])}>Als gesendet markieren</Btn>
                    <Link href={`/admin/crew/${c.id}`} className="small">Profil</Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="small muted mt2">„In WhatsApp öffnen“ öffnet den Chat mit vorgeschriebenem Text; abgeschickt wird erst, wenn du in WhatsApp auf Senden tippst.</div>
      </Karte>
    </>
  );
}
