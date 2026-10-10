"use client";
// Formulare zum Anlegen und Bearbeiten (Person, Auftrag) und die Einladung zum
// Fragebogen. Gelten im echten System; im Prototyp wirken sie nur im Browser-Tab.
import { useState } from "react";
import { usePv, neueAudit, HEUTE, type PvState } from "../state/store";
import { Btn, Chip, Feld, Modal, Note, kopiere } from "../ui/kit";
import type { Contract, Crew, Job, Schicht, Taetigkeit, Vertragsart } from "../logic/types";
import { TAETIGKEITEN } from "../logic/types";
import { geocodePlz, naechsterPool } from "../logic/geo";
import { normalizeTime } from "../logic/zeit";
import { vollName } from "./helfer";
import { bearbeiter } from "./stunden-aktionen";
import { MODUL_IDS } from "../logic/unterweisung";

const STANDARD_WOCHENSTUNDEN: Record<Vertragsart, number> = { Minijob: 10, kurzfristig: 30, Werkstudent: 20, TZ: 25, VZ: 40 };

export function neueId(vorsatz: string): string {
  return `${vorsatz}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Vorläufige Nummer für Bewerber ohne Personalnummer: B0001, B0002 …
export function naechsteBewerberNr(crew: Crew[]): string {
  let max = 0;
  for (const c of crew) {
    const m = /^B(\d+)$/.exec(c.pnr);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `B${String(max + 1).padStart(4, "0")}`;
}

function benutzer(echtBenutzer?: string): string {
  return echtBenutzer ?? bearbeiter();
}

// Personalnummer ändern: alles, was auf die alte Nummer zeigt, zieht mit
export function benenneNummer(st: PvState, alt: string, neu: string): PvState {
  if (alt === neu) return st;
  return {
    ...st,
    bewerbungen: st.bewerbungen.map((b) => (b.pnr === alt ? { ...b, pnr: neu } : b)),
    stunden: st.stunden.map((r) => (r.pnr === alt ? { ...r, pnr: neu } : r)),
    belege: st.belege.map((b) => (b.pnr === alt ? { ...b, pnr: neu } : b)),
    zuweisung: Object.fromEntries(Object.entries(st.zuweisung).map(([k, v]) => [k, v.some((z) => z.pnr === alt) ? v.map((z) => (z.pnr === alt ? { ...z, pnr: neu } : z)) : v])),
  };
}

// ─── Person ─────────────────────────────────────────────────────────────────

export function PersonModal({ person, onClose, nachAnlegen }: { person?: Crew; onClose: () => void; nachAnlegen?: (c: Crew) => void }) {
  const { s, set, melde, echt } = usePv();
  const [vorname, setVorname] = useState(person?.vorname ?? "");
  const [nachname, setNachname] = useState(person?.nachname ?? "");
  const [pnr, setPnr] = useState(person?.pnr && !/^B\d+$/.test(person.pnr) ? person.pnr : "");
  const [telefon, setTelefon] = useState(person?.telefon ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [plz, setPlz] = useState(person?.plz ?? "");
  const [wohnort, setWohnort] = useState(person?.wohnort ?? "");
  const [status, setStatus] = useState<Crew["status"]>(person?.status ?? "Bewerber");
  const [vertragAn, setVertragAn] = useState(Boolean(person?.contract));
  const v = person?.contract;
  const [art, setArt] = useState<Vertragsart>(v?.vertragsart ?? "Minijob");
  const [wochenstunden, setWochenstunden] = useState(String(v?.wochenstunden ?? 10));
  const [lohn, setLohn] = useState(String(v?.stundenlohn ?? "13.90"));
  const [von, setVon] = useState(v?.gueltigVon ?? HEUTE);
  const [bis, setBis] = useState(v?.gueltigBis ?? "");
  const [grenzeStd, setGrenzeStd] = useState(v?.monatsgrenzeStd !== null && v?.monatsgrenzeStd !== undefined ? String(v.monatsgrenzeStd) : "");
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = () => {
    const nr = pnr.trim().toUpperCase() || person?.pnr || naechsteBewerberNr(s.crew);
    if (!vorname.trim() || !nachname.trim()) return setFehler("Vor- und Nachname fehlen.");
    if (s.crew.some((c) => c.id !== person?.id && c.pnr === nr)) return setFehler(`Die Personalnummer ${nr} gibt es schon.`);
    if (plz && !/^\d{5}$/.test(plz.trim())) return setFehler("Die Postleitzahl hat 5 Ziffern.");
    let contract: Contract | null = null;
    if (vertragAn) {
      const lohnZahl = Number(lohn.replace(",", "."));
      const wochen = Number(wochenstunden.replace(",", "."));
      if (!Number.isFinite(lohnZahl) || lohnZahl <= 0) return setFehler("Bitte einen Stundenlohn eintragen.");
      if (!Number.isFinite(wochen) || wochen < 0) return setFehler("Bitte die Wochenstunden eintragen.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(von)) return setFehler("Bitte „gültig von“ als Datum eintragen.");
      if (bis && bis < von) return setFehler("„Gültig bis“ liegt vor „gültig von“.");
      const grenze = grenzeStd.trim() === "" ? null : Number(grenzeStd.replace(",", "."));
      if (grenze !== null && !Number.isFinite(grenze)) return setFehler("Die Monatsgrenze ist keine Zahl.");
      contract = {
        vertragsart: art, wochenstunden: wochen, stundenlohn: lohnZahl, gueltigVon: von, gueltigBis: bis || null, docusignId: v?.docusignId ?? "",
        monatsgrenzeEur: art === "Minijob" ? s.einst.minijobEur : null,
        monatsgrenzeStd: grenze ?? (art === "Minijob" ? Math.floor(s.einst.minijobEur / lohnZahl) : null),
      };
    }
    const ort = geocodePlz(plz);
    const id = person?.id ?? neueId("c");
    const basis: Crew = person ?? { id, pnr: nr, vorname: "", nachname: "", telefon: "", email: "", wohnort: "", plz: "", pool: "Stuttgart", status, xp: 0, einsaetze: 0, arbeitstageJahr: 0, profile: null, contract: null, unterweisungen: {}, ratings: [], notizen: "" };
    const neu: Crew = { ...basis, pnr: nr, vorname: vorname.trim(), nachname: nachname.trim(), telefon: telefon.trim(), email: email.trim(), plz: plz.trim(), wohnort: wohnort.trim(), pool: ort ? naechsterPool(ort).pool : basis.pool, status, contract };
    set((st) => {
      let n: PvState = { ...st, crew: person ? st.crew.map((c) => (c.id === id ? neu : c)) : [...st.crew, neu] };
      if (person) n = benenneNummer(n, person.pnr, nr);
      return { ...n, audit: [neueAudit(benutzer(echt?.benutzer), "crew", id, person ? "person" : "anlage", "", person ? "bearbeitet" : "angelegt", null), ...n.audit] };
    });
    melde(person ? "Gespeichert." : `${neu.vorname} ${neu.nachname} angelegt (${nr}).`);
    onClose();
    nachAnlegen?.(neu);
  };

  return (
    <Modal titel={person ? `${vollName(person)} bearbeiten` : "Person anlegen"} onClose={onClose} wide fuss={<><Btn v="sec" onClick={onClose}>Abbrechen</Btn><Btn onClick={speichern} data-testid="person-speichern">Speichern</Btn></>}>
      <div className="pva-grid c2">
        <Feld label="Vorname *"><input className="pv-input" aria-label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} autoFocus /></Feld>
        <Feld label="Nachname *"><input className="pv-input" aria-label="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} /></Feld>
        <Feld label="Personalnummer" hint="Leer lassen: es wird eine vorläufige Nummer vergeben (B0001 …), die später änderbar ist."><input className="pv-input mono" aria-label="Personalnummer" value={pnr} onChange={(e) => setPnr(e.target.value)} /></Feld>
        <Feld label="Status">
          <select className="pv-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Crew["status"])}>
            <option value="Bewerber">Bewerber</option><option value="aktiv">aktiv</option><option value="gesperrt">gesperrt</option><option value="ausgeschieden">ausgeschieden</option>
          </select>
        </Feld>
        <Feld label="Handy (WhatsApp)"><input className="pv-input" aria-label="Handy" value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Feld>
        <Feld label="E-Mail"><input className="pv-input" aria-label="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} /></Feld>
        <Feld label="PLZ" hint="Bestimmt den nächsten Pool."><input className="pv-input mono" aria-label="PLZ" value={plz} maxLength={5} onChange={(e) => setPlz(e.target.value)} /></Feld>
        <Feld label="Wohnort"><input className="pv-input" aria-label="Wohnort" value={wohnort} onChange={(e) => setWohnort(e.target.value)} /></Feld>
      </div>
      <label className="pv-check mt2"><input type="checkbox" checked={vertragAn} onChange={(e) => setVertragAn(e.target.checked)} data-testid="vertrag-an" />Vertrag eintragen (Grundlage für Grenzen und Ampeln)</label>
      {vertragAn ? (
        <div className="pva-grid c3 mt2">
          <Feld label="Vertragsart">
            <select className="pv-select" aria-label="Vertragsart" value={art} onChange={(e) => { const a = e.target.value as Vertragsart; setArt(a); setWochenstunden(String(STANDARD_WOCHENSTUNDEN[a])); }}>
              {(["Minijob", "kurzfristig", "Werkstudent", "TZ", "VZ"] as Vertragsart[]).map((x) => <option key={x}>{x}</option>)}
            </select>
          </Feld>
          <Feld label="Wochenstunden"><input className="pv-input mono" aria-label="Wochenstunden" value={wochenstunden} onChange={(e) => setWochenstunden(e.target.value)} /></Feld>
          <Feld label="Stundenlohn (€)"><input className="pv-input mono" aria-label="Stundenlohn" value={lohn} onChange={(e) => setLohn(e.target.value)} /></Feld>
          <Feld label="Gültig von"><input className="pv-input" type="date" aria-label="Gültig von" value={von} onChange={(e) => setVon(e.target.value)} /></Feld>
          <Feld label="Gültig bis (leer = unbefristet)"><input className="pv-input" type="date" aria-label="Gültig bis" value={bis} onChange={(e) => setBis(e.target.value)} /></Feld>
          <Feld label="Monatsgrenze (Std)" hint="Leer: beim Minijob aus der Verdienstgrenze berechnet."><input className="pv-input mono" aria-label="Monatsgrenze Stunden" value={grenzeStd} onChange={(e) => setGrenzeStd(e.target.value)} /></Feld>
        </div>
      ) : null}
      {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
    </Modal>
  );
}

// ─── Auftrag ────────────────────────────────────────────────────────────────

interface SchichtEingabe {
  bezeichnung: string;
  taetigkeit: Taetigkeit;
  datum: string;
  start: string;
  ende: string;
  bedarf: string;
}

export function naechsteAuftragsNr(st: PvState): string {
  const jahr = HEUTE.slice(0, 4);
  let max = 0;
  for (const id of [...st.jobs.map((j) => j.id), ...st.auftraege.map((a) => a.id)]) {
    const m = new RegExp(`^AUF-${jahr}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `AUF-${jahr}-${String(max + 1).padStart(4, "0")}`;
}

export function AuftragModal({ onClose }: { onClose: () => void }) {
  const { s, set, melde, echt } = usePv();
  const [titel, setTitel] = useState("");
  const [kunde, setKunde] = useState("");
  const [ort, setOrt] = useState("");
  const [plz, setPlz] = useState("");
  const [von, setVon] = useState(HEUTE);
  const [bis, setBis] = useState(HEUTE);
  const [beschreibung, setBeschreibung] = useState("");
  const [dresscode, setDresscode] = useState("Arbeitskleidung, wetterfest");
  const [psa, setPsa] = useState("");
  const [hoehe, setHoehe] = useState(false);
  const [verpflegung, setVerpflegung] = useState("");
  const [parken, setParken] = useState("");
  const [treffpunkt, setTreffpunkt] = useState("");
  const [veroeffentlichen, setVeroeffentlichen] = useState(false);
  const [zusatz, setZusatz] = useState<string[]>([]);
  const [schichten, setSchichten] = useState<SchichtEingabe[]>([{ bezeichnung: "Schicht 1", taetigkeit: "Stagehand", datum: HEUTE, start: "08:00", ende: "16:00", bedarf: "5" }]);
  const [fehler, setFehler] = useState<string | null>(null);
  const kunden = [...new Set(s.auftraege.map((a) => a.kunde))].sort();

  const aendere = (i: number, patch: Partial<SchichtEingabe>) => setSchichten((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));

  const speichern = () => {
    if (!titel.trim() || !kunde.trim() || !ort.trim()) return setFehler("Titel, Kunde und Ort fehlen.");
    if (!/^\d{5}$/.test(plz.trim())) return setFehler("Bitte die 5-stellige Postleitzahl des Einsatzorts eintragen (für die Fahrzeit).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis) || bis < von) return setFehler("Bitte Datum von/bis prüfen.");
    if (schichten.length === 0) return setFehler("Mindestens eine Schicht eintragen.");
    const id = naechsteAuftragsNr(s);
    const fertige: Schicht[] = [];
    for (const [i, x] of schichten.entries()) {
      const a = normalizeTime(x.start);
      const e = normalizeTime(x.ende);
      const b = Number(x.bedarf);
      if (!x.bezeichnung.trim() || !a || !e) return setFehler(`Schicht ${i + 1}: Bezeichnung und Uhrzeiten prüfen.`);
      if (!Number.isInteger(b) || b < 1) return setFehler(`Schicht ${i + 1}: Bedarf als ganze Zahl eintragen.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.datum)) return setFehler(`Schicht ${i + 1}: Datum prüfen.`);
      fertige.push({ id: `${id}-s${i + 1}`, bezeichnung: x.bezeichnung.trim(), datum: x.datum, start: a, ende: e, taetigkeit: x.taetigkeit, bedarf: b });
    }
    const job: Job = {
      id, kunde: kunde.trim(), titel: titel.trim(), ort: ort.trim(), plz: plz.trim(), datumVon: von, datumBis: bis, schichten: fertige, beschreibung: beschreibung.trim(), dresscode: dresscode.trim(),
      psa: psa.split(",").map((x) => x.trim()).filter(Boolean), hoehe, verpflegung: verpflegung.trim(), parken: parken.trim(), treffpunkt: treffpunkt.trim(), ansprechpartner: "Wird nach der Bestätigung freigeschaltet",
      ablauf: ["Ankommen und Einweisung durch den Teamleiter", "Sicherheitsunterweisung vor Ort durch den Entleiher", "Pausen nach Absprache, Zettel am Ende der Schicht"], status: veroeffentlichen ? "offen" : "Entwurf", quelle: "manuell",
      ...(zusatz.length > 0 ? { zusatzModule: zusatz } : {}),
    };
    set((st) => ({
      ...st,
      jobs: [...st.jobs, job],
      auftraege: [...st.auftraege, { id, kunde: job.kunde, titel: job.titel, taetigkeit: fertige[0].taetigkeit }],
      audit: [neueAudit(benutzer(echt?.benutzer), "job", id, "anlage", "", `Auftrag ${job.titel} angelegt`, null), ...st.audit],
    }));
    melde(`Auftrag ${id} angelegt${veroeffentlichen ? " und im Job-Board veröffentlicht" : " (Entwurf, noch nicht im Job-Board)"}.`);
    onClose();
  };

  return (
    <Modal titel="Auftrag anlegen" onClose={onClose} wide fuss={<><Btn v="sec" onClick={onClose}>Abbrechen</Btn><Btn onClick={speichern} data-testid="auftrag-speichern">Auftrag anlegen</Btn></>}>
      <div className="pva-grid c2">
        <Feld label="Titel *"><input className="pv-input" aria-label="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus /></Feld>
        <Feld label="Kunde *"><input className="pv-input" aria-label="Kunde" list="neu-kunden" value={kunde} onChange={(e) => setKunde(e.target.value)} /><datalist id="neu-kunden">{kunden.map((k) => <option key={k} value={k} />)}</datalist></Feld>
        <Feld label="Ort *"><input className="pv-input" aria-label="Ort" value={ort} onChange={(e) => setOrt(e.target.value)} /></Feld>
        <Feld label="PLZ des Einsatzorts *"><input className="pv-input mono" aria-label="PLZ des Einsatzorts" maxLength={5} value={plz} onChange={(e) => setPlz(e.target.value)} /></Feld>
        <Feld label="Von"><input className="pv-input" type="date" aria-label="Datum von" value={von} onChange={(e) => { setVon(e.target.value); if (bis < e.target.value) setBis(e.target.value); setSchichten((x) => x.map((y) => (y.datum < e.target.value ? { ...y, datum: e.target.value } : y))); }} /></Feld>
        <Feld label="Bis"><input className="pv-input" type="date" aria-label="Datum bis" value={bis} min={von} onChange={(e) => setBis(e.target.value)} /></Feld>
      </div>
      <h4 className="mt2">Schichten</h4>
      <div className="col mt1">
        {schichten.map((x, i) => (
          <div key={i} className="row wrap" style={{ alignItems: "flex-end" }}>
            <Feld label={i === 0 ? "Bezeichnung" : undefined}><input className="pv-input sm" style={{ width: 150 }} aria-label={`Schicht ${i + 1} Bezeichnung`} value={x.bezeichnung} onChange={(e) => aendere(i, { bezeichnung: e.target.value })} /></Feld>
            <Feld label={i === 0 ? "Tätigkeit" : undefined}><select className="pv-select sm" aria-label={`Schicht ${i + 1} Tätigkeit`} value={x.taetigkeit} onChange={(e) => aendere(i, { taetigkeit: e.target.value as Taetigkeit })}>{TAETIGKEITEN.map((t) => <option key={t}>{t}</option>)}</select></Feld>
            <Feld label={i === 0 ? "Datum" : undefined}><input className="pv-input sm" type="date" aria-label={`Schicht ${i + 1} Datum`} value={x.datum} min={von} max={bis} onChange={(e) => aendere(i, { datum: e.target.value })} /></Feld>
            <Feld label={i === 0 ? "Start" : undefined}><input className="pv-input sm mono" style={{ width: 70 }} aria-label={`Schicht ${i + 1} Start`} value={x.start} onChange={(e) => aendere(i, { start: e.target.value })} /></Feld>
            <Feld label={i === 0 ? "Ende" : undefined}><input className="pv-input sm mono" style={{ width: 70 }} aria-label={`Schicht ${i + 1} Ende`} value={x.ende} onChange={(e) => aendere(i, { ende: e.target.value })} /></Feld>
            <Feld label={i === 0 ? "Bedarf" : undefined}><input className="pv-input sm mono" style={{ width: 60 }} aria-label={`Schicht ${i + 1} Bedarf`} value={x.bedarf} onChange={(e) => aendere(i, { bedarf: e.target.value })} /></Feld>
            {schichten.length > 1 ? <Btn v="ghost" groesse="sm" onClick={() => setSchichten((y) => y.filter((_, j) => j !== i))} aria-label="Schicht entfernen" style={{ marginBottom: "0.9rem" }}>✕</Btn> : null}
          </div>
        ))}
        <Btn v="sec" groesse="sm" onClick={() => setSchichten((y) => [...y, { bezeichnung: `Schicht ${y.length + 1}`, taetigkeit: y[y.length - 1]?.taetigkeit ?? "Stagehand", datum: von, start: "08:00", ende: "16:00", bedarf: "5" }])}>+ Schicht</Btn>
      </div>
      <div className="pva-grid c2 mt2">
        <Feld label="Dresscode"><input className="pv-input" aria-label="Dresscode" value={dresscode} onChange={(e) => setDresscode(e.target.value)} /></Feld>
        <Feld label="Mitbringen (Komma getrennt)"><input className="pv-input" aria-label="Mitbringen" value={psa} placeholder="S3-Schuhe, Handschuhe" onChange={(e) => setPsa(e.target.value)} /></Feld>
        <Feld label="Treffpunkt"><input className="pv-input" aria-label="Treffpunkt" value={treffpunkt} onChange={(e) => setTreffpunkt(e.target.value)} /></Feld>
        <Feld label="Parken"><input className="pv-input" aria-label="Parken" value={parken} onChange={(e) => setParken(e.target.value)} /></Feld>
        <Feld label="Verpflegung"><input className="pv-input" aria-label="Verpflegung" value={verpflegung} onChange={(e) => setVerpflegung(e.target.value)} /></Feld>
      </div>
      <Feld label="Beschreibung"><textarea className="pv-textarea" aria-label="Beschreibung" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} /></Feld>
      <label className="pv-check"><input type="checkbox" checked={hoehe} onChange={(e) => setHoehe(e.target.checked)} />Arbeiten in der Höhe (Pflichtmodul „Höhe und Leitern“)</label>
      <div className="mt2">
        <div className="pv-label">Zusätzliche Pflicht-Schulungen nur für diesen Auftrag (optional)</div>
        <div className="row wrap" data-testid="zusatz-module">
          {MODUL_IDS.map((m) => <button key={m} type="button" className={`pv-chip ${zusatz.includes(m) ? "navy" : ""}`} style={{ border: 0, cursor: "pointer" }} aria-pressed={zusatz.includes(m)} onClick={() => setZusatz((z) => (z.includes(m) ? z.filter((x) => x !== m) : [...z, m]))}>{m}</button>)}
        </div>
        <div className="pv-hint">Die Grundregeln stehen unter Unterweisungen → Pflicht &amp; Videos.</div>
      </div>
      <label className="pv-check mt1"><input type="checkbox" checked={veroeffentlichen} onChange={(e) => setVeroeffentlichen(e.target.checked)} data-testid="veroeffentlichen" />Sofort im Job-Board für die Crew veröffentlichen</label>
      {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
    </Modal>
  );
}

// ─── Einladung zum Fragebogen ───────────────────────────────────────────────

export function EinladungModal({ person, onClose }: { person: Crew; onClose: () => void }) {
  const { s, melde, basis } = usePv();
  const [link, setLink] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const erzeugen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      // Eine eben angelegte Person ist erst nach dem Speichern auf dem Server – kurz abwarten
      for (let versuch = 0; versuch < 8; versuch++) {
        const r = await fetch("/api/neu/crew/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crewId: person.id }) });
        const j = (await r.json().catch(() => null)) as { pfad?: string; error?: string } | null;
        if (r.ok && j?.pfad) {
          setLink(`${(basis ?? window.location.origin).replace(/\/$/, "")}${j.pfad}`);
          return;
        }
        if (r.status !== 404) {
          setFehler(j?.error ?? "Link konnte nicht erzeugt werden.");
          return;
        }
        await new Promise((res) => setTimeout(res, 700));
      }
      setFehler("Die Person ist noch nicht gespeichert. Bitte kurz warten und noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  };
  const text = link ? s.einst.fragebogenLinkText.replace("{vorname}", person.vorname).replace("{link}", link) : "";

  return (
    <Modal titel={`Einladung für ${vollName(person)}`} onClose={onClose}>
      <p className="small">Mit dem persönlichen Link öffnet {person.vorname} den Fragebogen am Handy – ohne Passwort. Der Link gilt 14 Tage. Die Person sieht nur ihre eigenen Angaben.</p>
      {!link ? <div className="mt2"><Btn onClick={erzeugen} disabled={laeuft} data-testid="link-erzeugen">Link erzeugen</Btn></div> : (
        <div className="mt2">
          <label className="pv-label" htmlFor="einladung-text">Nachricht für WhatsApp</label>
          <textarea id="einladung-text" className="pv-textarea" readOnly value={text} data-testid="einladung-text" />
          <div className="row mt2"><Btn onClick={async () => melde((await kopiere(text)) ? "Nachricht kopiert." : "Kopieren nicht möglich – bitte per Hand markieren.")}>Nachricht kopieren</Btn><Chip ton="info">gültig 14 Tage</Chip></div>
        </div>
      )}
      {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
      <div className="mt2"><Note>Den Link bitte nur an {person.vorname} schicken. Wer ihn hat, kann in deren Namen den Fragebogen ausfüllen.</Note></div>
    </Modal>
  );
}
