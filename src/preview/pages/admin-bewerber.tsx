"use client";
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { crewNachPnr, usePv, HEUTE } from "../state/store";
import { Bar, Btn, Chip, Feld, Initialen, Karte, Kopf, Note, Offen, Stat, Tabs, kopiere } from "../ui/kit";
import { EinladungModal, naechsteBewerberNr, neueId } from "./formulare";
import type { Crew } from "../logic/types";
import { SELF_ID } from "../data/demo";
import { neueAudit } from "../state/store";
import { addTage, formatDatumDE, formatDezimal } from "../logic/zeit";
import { fahrminuten, geocodePlz, POOLS } from "../logic/geo";
import type { BewerbungStatus } from "../logic/types";
import { bewertung, passungFuer, schichtMitJob, vollName } from "./helfer";

const STATUS: BewerbungStatus[] = ["neu", "passt", "Warteliste", "abgelehnt", "bestätigt"];

export function AdminBewerber() {
  const { s, set, melde, modus, echt } = usePv();
  const [einladung, setEinladung] = useState<Crew | null>(null);
  const [nachname, setNachname] = useState("");
  const [fehlerEinl, setFehlerEinl] = useState<string | null>(null);
  const [tab, setTab] = useState<"fragebogen" | "bewerbungen">("fragebogen");
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [telefon, setTelefon] = useState(modus === "demo" ? "0151 0000 9001" : "");
  const [vorname, setVorname] = useState(modus === "demo" ? "Mara" : "");

  const frageboegen = s.crew.filter((c) => c.status === "Bewerber" && c.profile);
  // Eingeladen, aber noch nicht ausgefüllt (nur im echten System; Mara ist die Demo-Person)
  const wartend = s.crew.filter((c) => c.status === "Bewerber" && !c.profile && c.id !== SELF_ID);
  const crewMap = useMemo(() => crewNachPnr(s), [s]);
  const bewerbungen = s.bewerbungen.filter((a) => (!jobFilter || a.jobId === jobFilter) && (!statusFilter || a.status === statusFilter));

  const linkText = s.einst.fragebogenLinkText.replace("{vorname}", vorname || "…").replace("{link}", "https://fess.jobs/crew/start/a7K9x2");

  return (
    <>
      <Kopf eyebrow="Betrieb" titel="Bewerber" sub="Fragebögen sichten und Bewerbungen auf Jobs bearbeiten." />
      {einladung ? <EinladungModal person={einladung} onClose={() => setEinladung(null)} /> : null}
      <div className="pva-grid c4">
        <Stat wert={frageboegen.length} label="Fragebögen zu prüfen" />
        <Stat wert={s.bewerbungen.filter((a) => a.status === "neu").length} label="neue Bewerbungen" />
        <Stat wert={s.bewerbungen.filter((a) => a.status === "Warteliste").length} label="auf der Warteliste" />
        <Stat wert={s.bewerbungen.filter((a) => a.status === "bestätigt").length} label="bestätigt" ton="gut" />
      </div>

      <div className="mt3">
        {modus === "echt" ? (
          <Karte titel="Neue Person einladen">
            <p className="small">Name und Handynummer eintragen – es entsteht ein Bewerber-Eintrag und ein persönlicher Link zum Fragebogen, den du (oder Merle) per WhatsApp schickst.</p>
            <div className="pva-grid c3 mt2">
              <Feld label="Vorname"><input className="pv-input" aria-label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} /></Feld>
              <Feld label="Nachname"><input className="pv-input" aria-label="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} /></Feld>
              <Feld label="Handynummer (WhatsApp)"><input className="pv-input" aria-label="Handynummer" value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Feld>
            </div>
            {fehlerEinl ? <div className="pv-error" role="alert">{fehlerEinl}</div> : null}
            <div className="row mt1">
              <Btn data-testid="einladen" onClick={() => {
                if (!vorname.trim() || !nachname.trim()) return setFehlerEinl("Vor- und Nachname fehlen.");
                setFehlerEinl(null);
                const person: Crew = { id: neueId("c"), pnr: naechsteBewerberNr(s.crew), vorname: vorname.trim(), nachname: nachname.trim(), telefon: telefon.trim(), email: "", wohnort: "", plz: "", pool: "Stuttgart", status: "Bewerber", xp: 0, einsaetze: 0, arbeitstageJahr: 0, profile: null, contract: null, unterweisungen: {}, ratings: [], notizen: "" };
                set((st) => ({ ...st, crew: [...st.crew, person], audit: [neueAudit(echt?.benutzer ?? "Admin", "crew", person.id, "anlage", "", "als Bewerber eingeladen", null), ...st.audit] }));
                setVorname("");
                setNachname("");
                setTelefon("");
                setEinladung(person);
              }}>Person anlegen und Link erzeugen</Btn>
            </div>
          </Karte>
        ) : (
        <Karte titel="Fragebogen-Link verschicken" aktionen={<Offen nr={12}>Merle verschickt, Annahme</Offen>}>
          <div className="pva-grid c2">
            <div>
              <label className="pv-label" htmlFor="fb-vorname">Vorname</label>
              <input id="fb-vorname" className="pv-input" value={vorname} onChange={(e) => setVorname(e.target.value)} />
              <label className="pv-label mt2" htmlFor="fb-tel">Handynummer (WhatsApp)</label>
              <input id="fb-tel" className="pv-input" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </div>
            <div>
              <label className="pv-label">Nachricht (Text ist in den Einstellungen änderbar)</label>
              <div className="pv-card flat" style={{ background: "var(--mist)", whiteSpace: "pre-wrap" }}>{linkText}</div>
              <div className="row mt2">
                <Btn onClick={async () => melde((await kopiere(linkText)) ? "Text kopiert – im echten System geht er per WhatsApp raus." : "Kopieren nicht möglich.")}>Text kopieren</Btn>
                <Link href="/crew" className="pv-btn sec">Link ansehen (Mitarbeiter-Sicht)</Link>
              </div>
            </div>
          </div>
        </Karte>
        )}
      </div>

      <div className="mt3">
        <Tabs wert={tab} onChange={setTab} tabs={[{ id: "fragebogen", label: "Fragebögen", n: frageboegen.length }, { id: "bewerbungen", label: "Bewerbungen auf Jobs", n: s.bewerbungen.length }]} />
      </div>

      {tab === "fragebogen" ? (
        <div className="mt2">
          {frageboegen.length === 0 ? <Note>Keine offenen Fragebögen.</Note> : null}
          {wartend.length > 0 ? (
            <div className="pv-card mb-2" style={{ marginBottom: "0.8rem" }} data-testid="wartend">
              <b>Eingeladen, Fragebogen noch offen ({wartend.length})</b>
              <div className="col gap1 mt1">
                {wartend.map((c) => (
                  <div key={c.id} className="row between">
                    <span><Link href={`/admin/crew/${c.id}`}>{vollName(c)}</Link> <span className="tiny muted mono">{c.pnr} · {c.telefon}</span></span>
                    <Btn groesse="sm" v="sec" onClick={() => setEinladung(c)}>Neuen Link erzeugen</Btn>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="pv-card pv-scroll" style={{ padding: 0 }}>
            <table className="pv-table" data-testid="fragebogen-tabelle">
              <thead><tr><th>Person</th><th>Ort und Pool</th><th>Score je Block</th><th>Kategorie</th><th>Löschhinweis ab</th><th /></tr></thead>
              <tbody>
                {frageboegen.map((c) => {
                  const b = bewertung(c, s.einst);
                  const o = geocodePlz(c.plz);
                  const min = o ? fahrminuten(o, POOLS[c.pool]) : null;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/crew/${c.id}`} className="row" style={{ textDecoration: "none" }}>
                          <Initialen name={vollName(c)} />
                          <span><b>{vollName(c)}</b><div className="tiny muted mono">{c.telefon}</div></span>
                        </Link>
                      </td>
                      <td>{c.plz} {c.wohnort}<div className="tiny muted">{c.pool}{min !== null ? ` · ${min} min` : ""}</div></td>
                      <td style={{ minWidth: 220 }}>
                        {b ? (
                          <div className="col gap1">
                            {b.frage.blocks.map((bl) => (
                              <div key={bl.key} className="row gap1">
                                <span className="tiny muted" style={{ width: 90 }}>{bl.label}</span>
                                <div className="grow"><Bar anteil={bl.quote} ton={bl.quote >= 0.7 ? "gut" : bl.quote >= 0.4 ? "warn" : "err"} /></div>
                              </div>
                            ))}
                          </div>
                        ) : "–"}
                      </td>
                      <td>{b ? <><Chip ton={b.kategorie === "A" ? "gut" : b.kategorie === "B" ? "info" : "warn"}>Kategorie {b.kategorie}</Chip><div className="tiny muted mono">{formatDezimal(b.score, 1)} Punkte</div></> : "–"}</td>
                      <td><span className="small">{formatDatumDE(addTage(HEUTE, 182))}</span> <Offen nr={17} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Btn
                          groesse="sm"
                          onClick={() => {
                            set((x) => ({
                              ...x,
                              crew: x.crew.map((p) =>
                                p.id === c.id
                                  ? { ...p, status: "aktiv", contract: { vertragsart: "Minijob", wochenstunden: 10, monatsgrenzeStd: Math.floor(x.einst.minijobEur / 15), monatsgrenzeEur: x.einst.minijobEur, stundenlohn: 15, gueltigVon: HEUTE, gueltigBis: null, docusignId: "DS-DEMO" } }
                                  : p
                              ),
                            }));
                            melde(`${vollName(c)} ist jetzt Crew. Vertrag läuft über DocuSign wie bisher – hier als Minijob vorbelegt.`);
                          }}
                        >
                          Als Crew aufnehmen
                        </Btn>{" "}
                        <Btn groesse="sm" v="ghost" onClick={() => {
                          if (modus === "demo") return melde("Prototyp: Absage mit Textvorschlag, kein Versand.");
                          set((st) => ({ ...st, crew: st.crew.map((p) => (p.id === c.id ? { ...p, status: "ausgeschieden" } : p)), audit: [neueAudit(echt?.benutzer ?? "Admin", "crew", c.id, "status", c.status, "ausgeschieden", "Absage"), ...st.audit] }));
                          melde(`${vollName(c)} als „ausgeschieden“ markiert (nichts verschickt).`);
                        }}>Absagen</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small muted mt2">Die Crew sieht ihre Kategorie nie. Ein Wechsel auf „aktiv“ setzt einen Vertrag voraus, der wie bisher über DocuSign läuft.</div>
        </div>
      ) : (
        <div className="mt2">
          <div className="row wrap">
            <select className="pv-select" style={{ maxWidth: 360 }} value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} aria-label="Auftrag">
              <option value="">Alle Aufträge</option>
              {s.jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.titel}</option>)}
            </select>
            <select className="pv-select" style={{ maxWidth: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Alle Status</option>
              {STATUS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <span className="small muted">{bewerbungen.length} Bewerbungen</span>
          </div>
          <div className="pv-card pv-scroll mt2" style={{ padding: 0 }}>
            <table className="pv-table" data-testid="bewerbungen-tabelle">
              <thead><tr><th>Person</th><th>Auftrag</th><th>Passung</th><th>Anreise</th><th>Kommentar</th><th>Status</th></tr></thead>
              <tbody>
                {bewerbungen.slice(0, 80).map((a) => {
                  const c = crewMap.get(a.pnr);
                  const job = s.jobs.find((j) => j.id === a.jobId);
                  const sch = job?.schichten.find((x) => x.id === a.schichtIds[0]) ?? job?.schichten[0];
                  if (!c || !job || !sch) return null;
                  const p = passungFuer(s, c, job, sch);
                  return (
                    <tr key={a.id}>
                      <td><Link href={`/admin/crew/${c.id}`} style={{ textDecoration: "none" }}><b>{vollName(c)}</b></Link><div className="tiny muted mono">{c.pnr}{a.hatVertrag ? "" : " · kein Vertrag"}</div></td>
                      <td><Link href={`/admin/dispo/${job.id}`} style={{ textDecoration: "none" }}>{job.titel}</Link><div className="tiny muted">{a.schichtIds.map((id) => schichtMitJob(s, id)?.schicht.bezeichnung).join(", ")}</div></td>
                      <td><Chip ton={p.score >= 70 ? "gut" : p.score >= 45 ? undefined : "warn"} mono>{p.score}</Chip> {p.konflikte.length ? <Chip ton="warn">{p.konflikte.length} Hinweis{p.konflikte.length > 1 ? "e" : ""}</Chip> : null}</td>
                      <td className="small">{a.eigeneAnreise ? "eigene Anreise" : "braucht Mitfahrt"}{a.fahrgemeinschaftPlaetze ? ` · ${a.fahrgemeinschaftPlaetze} Plätze frei` : ""}</td>
                      <td className="small">{a.kommentar || "–"}</td>
                      <td>
                        {a.status === "bestätigt" ? (
                          <Chip ton="gut">bestätigt</Chip>
                        ) : (
                          <select
                            className="pv-select sm"
                            value={a.status}
                            aria-label={`Status ${vollName(c)}`}
                            onChange={(e) => set((x) => ({ ...x, bewerbungen: x.bewerbungen.map((y) => (y.id === a.id ? { ...y, status: e.target.value as BewerbungStatus } : y)) }))}
                          >
                            {STATUS.filter((x) => x !== "bestätigt").map((x) => <option key={x}>{x}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small muted mt2">Bestätigt wird in der Disposition, dort mit Prüfung auf Konflikte. {bewerbungen.length > 80 ? "Angezeigt werden die ersten 80." : ""}</div>
        </div>
      )}
    </>
  );
}
