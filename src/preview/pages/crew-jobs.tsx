"use client";
// Job-Board und Bewerbung (Modul C): Jobs ansehen, in vier Schritten bewerben,
// mit Unterweisungs-Gate vor dem Absenden.
import { useMemo, useState } from "react";
import { Link, gehe } from "../nav";
import { usePv, selbst, HEUTE, type BewerbungEntwurf } from "../state/store";
import { Btn, Chip, Feld, JaNein, Karte, LinkBtn, Note, Offen } from "../ui/kit";
import { CrewGate, SpracheSchalter, statusText } from "./crew-start";
import { fahrminuten, geocodePlz } from "../logic/geo";
import { formatDatumDE } from "../logic/zeit";
import { MODULE, t } from "../data/trainings";
import { pflichtModule, statusFuer, ablaufDatum } from "../logic/unterweisung";
import { schichtStunden } from "../logic/passung";
import type { Application } from "../logic/types";
import { wochentag } from "./dispo-aktionen";

function fahrzeit(plzVon: string, plzNach: string): number | null {
  const a = geocodePlz(plzVon);
  const b = geocodePlz(plzNach);
  return a && b ? fahrminuten(a, b) : null;
}

export function CrewJobs() {
  return <CrewGate><JobsInhalt /></CrewGate>;
}

function JobsInhalt() {
  const { s } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const [nah, setNah] = useState(false);
  const jobs = useMemo(() => s.jobs.filter((j) => j.status === "offen" || j.status === "voll").filter((j) => !nah || (fahrzeit(ich.plz, j.plz) ?? 999) <= 60).sort((a, b) => a.datumVon.localeCompare(b.datumVon)), [s.jobs, nah, ich.plz]);
  return (
    <div className="col gap2">
      <div className="row between"><h1>Jobs</h1><SpracheSchalter /></div>
      {!s.fragebogenFertig ? <Note ton="warn">{de ? "Fülle zuerst den Fragebogen aus – ohne ihn kannst du dich nicht bewerben." : "Fill in the questionnaire first – you cannot apply without it."} <Link href="/crew/fragebogen"><b>{de ? "Jetzt ausfüllen" : "Fill in now"}</b></Link></Note> : null}
      <label className="pv-check small"><input type="checkbox" checked={nah} onChange={(e) => setNah(e.target.checked)} />{de ? "nur bis 60 Minuten Anfahrt" : "up to 60 minutes travel"}</label>
      {jobs.length === 0 ? <Note>{de ? "Zurzeit keine passenden Jobs." : "No matching jobs right now."}</Note> : null}
      {jobs.map((j) => {
        const min = fahrzeit(ich.plz, j.plz);
        const meine = s.bewerbungen.find((a) => a.jobId === j.id && a.pnr === ich.pnr);
        const taet = [...new Set(j.schichten.map((x) => x.taetigkeit))];
        return (
          <Link key={j.id} href={`/crew/jobs/${j.id}`} className="pv-job" data-testid="crew-job">
            <div className="row between"><h3>{j.titel}</h3>{meine ? <Chip ton={meine.status === "bestätigt" ? "gut" : "info"}>{statusText(meine.status, de)}</Chip> : null}</div>
            <div className="meta mt1">{formatDatumDE(j.datumVon)}{j.datumBis !== j.datumVon ? ` – ${formatDatumDE(j.datumBis)}` : ""} · {j.ort}</div>
            <div className="row wrap gap1 mt2">
              {taet.map((x) => <Chip key={x}>{x}</Chip>)}
              {min !== null ? <Chip ton={min <= 60 ? "gut" : "warn"}>{de ? `ca. ${min} min von dir` : `about ${min} min from you`}</Chip> : null}
              {j.hoehe ? <Chip ton="warn">{de ? "Arbeiten in der Höhe" : "Work at height"}</Chip> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────

const SCHRITTE_STATUS = ["neu", "passt", "bestätigt"] as const;

export function CrewJobDetail({ id }: { id: string }) {
  return <CrewGate><DetailInhalt id={id} /></CrewGate>;
}

function DetailInhalt({ id }: { id: string }) {
  const { s } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const job = s.jobs.find((j) => j.id === id);
  if (!job) return <Note ton="err">{de ? "Job nicht gefunden." : "Job not found."}</Note>;
  const meine = s.bewerbungen.find((a) => a.jobId === job.id && a.pnr === ich.pnr);
  const min = fahrzeit(ich.plz, job.plz);
  const pflicht = pflichtModule(job.schichten.map((x) => x.taetigkeit), { hoehe: job.hoehe });
  const bestaetigt = meine?.status === "bestätigt";
  return (
    <div className="col gap2">
      <Link href="/crew/jobs" className="small">← {de ? "Alle Jobs" : "All jobs"}</Link>
      <div><h1>{job.titel}</h1><div className="muted">{formatDatumDE(job.datumVon)}{job.datumBis !== job.datumVon ? ` – ${formatDatumDE(job.datumBis)}` : ""} · {job.ort}{min !== null ? ` · ${de ? `ca. ${min} min` : `about ${min} min`}` : ""}</div></div>

      {meine ? (
        <Karte titel={de ? "Dein Status" : "Your status"}>
          {meine.status === "abgelehnt" ? <Chip ton="err">{statusText("abgelehnt", de)}</Chip> : (
            <div className="row gap1" data-testid="status-tracker">
              {SCHRITTE_STATUS.map((st, i) => {
                const aktuell = meine.status === "Warteliste" ? 1 : SCHRITTE_STATUS.indexOf(meine.status as (typeof SCHRITTE_STATUS)[number]);
                return <Chip key={st} ton={i < aktuell ? "gut" : i === aktuell ? "orange" : undefined}>{i + 1}. {statusText(st, de)}</Chip>;
              })}
            </div>
          )}
          {meine.status === "Warteliste" ? <div className="small muted mt1">{de ? "Du stehst auf der Warteliste. Wenn jemand ausfällt, melden wir uns." : "You are on the waitlist. We will contact you if someone drops out."}</div> : null}
        </Karte>
      ) : null}

      <Karte titel={de ? "Schichten" : "Shifts"}>
        <div className="col">
          {job.schichten.map((sch) => (
            <div key={sch.id} className="row between"><span><b>{sch.bezeichnung}</b><div className="small muted">{wochentag(sch.datum)}, {formatDatumDE(sch.datum)} · {sch.start}–{sch.ende} {de ? "Uhr" : "h"}</div></span><span className="row gap1"><Chip>{sch.taetigkeit}</Chip><Chip mono>{schichtStunden(sch).toString().replace(".", ",")} h</Chip></span></div>
          ))}
        </div>
      </Karte>

      <Karte titel={de ? "Das solltest du wissen" : "Good to know"}>
        <table className="pv-table"><tbody>
          <tr><td>{de ? "Beschreibung" : "Description"}</td><td>{job.beschreibung}</td></tr>
          <tr><td>Dresscode</td><td>{job.dresscode}</td></tr>
          <tr><td>{de ? "Mitbringen" : "Bring"}</td><td>{job.psa.join(", ") || "–"}</td></tr>
          <tr><td>{de ? "Verpflegung" : "Food"}</td><td>{job.verpflegung}</td></tr>
          <tr><td>{de ? "Parken" : "Parking"}</td><td>{job.parken}</td></tr>
          <tr><td>{de ? "Treffpunkt" : "Meeting point"}</td><td>{bestaetigt ? job.treffpunkt : de ? "wird nach der Bestätigung freigeschaltet" : "unlocked after confirmation"}</td></tr>
          <tr><td>{de ? "Ansprechpartner" : "Contact"}</td><td>{bestaetigt ? (de ? "Teamleiter vor Ort, Nummer kommt im Briefing" : "Team lead on site, number comes with the briefing") : job.ansprechpartner}</td></tr>
        </tbody></table>
        <h4 className="mt3">{de ? "Ablauf" : "Schedule"}</h4>
        <ol className="small" style={{ paddingLeft: "1.1rem", margin: "0.4rem 0 0" }}>{job.ablauf.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </Karte>

      <Karte titel={de ? "Unterweisung für diesen Job" : "Safety briefing for this job"}>
        <div className="row wrap gap1">
          {pflicht.map((m) => {
            const st = statusFuer(ich.unterweisungen[m], HEUTE);
            const mod = MODULE.find((x) => x.id === m);
            return <Chip key={m} ton={st === "gueltig" || st === "laeuftBaldAb" ? "gut" : "warn"}>{st === "gueltig" || st === "laeuftBaldAb" ? "✓" : "!"} {mod ? t(mod.titel, s.lang) : m}</Chip>;
          })}
        </div>
      </Karte>

      {!meine ? <LinkBtn href={`/crew/jobs/${job.id}/bewerben`} block groesse="lg" data-testid="bewerben">{de ? "Jetzt bewerben" : "Apply now"}</LinkBtn> : null}
    </div>
  );
}

// ─── Bewerbung in vier Schritten ────────────────────────────────────────────

const LEER: BewerbungEntwurf = { schichtIds: [], eigeneAnreise: null, hatVertrag: null, abfahrtsort: "", plaetze: 0, kommentar: "", schritt: 1, bestaetigt: false };

export function CrewBewerben({ id }: { id: string }) {
  return <CrewGate><BewerbenInhalt id={id} /></CrewGate>;
}

function BewerbenInhalt({ id }: { id: string }) {
  const { s, set, melde } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const job = s.jobs.find((j) => j.id === id);
  const e: BewerbungEntwurf = s.entwurf?.[id] ?? LEER;
  const setE = (patch: Partial<BewerbungEntwurf>) => set((st) => ({ ...st, entwurf: { ...st.entwurf, [id]: { ...(st.entwurf?.[id] ?? LEER), ...patch } } }));
  const [fehler, setFehler] = useState<string | null>(null);

  if (!job) return <Note ton="err">{de ? "Job nicht gefunden." : "Job not found."}</Note>;
  const schon = s.bewerbungen.some((a) => a.jobId === job.id && a.pnr === ich.pnr);
  if (schon) return <Note ton="ok">{de ? "Du hast dich auf diesen Job schon beworben." : "You have already applied for this job."} <Link href={`/crew/jobs/${job.id}`}><b>{de ? "Zum Status" : "To status"}</b></Link></Note>;
  if (!s.fragebogenFertig) return <Karte><h2>{de ? "Erst der Fragebogen" : "Questionnaire first"}</h2><p className="mt1 muted">{de ? "Damit wir dich passend einplanen können, brauchen wir deine Angaben (ca. 8 Minuten)." : "We need your details to match you properly (about 8 minutes)."}</p><div className="mt2"><LinkBtn href="/crew/fragebogen" block>{de ? "Zum Fragebogen" : "To the questionnaire"}</LinkBtn></div></Karte>;

  const gewaehlt = job.schichten.filter((x) => e.schichtIds.includes(x.id));
  const pflicht = pflichtModule(gewaehlt.map((x) => x.taetigkeit), { hoehe: job.hoehe });
  const fehlend = pflicht.filter((m) => !["gueltig", "laeuftBaldAb"].includes(statusFuer(ich.unterweisungen[m], HEUTE)));

  const weiter = () => {
    setFehler(null);
    if (e.schritt === 1 && gewaehlt.length === 0) return setFehler(de ? "Bitte mindestens eine Schicht wählen." : "Please choose at least one shift.");
    if (e.schritt === 2 && (e.eigeneAnreise === null || e.hatVertrag === null)) return setFehler(de ? "Bitte beide Fragen beantworten." : "Please answer both questions.");
    if (e.schritt === 3 && fehlend.length > 0) return setFehler(de ? "Bitte erst die fehlenden Unterweisungen abschließen." : "Please complete the missing briefings first.");
    setE({ schritt: e.schritt + 1 });
  };

  const absenden = () => {
    if (!e.bestaetigt) return setFehler(de ? "Bitte bestätige deine Angaben." : "Please confirm your details.");
    const a: Application = {
      id: `a-self-${job.id}`, jobId: job.id, pnr: ich.pnr, schichtIds: e.schichtIds, eigeneAnreise: e.eigeneAnreise === true, abfahrtsort: e.abfahrtsort,
      fahrgemeinschaftPlaetze: e.plaetze, hatVertrag: e.hatVertrag === true, status: "neu", notizIntern: "", kommentar: e.kommentar, eingegangen: HEUTE,
    };
    set((st) => ({ ...st, bewerbungen: [...st.bewerbungen, a], rueck: null, entwurf: Object.fromEntries(Object.entries(st.entwurf ?? {}).filter(([k]) => k !== job.id)) }));
    melde(de ? "Bewerbung abgeschickt – du bekommst Bescheid." : "Application sent – we will get back to you.");
    gehe(`/crew/jobs/${job.id}`);
  };

  const schritte = de ? ["Schichten", "Anreise", "Unterweisung", "Absenden"] : ["Shifts", "Travel", "Briefing", "Send"];
  return (
    <div className="col gap2">
      <Link href={`/crew/jobs/${job.id}`} className="small">← {job.titel}</Link>
      <div className="row between"><h1>{de ? "Bewerben" : "Apply"}</h1><SpracheSchalter /></div>
      <div className="pv-dots" aria-label={`${e.schritt}/4`}>{schritte.map((_, i) => <i key={i} className={i + 1 === e.schritt ? "on" : ""} />)}</div>
      <div className="small muted" style={{ textAlign: "center" }}>{e.schritt}/4 · {schritte[e.schritt - 1]}</div>

      {e.schritt === 1 ? (
        <Karte titel={de ? "Welche Schichten kannst du?" : "Which shifts can you do?"}>
          <div className="col">
            {job.schichten.map((sch) => (
              <label key={sch.id} className="pv-check" style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
                <input type="checkbox" checked={e.schichtIds.includes(sch.id)} onChange={(ev) => setE({ schichtIds: ev.target.checked ? [...e.schichtIds, sch.id] : e.schichtIds.filter((x) => x !== sch.id) })} />
                <span><b>{sch.bezeichnung}</b> <Chip>{sch.taetigkeit}</Chip><div className="small muted">{wochentag(sch.datum)}, {formatDatumDE(sch.datum)} · {sch.start}–{sch.ende}</div></span>
              </label>
            ))}
          </div>
        </Karte>
      ) : null}

      {e.schritt === 2 ? (
        <Karte titel={de ? "Wie kommst du hin?" : "How do you get there?"}>
          <Feld label={de ? "Ich reise selbst an" : "I travel myself"}>
            <JaNein lang={s.lang} wert={e.eigeneAnreise} onChange={(v) => setE({ eigeneAnreise: v })} />
          </Feld>
          <Feld label={de ? "Ich habe schon einen Vertrag bei FESS" : "I already have a contract with FESS"}>
            <JaNein lang={s.lang} wert={e.hatVertrag} onChange={(v) => setE({ hatVertrag: v })} />
          </Feld>
          <label className="pv-label mt2" htmlFor="abfahrt">{de ? "Abfahrtsort (für Fahrgemeinschaften)" : "Departure place (for car-sharing)"}</label>
          <input id="abfahrt" className="pv-input" value={e.abfahrtsort} onChange={(ev) => setE({ abfahrtsort: ev.target.value })} placeholder={ich.wohnort} />
          {e.eigeneAnreise && ich.profile?.eigenesAuto ? (
            <>
              <label className="pv-label mt2" htmlFor="plaetze">{de ? "Freie Plätze in deinem Auto" : "Free seats in your car"}</label>
              <input id="plaetze" className="pv-input mono" inputMode="numeric" value={e.plaetze || ""} onChange={(ev) => setE({ plaetze: Number(ev.target.value.replace(/\D/g, "")) || 0 })} />
            </>
          ) : null}
        </Karte>
      ) : null}

      {e.schritt === 3 ? (
        <Karte titel={de ? "Unterweisung" : "Safety briefing"}>
          <p className="small muted">{de ? "Für die gewählten Schichten brauchst du diese Unterweisungen. Sie sind 12 Monate gültig." : "You need these briefings for the chosen shifts. They are valid for 12 months."}</p>
          <div className="col mt2" data-testid="uw-gate">
            {pflicht.map((m) => {
              const mod = MODULE.find((x) => x.id === m);
              const ack = ich.unterweisungen[m];
              const st = statusFuer(ack, HEUTE);
              const ok = st === "gueltig" || st === "laeuftBaldAb";
              return (
                <div key={m} className="row between" style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
                  <span><b>{mod ? t(mod.titel, s.lang) : m}</b><div className="tiny muted">{ok && ack ? (de ? `gültig bis ${formatDatumDE(ablaufDatum(ack.bestaetigtAm))}` : `valid until ${formatDatumDE(ablaufDatum(ack.bestaetigtAm))}`) : st === "abgelaufen" ? (de ? "abgelaufen" : "expired") : de ? "noch nicht gemacht" : "not done yet"} · {mod?.minuten} min</div></span>
                  {ok ? <Chip ton="gut">✓</Chip> : <Btn groesse="sm" onClick={() => { set((stt) => ({ ...stt, rueck: `/crew/jobs/${job.id}/bewerben` })); gehe(`/crew/unterweisung/${m}`); }} data-testid={`uw-${m}`}>{de ? "Jetzt machen" : "Do it now"}</Btn>}
                </div>
              );
            })}
          </div>
          {fehlend.length === 0 ? <div className="mt2"><Note ton="ok">{de ? "Alles gültig – du kannst weiter." : "All valid – you can continue."}</Note></div> : null}
        </Karte>
      ) : null}

      {e.schritt === 4 ? (
        <Karte titel={de ? "Zusammenfassung" : "Summary"}>
          <div className="small"><b>{job.titel}</b><div className="muted">{gewaehlt.map((x) => x.bezeichnung).join(", ")}</div><div className="muted">{e.eigeneAnreise ? (de ? "eigene Anreise" : "own travel") : de ? "braucht Mitfahrgelegenheit" : "needs a ride"}{e.abfahrtsort ? ` · ${e.abfahrtsort}` : ""}</div></div>
          <label className="pv-label mt2" htmlFor="kommentar">{de ? "Kommentar (optional)" : "Comment (optional)"}</label>
          <textarea id="kommentar" className="pv-textarea" value={e.kommentar} onChange={(ev) => setE({ kommentar: ev.target.value })} />
          {e.hatVertrag === false ? <div className="mt2"><Note ton="warn">{de ? "Für deinen ersten Einsatz brauchst du einen Vertrag. Den schickt dir FESS nach der Bestätigung per DocuSign." : "You need a contract for your first job. FESS sends it via DocuSign after confirmation."}</Note></div> : null}
          <label className="pv-check mt2"><input type="checkbox" checked={e.bestaetigt} onChange={(ev) => setE({ bestaetigt: ev.target.checked })} data-testid="bestaetigen" /><span>{de ? "Ich bin an den gewählten Terminen verfügbar und habe die Hinweise gelesen." : "I am available on the chosen dates and have read the notes."}</span></label>
        </Karte>
      ) : null}

      {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
      <div className="row">
        {e.schritt > 1 ? <Btn v="sec" onClick={() => { setFehler(null); setE({ schritt: e.schritt - 1 }); }}>{de ? "Zurück" : "Back"}</Btn> : null}
        {e.schritt < 4 ? <Btn className="grow" onClick={weiter} data-testid="weiter">{de ? "Weiter" : "Next"}</Btn> : <Btn className="grow" onClick={absenden} data-testid="absenden">{de ? "Bewerbung absenden" : "Send application"}</Btn>}
      </div>
      <div className="tiny muted"><Offen nr={16}>{de ? "Kundenfreigabe der Crew folgt in Phase 2" : "Client approval of crew comes in phase 2"}</Offen></div>
    </div>
  );
}

