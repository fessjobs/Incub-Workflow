"use client";
// Disposition (Modul G): Auftragsliste, Detailansicht mit Bewerbern links und
// Schichten rechts (Drag & Drop oder „Einplanen“), Passung, Konflikte mit
// Pflichtbegründung, automatisch Füllen, WhatsApp-Aushang, Beleg-Link, Briefing.
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, crewNachPnr, HEUTE } from "../state/store";
import { Bar, Btn, Chip, Initialen, Kopf, Modal, Note, Offen, Stat, Tabs, kopiere } from "../ui/kit";
import type { Crew, Job, JobStatus, Schicht } from "../logic/types";
import { addTage, formatDatumDE, tagNummer } from "../logic/zeit";
import { schichtStunden } from "../logic/passung";
import { autoFuellen, belegLinkFuer, besetzungSchicht, einplanKonflikte, entferne, plane, whatsappAushang, wochentag } from "./dispo-aktionen";
import { besetzt, bewertung, passungFuer, vollName } from "./helfer";
import { AuftragModal } from "./formulare";

const STATUS: JobStatus[] = ["Entwurf", "offen", "voll", "laufend", "abgerechnet"];

const TAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Wochenplan: alle Aufträge der aktuellen und der nächsten Woche mit Füllgrad
function Wochenplan() {
  const { s } = usePv();
  const dow = new Date(`${HEUTE}T12:00:00Z`).getUTCDay();
  const montag = addTage(HEUTE, -((dow + 6) % 7));
  const tage = Array.from({ length: 14 }, (_, i) => addTage(montag, i));
  return (
    <div className="pv-scroll" data-testid="wochenplan">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: "0.5rem", minWidth: 900 }}>
        {tage.map((d) => {
          const jobs = s.jobs.filter((j) => j.datumVon <= d && d <= j.datumBis);
          const heute = d === HEUTE;
          return (
            <div key={d} className="pv-card" style={{ padding: "0.5rem", minHeight: 110, borderColor: heute ? "var(--orange)" : undefined, background: tagNummer(d) < tagNummer(HEUTE) ? "#fafbfd" : undefined }}>
              <div className="row between small"><b>{TAG_KURZ[new Date(`${d}T12:00:00Z`).getUTCDay()]} {formatDatumDE(d).slice(0, 5)}</b>{heute ? <Chip ton="orange">heute</Chip> : null}</div>
              <div className="col gap1 mt1">
                {jobs.map((j) => {
                  const b = besetzt(s, j);
                  return (
                    <Link key={j.id} href={`/admin/dispo/${j.id}`} style={{ textDecoration: "none", background: "var(--mist)", borderRadius: 8, padding: "0.3rem 0.4rem", display: "block" }}>
                      <div className="tiny" style={{ fontWeight: 700, lineHeight: 1.2 }}>{j.titel}</div>
                      <Bar anteil={b.bedarf ? b.besetzt / b.bedarf : 0} ton={b.besetzt >= b.bedarf ? "gut" : b.besetzt / b.bedarf > 0.5 ? "warn" : "err"} />
                      <div className="tiny muted mono">{b.besetzt}/{b.bedarf}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminDispo() {
  const { s, melde } = usePv();
  const [ansicht, setAnsicht] = useState<"liste" | "woche">("liste");
  const [neuerAuftrag, setNeuerAuftrag] = useState(false);
  return (
    <>
      <Kopf
        eyebrow="Betrieb"
        titel="Disposition"
        sub="Aufträge aus „Planung Regios“ oder manuell – Bewerber auf Schichten einteilen."
        aktionen={<Btn onClick={() => setNeuerAuftrag(true)} data-testid="auftrag-anlegen">+ Auftrag anlegen</Btn>}
      />
      {neuerAuftrag ? <AuftragModal onClose={() => setNeuerAuftrag(false)} /> : null}
      <div className="pva-grid c4">
        <Stat wert={s.jobs.length} label="Aufträge" />
        <Stat wert={s.jobs.reduce((n, j) => n + besetzt(s, j).besetzt, 0)} label="Plätze besetzt" ton="gut" />
        <Stat wert={s.jobs.reduce((n, j) => n + Math.max(0, besetzt(s, j).bedarf - besetzt(s, j).besetzt), 0)} label="Plätze offen" ton="warn" />
        <Stat wert={s.bewerbungen.filter((a) => a.status === "neu").length} label="neue Bewerbungen" />
      </div>
      <div className="mt3"><Tabs wert={ansicht} onChange={setAnsicht} tabs={[{ id: "liste", label: "Aufträge", n: s.jobs.length }, { id: "woche", label: "Wochenplan" }]} /></div>
      {ansicht === "woche" ? <div className="mt2"><Wochenplan /></div> : null}
      <div className="pv-card pv-scroll mt3" style={{ padding: 0, display: ansicht === "liste" ? undefined : "none" }}>
        <table className="pv-table" data-testid="dispo-liste">
          <thead><tr><th>Auftrag</th><th>Kunde</th><th>Wann</th><th>Wo</th><th>Besetzung</th><th>Bewerber</th><th>Status</th><th>Quelle</th></tr></thead>
          <tbody>
            {s.jobs.map((j) => {
              const b = besetzt(s, j);
              return (
                <tr key={j.id} className="click">
                  <td><Link href={`/admin/dispo/${j.id}`} style={{ textDecoration: "none" }}><b>{j.titel}</b><div className="tiny muted mono">{j.id}</div></Link></td>
                  <td>{j.kunde}</td>
                  <td>{formatDatumDE(j.datumVon)}{j.datumBis !== j.datumVon ? ` – ${formatDatumDE(j.datumBis)}` : ""}</td>
                  <td className="small">{j.ort}</td>
                  <td style={{ minWidth: 130 }}><Bar anteil={b.bedarf ? b.besetzt / b.bedarf : 0} ton={b.besetzt >= b.bedarf ? "gut" : b.besetzt / b.bedarf > 0.5 ? "warn" : "err"} /><div className="tiny muted mono">{b.besetzt} von {b.bedarf}</div></td>
                  <td className="mono">{s.bewerbungen.filter((a) => a.jobId === j.id).length}</td>
                  <td><Chip ton={j.status === "offen" ? "gut" : j.status === "Entwurf" ? "warn" : undefined}>{j.status}</Chip></td>
                  <td className="small">{j.quelle}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row wrap mt2"><Offen>Anbindung „Planung Regios“: Format des Auftragsimports mit Daniel klären</Offen></div>
    </>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────

interface Anfrage {
  c: Crew;
  schicht: Schicht;
  konflikte: string[];
}

export function AdminDispoDetail({ id }: { id: string }) {
  const { s, set, melde, modus, basis } = usePv();
  const job = s.jobs.find((j) => j.id === id);
  const [aktiv, setAktiv] = useState<string>(job?.schichten[0]?.id ?? "");
  const [auchOhne, setAuchOhne] = useState(false);
  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState("");
  const [poolFilter, setPoolFilter] = useState("");
  const [ziehe, setZiehe] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const [anfrage, setAnfrage] = useState<Anfrage | null>(null);
  const [aushang, setAushang] = useState(false);
  const [belegLink, setBelegLink] = useState(false);

  const crewMap = useMemo(() => crewNachPnr(s), [s]);
  const schicht = job?.schichten.find((x) => x.id === aktiv) ?? job?.schichten[0];

  const eingeplantePnr = useMemo(() => {
    const set2 = new Set<string>();
    if (job) for (const sch of job.schichten) for (const z of s.zuweisung[sch.id] ?? []) set2.add(z.pnr);
    return set2;
  }, [s.zuweisung, job]);

  const kandidaten = useMemo(() => {
    if (!job || !schicht) return [];
    const bew = s.bewerbungen.filter((a) => a.jobId === job.id && a.status !== "abgelehnt");
    const pnrs = new Set(bew.map((a) => a.pnr));
    const personen: Crew[] = bew.map((a) => crewMap.get(a.pnr)).filter((c): c is Crew => Boolean(c));
    if (auchOhne) for (const c of s.crew) if (c.status === "aktiv" && !pnrs.has(c.pnr)) personen.push(c);
    const q = suche.trim().toLowerCase();
    return personen
      .filter((c) => !eingeplantePnr.has(c.pnr))
      .filter((c) => !q || `${vollName(c)} ${c.pnr}`.toLowerCase().includes(q))
      .filter((c) => !poolFilter || c.pool === poolFilter)
      .map((c) => ({ c, p: passungFuer(s, c, job, schicht), appl: bew.find((a) => a.pnr === c.pnr) }))
      .filter((x) => !katFilter || x.p.kategorie === katFilter)
      .sort((a, b) => b.p.score - a.p.score)
      .slice(0, 60);
  }, [s, job, schicht, crewMap, auchOhne, suche, katFilter, poolFilter, eingeplantePnr]);

  if (!job || !schicht) return <Note ton="err">Auftrag nicht gefunden.</Note>;
  const b = besetzt(s, job);

  const versuche = (pnr: string, schichtId: string) => {
    const c = crewMap.get(pnr);
    const sch = job.schichten.find((x) => x.id === schichtId);
    if (!c || !sch) return;
    const p = passungFuer(s, c, job, sch);
    const konflikte = einplanKonflikte(s, p, sch);
    if (konflikte.length > 0) setAnfrage({ c, schicht: sch, konflikte });
    else {
      set((st) => plane(st, job, sch.id, c.pnr, null));
      melde(`${vollName(c)} eingeplant: ${sch.bezeichnung}.`);
    }
  };

  return (
    <>
      <Kopf
        eyebrow={`${job.id} · ${job.quelle}`}
        titel={job.titel}
        sub={`${job.kunde} · ${job.ort} · ${formatDatumDE(job.datumVon)}${job.datumBis !== job.datumVon ? ` bis ${formatDatumDE(job.datumBis)}` : ""}`}
        aktionen={
          <>
            <Link href="/admin/dispo" className="pv-btn sec sm">← Aufträge</Link>
            <select className="pv-select sm" style={{ width: "auto" }} value={job.status} aria-label="Status des Auftrags" onChange={(e) => set((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === job.id ? { ...j, status: e.target.value as JobStatus } : j)) }))}>
              {STATUS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </>
        }
      />
      <div className="row wrap" style={{ marginBottom: "0.8rem" }}>
        <Btn onClick={() => { const r = autoFuellen(s, job); set(() => r.state); melde(`${r.eingeplant} Personen eingeplant. ${r.offen > 0 ? `${r.offen} Plätze bleiben offen – es gibt keine weiteren Bewerber ohne Konflikt.` : "Alle Plätze besetzt."}`); }} data-testid="auto-fuellen">Automatisch füllen</Btn>
        <Btn v="sec" onClick={() => setAushang(true)}>WhatsApp-Aushang</Btn>
        <Btn v="sec" onClick={() => setBelegLink(true)}>Beleg-Link erzeugen</Btn>
        <Link href={`/admin/dispo/${job.id}/briefing`} className="pv-btn sec">Briefing an die Crew</Link>
        <span className="small muted">{b.besetzt} von {b.bedarf} Plätzen besetzt · {job.status === "offen" ? "im Job-Board sichtbar" : "nicht im Job-Board"}</span>
      </div>

      <div className="pvd">
        <section aria-label="Bewerber">
          <div className="row between" style={{ marginBottom: "0.5rem" }}>
            <h2>Bewerber</h2>
            <span className="small muted">Passung für: <b>{schicht.bezeichnung}</b></span>
          </div>
          <div className="row wrap" style={{ marginBottom: "0.5rem" }}>
            <input className="pv-input sm" style={{ width: 150 }} placeholder="Suche" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Suche" />
            <select className="pv-select sm" style={{ width: "auto" }} value={katFilter} onChange={(e) => setKatFilter(e.target.value)} aria-label="Kategorie"><option value="">Alle Kat.</option><option>A</option><option>B</option><option>C</option></select>
            <select className="pv-select sm" style={{ width: "auto" }} value={poolFilter} onChange={(e) => setPoolFilter(e.target.value)} aria-label="Pool"><option value="">Alle Pools</option>{["Stuttgart", "Mannheim", "Frankfurt", "Idar-Oberstein", "NRW"].map((p) => <option key={p}>{p}</option>)}</select>
            <label className="pv-check small"><input type="checkbox" checked={auchOhne} onChange={(e) => setAuchOhne(e.target.checked)} />auch ohne Bewerbung</label>
          </div>
          <div className="col" data-testid="bewerberliste" style={{ maxHeight: "70vh", overflow: "auto", paddingRight: 4 }}>
            {kandidaten.length === 0 ? <Note>Keine Bewerber in dieser Auswahl.</Note> : null}
            {kandidaten.map(({ c, p, appl }) => (
              <div key={c.pnr} className={`pvd-bew ${ziehe === c.pnr ? "drag" : ""}`} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.pnr); e.dataTransfer.effectAllowed = "move"; setZiehe(c.pnr); }} onDragEnd={() => { setZiehe(null); setUeber(null); }} data-testid="bewerber" data-pnr={c.pnr}>
                <div className="row">
                  <div className="pvd-score" style={{ color: p.score >= 70 ? "var(--ok)" : p.score >= 45 ? "var(--navy)" : "var(--warn)" }} title="Passung 0–100">{p.score}</div>
                  <div className="grow">
                    <div className="row between"><Link href={`/admin/crew/${c.id}`} style={{ textDecoration: "none" }}><b>{vollName(c)}</b></Link><Chip ton={p.kategorie === "A" ? "gut" : p.kategorie === "B" ? "info" : "warn"}>{p.kategorie}</Chip></div>
                    <div className="tiny muted">{c.pnr} · {c.pool}{appl ? ` · ${appl.eigeneAnreise ? "eigene Anreise" : "braucht Mitfahrt"}` : " · keine Bewerbung"}</div>
                  </div>
                </div>
                <div className="row wrap gap1 mt1">
                  {p.chips.slice(0, 5).map((ch, i) => <Chip key={i} ton={ch.ton === "gut" ? "gut" : ch.ton === "warn" ? "warn" : undefined}>{ch.text}</Chip>)}
                  {p.konflikte.map((k, i) => <Chip key={i} ton={k.schwer ? "err" : "warn"} title={k.text}>⚠ {k.code}</Chip>)}
                </div>
                <div className="row mt1"><Btn groesse="sm" onClick={() => versuche(c.pnr, schicht.id)} data-testid="einplanen">Einplanen</Btn>{appl?.kommentar ? <span className="tiny muted">„{appl.kommentar}“</span> : null}</div>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Schichten">
          <h2 style={{ marginBottom: "0.5rem" }}>Schichten</h2>
          <div className="col">
            {job.schichten.map((sch) => {
              const liste = s.zuweisung[sch.id] ?? [];
              const frei = Math.max(0, sch.bedarf - liste.length);
              const istAktiv = sch.id === schicht.id;
              return (
                <div key={sch.id} className={`pvd-slot ${ueber === sch.id ? "over" : ""}`} style={istAktiv ? { borderColor: "var(--navy)" } : undefined} data-testid="schicht" data-schicht={sch.id}
                  onDragOver={(e) => { e.preventDefault(); setUeber(sch.id); }} onDragLeave={() => setUeber((x) => (x === sch.id ? null : x))}
                  onDrop={(e) => { e.preventDefault(); const pnr = e.dataTransfer.getData("text/plain"); setUeber(null); setZiehe(null); if (pnr) versuche(pnr, sch.id); }}>
                  <div className="row between">
                    <div>
                      <b>{sch.bezeichnung}</b> <Chip>{sch.taetigkeit}</Chip>
                      <div className="small muted">{wochentag(sch.datum)}, {formatDatumDE(sch.datum)} · {sch.start}–{sch.ende} Uhr · {schichtStunden(sch).toString().replace(".", ",")} h</div>
                    </div>
                    <div className="right"><div className="mono"><b>{liste.length}</b> / {sch.bedarf}</div><button type="button" className="pv-btn ghost sm" onClick={() => setAktiv(sch.id)} aria-pressed={istAktiv}>{istAktiv ? "Passung hierfür" : "Passung zeigen"}</button></div>
                  </div>
                  <div className="mt1"><Bar anteil={sch.bedarf ? liste.length / sch.bedarf : 0} ton={liste.length >= sch.bedarf ? "gut" : "warn"} /></div>
                  <div className="col gap1 mt2">
                    {liste.map((z) => {
                      const c = crewMap.get(z.pnr);
                      if (!c) return null;
                      const bw = bewertung(c, s.einst);
                      return (
                        <div key={z.pnr} className="row between" style={{ background: "var(--mist)", borderRadius: 10, padding: "0.3rem 0.5rem" }} data-testid="eingeplant">
                          <span className="row"><Initialen name={vollName(c)} /><span><b>{vollName(c)}</b> {bw ? <Chip ton={bw.kategorie === "A" ? "gut" : bw.kategorie === "B" ? "info" : "warn"}>{bw.kategorie}</Chip> : null}{z.begruendung ? <div className="tiny" style={{ color: "var(--warn)" }}>Begründung: {z.begruendung}</div> : null}</span></span>
                          <Btn v="ghost" groesse="sm" onClick={() => set((st) => entferne(st, job, sch.id, z.pnr))} aria-label={`${vollName(c)} entfernen`}>✕</Btn>
                        </div>
                      );
                    })}
                    {frei > 0 ? <div className="small muted" style={{ textAlign: "center", padding: "0.4rem" }}>{frei} {frei === 1 ? "Platz" : "Plätze"} frei – Bewerber hierher ziehen oder „Einplanen“ klicken</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt2"><Note>Wer bereits in einer Schicht des Auftrags steht, verschwindet links. Konflikte (doppelt gebucht, Ruhezeit, Vertrag, Unterweisung, Monatsgrenze) lassen sich nur mit Begründung übergehen.</Note></div>
        </section>
      </div>

      {anfrage ? <KonfliktModal anfrage={anfrage} onClose={() => setAnfrage(null)} onOk={(grund) => { set((st) => plane(st, job, anfrage.schicht.id, anfrage.c.pnr, grund)); melde(`${vollName(anfrage.c)} eingeplant – mit Begründung im Protokoll.`); setAnfrage(null); }} /> : null}

      {aushang ? <AushangModal text={whatsappAushang(s, job, modus === "echt" ? `${(basis ?? window.location.origin).replace(/\/$/, "")}/crew/jobs/${job.id}` : undefined)} onClose={() => setAushang(false)} /> : null}

      {belegLink ? <BelegLinkModal job={job} onClose={() => setBelegLink(false)} /> : null}
    </>
  );
}

function BelegLinkModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { modus, melde, basis } = usePv();
  const [link, setLink] = useState<string | null>(modus === "demo" ? belegLinkFuer(job) : null);
  const [pfad, setPfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const erzeugen = async () => {
    setFehler(null);
    for (let versuch = 0; versuch < 8; versuch++) {
      const r = await fetch("/api/neu/beleg-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) });
      const j = (await r.json().catch(() => null)) as { pfad?: string; error?: string } | null;
      if (r.ok && j?.pfad) {
        setPfad(j.pfad);
        setLink(`${(basis ?? window.location.origin).replace(/\/$/, "")}${j.pfad}`);
        return;
      }
      if (r.status !== 404) return setFehler(j?.error ?? "Link konnte nicht erzeugt werden.");
      await new Promise((res) => setTimeout(res, 700));
    }
    setFehler("Der Auftrag ist noch nicht gespeichert. Bitte kurz warten und noch einmal versuchen.");
  };
  return (
    <Modal titel="Beleg-Link für diesen Auftrag" onClose={onClose} fuss={link ? <Btn onClick={async () => melde((await kopiere(link)) ? "Link kopiert." : "Kopieren nicht möglich.")} data-testid="beleg-link-kopieren">Link kopieren</Btn> : undefined}>
      <p>Mit diesem Link reicht die Crew Belege zu <b>{job.id}</b> ein – ohne Anmeldung, nur Foto, Betrag und Datum.</p>
      {link ? (
        <>
          <div className="pv-card flat mono mt2" style={{ background: "var(--mist)", wordBreak: "break-all" }} data-testid="beleg-link">{link}</div>
          <div className="row mt2">{modus === "demo" ? <Link href={`/b/demo-${job.id}`} className="pv-btn sec">Vorschau öffnen (Handy-Sicht)</Link> : pfad ? <a href={pfad} target="_blank" rel="noreferrer" className="pv-btn sec">Vorschau öffnen (Handy-Sicht)</a> : null}</div>
          <div className="small muted mt2">{modus === "demo" ? `Der Link ist je Auftrag eindeutig und läuft ${formatDatumDE(HEUTE.slice(0, 4) + "-12-31")} ab.` : "Der Link gilt 90 Tage und ist je Erzeugung eindeutig."} Die Belege landen im Unterlagen-Archiv.</div>
        </>
      ) : <div className="mt2"><Btn onClick={erzeugen} data-testid="beleg-link-erzeugen">Link erzeugen</Btn></div>}
      {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
    </Modal>
  );
}

function KonfliktModal({ anfrage, onClose, onOk }: { anfrage: Anfrage; onClose: () => void; onOk: (grund: string) => void }) {
  const [grund, setGrund] = useState("");
  const ok = grund.trim().length >= 5;
  return (
    <Modal titel="Trotzdem einplanen?" onClose={onClose} fuss={<><Btn v="sec" onClick={onClose}>Abbrechen</Btn><Btn disabled={!ok} onClick={() => onOk(grund.trim())} data-testid="konflikt-ok">Mit Begründung einplanen</Btn></>}>
      <p><b>{vollName(anfrage.c)}</b> für <b>{anfrage.schicht.bezeichnung}</b> ({anfrage.schicht.start}–{anfrage.schicht.ende}):</p>
      <div className="col gap1 mt2" data-testid="konflikte">{anfrage.konflikte.map((k, i) => <Note key={i} ton="warn">{k}</Note>)}</div>
      <label className="pv-label mt2" htmlFor="konflikt-grund">Begründung (mindestens 5 Zeichen)</label>
      <textarea id="konflikt-grund" className="pv-textarea" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="Zum Beispiel: Unterweisung wird vor Ort vor Schichtbeginn nachgeholt." autoFocus />
    </Modal>
  );
}

function AushangModal({ text, onClose }: { text: string; onClose: () => void }) {
  const { melde } = usePv();
  return (
    <Modal titel="WhatsApp-Aushang" onClose={onClose} fuss={<Btn onClick={async () => melde((await kopiere(text)) ? "Aushang kopiert – jetzt in die WhatsApp-Gruppe einfügen." : "Kopieren nicht möglich.")} data-testid="aushang-kopieren">Text kopieren</Btn>}>
      <pre className="pv-card flat" style={{ background: "var(--mist)", whiteSpace: "pre-wrap", fontFamily: "var(--body)", margin: 0 }} data-testid="aushang-text">{text}</pre>
    </Modal>
  );
}

