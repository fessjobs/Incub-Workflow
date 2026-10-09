"use client";
// Unterweisung am Handy (Modul C): Lernkarten, Quiz ab 80 %, bei falscher
// Antwort erscheint die passende Karte erneut, danach Bestätigung und Nachweis.
import { useMemo, useState } from "react";
import { Link, gehe } from "../nav";
import { usePv, selbst, HEUTE } from "../state/store";
import { Btn, Chip, Entwurf, Karte, LinkBtn, Note, ladeTextHerunter } from "../ui/kit";
import { CrewGate, SpracheSchalter } from "./crew-start";
import { AKTUELLE_VERSION, MODULE, NACHWEIS_HINWEIS, modulById, t } from "../data/trainings";
import { ablaufDatum, mischen, pflichtModule, quizBestanden, statusFuer } from "../logic/unterweisung";
import { formatDatumDE } from "../logic/zeit";

export function CrewUnterweisungen() {
  return <CrewGate><ListeInhalt /></CrewGate>;
}

function ListeInhalt() {
  const { s } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const pflichtFuerMich = new Set<string>();
  for (const a of s.bewerbungen.filter((x) => x.pnr === ich.pnr && x.status !== "abgelehnt")) {
    const job = s.jobs.find((j) => j.id === a.jobId);
    if (!job) continue;
    const tn = job.schichten.filter((x) => a.schichtIds.includes(x.id)).map((x) => x.taetigkeit);
    for (const m of pflichtModule(tn, { hoehe: job.hoehe })) pflichtFuerMich.add(m);
  }
  return (
    <div className="col gap2">
      <div className="row between"><h1>{de ? "Unterweisung" : "Safety briefing"}</h1><SpracheSchalter /></div>
      <p className="muted small">{de ? "Kurze Lernkarten und ein Quiz am Handy, je ca. 3 Minuten. 12 Monate gültig." : "Short cards and a quiz on your phone, about 3 minutes each. Valid for 12 months."}</p>
      <Entwurf>{de ? "Entwurf: Die Inhalte sind noch nicht von einer Fachkraft für Arbeitssicherheit freigegeben." : "Draft: the content has not yet been approved by a safety specialist."}</Entwurf>
      {MODULE.map((m) => {
        const ack = ich.unterweisungen[m.id];
        const st = statusFuer(ack, HEUTE);
        const ok = st === "gueltig" || st === "laeuftBaldAb";
        return (
          <Karte key={m.id}>
            <div className="row between"><h3>{t(m.titel, s.lang)}</h3><Chip ton={ok ? (st === "laeuftBaldAb" ? "warn" : "gut") : st === "abgelaufen" ? "err" : undefined}>{ok && ack ? (de ? `gültig bis ${formatDatumDE(ablaufDatum(ack.bestaetigtAm))}` : `valid until ${formatDatumDE(ablaufDatum(ack.bestaetigtAm))}`) : st === "abgelaufen" ? (de ? "abgelaufen" : "expired") : de ? "offen" : "open"}</Chip></div>
            <div className="small muted mt1">{t(m.kurz, s.lang)} · {m.minuten} min</div>
            <div className="row between mt2">
              <span className="small">{pflichtFuerMich.has(m.id) ? <Chip ton="orange">{de ? "Pflicht für deine Bewerbung" : "Required for your application"}</Chip> : <span className="muted">{de ? "Pflicht für: " : "Required for: "}{t(m.pflichtFuer, s.lang)}</span>}</span>
              <LinkBtn href={`/crew/unterweisung/${m.id}`} v={ok ? "sec" : "prim"} groesse="sm" data-testid={`modul-${m.id}`}>{ok ? (de ? "Wiederholen" : "Repeat") : de ? "Starten" : "Start"}</LinkBtn>
            </div>
          </Karte>
        );
      })}
    </div>
  );
}

type Phase = "karten" | "quiz" | "ergebnis" | "bestaetigung" | "fertig";

export function CrewModul({ id }: { id: string }) {
  return <CrewGate><ModulInhalt id={id} /></CrewGate>;
}

function ModulInhalt({ id }: { id: string }) {
  const { s, set, melde, modus } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const mod = modulById(id);
  const [phase, setPhase] = useState<Phase>("karten");
  const [karte, setKarte] = useState(0);
  const [frage, setFrage] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [richtig, setRichtig] = useState(0);
  const [versuch, setVersuch] = useState(1);
  const [haken, setHaken] = useState(false);

  const reihenfolgen = useMemo(() => (mod ? mod.quiz.map((q, i) => mischen(q.optionen.map((_, k) => k), versuch * 31 + i * 7 + 3)) : []), [mod, versuch]);
  if (!mod) return <Note ton="err">{de ? "Modul nicht gefunden." : "Module not found."}</Note>;
  const q = mod.quiz[frage];
  const bestanden = quizBestanden(richtig, mod.quiz.length);

  const bestaetigen = () => {
    set((st) => ({ ...st, crew: st.crew.map((c) => (c.id === ich.id ? { ...c, unterweisungen: { ...c.unterweisungen, [mod.id]: { version: AKTUELLE_VERSION, bestaetigtAm: HEUTE, quizScore: richtig / mod.quiz.length } } } : c)) }));
    setPhase("fertig");
    melde(de ? "Unterweisung bestätigt." : "Briefing confirmed.");
  };

  const nachweisText = [
    modus === "demo" ? "NACHWEIS UNTERWEISUNG (Prototyp)" : "NACHWEIS UNTERWEISUNG",
    `Person: ${ich.vorname} ${ich.nachname} (${ich.pnr})`,
    `Modul: ${t(mod.titel, "de")}`,
    `Bestätigt am: ${formatDatumDE(HEUTE)}`,
    `Gültig bis: ${formatDatumDE(ablaufDatum(HEUTE))}`,
    `Version: ${AKTUELLE_VERSION}`,
    `Quiz: ${Math.round((richtig / mod.quiz.length) * 100)} %`,
    "",
    NACHWEIS_HINWEIS.de,
    "",
    "ENTWURF – Inhalte nicht von einer Fachkraft für Arbeitssicherheit freigegeben.",
  ].join("\n");

  return (
    <div className="col gap2">
      <div className="row between"><Link href="/crew/unterweisung" className="small">← {de ? "Alle Module" : "All modules"}</Link><SpracheSchalter /></div>
      <div><div className="eyebrow">{de ? "Unterweisung" : "Briefing"}</div><h1>{t(mod.titel, s.lang)}</h1></div>
      <Entwurf>{de ? "Entwurf – Inhalt noch nicht von einer Fachkraft freigegeben." : "Draft – content not yet approved by a safety specialist."}</Entwurf>

      {phase === "karten" ? (
        <>
          <div className="pv-lesson" data-testid="karte">
            {karte === 0 ? <div className="pv-video">▶ {t(mod.video, s.lang)}</div> : null}
            <div className="big" aria-hidden>{mod.karten[karte].icon}</div>
            <h2>{t(mod.karten[karte].titel, s.lang)}</h2>
            <p>{t(mod.karten[karte].text, s.lang)}</p>
          </div>
          <div className="pv-dots">{mod.karten.map((_, i) => <i key={i} className={i === karte ? "on" : ""} />)}</div>
          <div className="row">
            {karte > 0 ? <Btn v="sec" onClick={() => setKarte(karte - 1)}>{de ? "Zurück" : "Back"}</Btn> : null}
            <Btn className="grow" data-testid="karte-weiter" onClick={() => (karte < mod.karten.length - 1 ? setKarte(karte + 1) : (setPhase("quiz"), setFrage(0), setGewaehlt(null), setRichtig(0)))}>{karte < mod.karten.length - 1 ? (de ? "Weiter" : "Next") : de ? "Zum Quiz" : "To the quiz"}</Btn>
          </div>
          <div className="tiny muted" style={{ textAlign: "center" }}>{karte + 1}/{mod.karten.length}</div>
        </>
      ) : null}

      {phase === "quiz" ? (
        <>
          <div className="small muted">{de ? `Frage ${frage + 1} von ${mod.quiz.length}` : `Question ${frage + 1} of ${mod.quiz.length}`}</div>
          <Karte><b>{t(q.frage, s.lang)}</b>
            <div className="col gap1 mt2" data-testid="quiz">
              {reihenfolgen[frage].map((optIdx) => {
                const o = q.optionen[optIdx];
                const zeige = gewaehlt !== null;
                const cls = zeige ? (o.richtig ? "richtig" : gewaehlt === optIdx ? "falsch" : "") : "";
                return <button key={optIdx} type="button" className={`pv-opt ${cls}`} disabled={zeige} onClick={() => { setGewaehlt(optIdx); if (o.richtig) setRichtig((r) => r + 1); }} data-richtig={o.richtig ? "1" : "0"}>{t(o.text, s.lang)}</button>;
              })}
            </div>
          </Karte>
          {gewaehlt !== null && !q.optionen[gewaehlt].richtig ? (
            <div className="pv-card orange" data-testid="karte-nochmal">
              <b>{de ? "Zur Erinnerung" : "A reminder"}: {mod.karten[q.karte].icon} {t(mod.karten[q.karte].titel, s.lang)}</b>
              <p className="small mt1">{t(mod.karten[q.karte].text, s.lang)}</p>
            </div>
          ) : null}
          {gewaehlt !== null ? <Btn block data-testid="quiz-weiter" onClick={() => { if (frage < mod.quiz.length - 1) { setFrage(frage + 1); setGewaehlt(null); } else setPhase("ergebnis"); }}>{frage < mod.quiz.length - 1 ? (de ? "Nächste Frage" : "Next question") : de ? "Ergebnis" : "Result"}</Btn> : null}
        </>
      ) : null}

      {phase === "ergebnis" ? (
        <Karte>
          <h2>{richtig} / {mod.quiz.length}</h2>
          <p className="mt1">{bestanden ? (de ? "Bestanden – ab 80 % richtig ist das Quiz geschafft." : "Passed – 80 % correct or more.") : de ? "Leider noch nicht bestanden. Ab 80 % richtig ist das Quiz geschafft – lies die Karten noch einmal." : "Not passed yet. You need 80 % correct – read the cards once more."}</p>
          <div className="mt2">{bestanden ? <Btn block data-testid="zur-bestaetigung" onClick={() => setPhase("bestaetigung")}>{de ? "Weiter zur Bestätigung" : "Continue to confirmation"}</Btn> : <Btn block data-testid="nochmal" onClick={() => { setVersuch(versuch + 1); setKarte(0); setFrage(0); setGewaehlt(null); setRichtig(0); setPhase("karten"); }}>{de ? "Nochmal lesen" : "Read again"}</Btn>}</div>
        </Karte>
      ) : null}

      {phase === "bestaetigung" ? (
        <Karte>
          <h2>{de ? "Bestätigung" : "Confirmation"}</h2>
          <label className="pv-check mt2"><input type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)} data-testid="haken" /><span>{de ? "Ich habe die Unterweisung gelesen und verstanden und halte mich daran." : "I have read and understood the briefing and will follow it."}</span></label>
          <div className="mt2"><Btn block disabled={!haken} onClick={bestaetigen} data-testid="bestaetigen-uw">{de ? "Bestätigen" : "Confirm"}</Btn></div>
        </Karte>
      ) : null}

      {phase === "fertig" ? (
        <>
          <Karte>
            <div className="eyebrow">{de ? "Nachweis" : "Record"}</div>
            <h2 className="mt1">✓ {de ? "Gültig bis " : "Valid until "}{formatDatumDE(ablaufDatum(HEUTE))}</h2>
            <pre className="small mt2" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--body)", margin: "0.6rem 0 0" }}>{nachweisText}</pre>
          </Karte>
          <Btn v="sec" block onClick={() => ladeTextHerunter(`nachweis-${mod.id}.txt`, nachweisText, "text/plain;charset=utf-8")}>{de ? "Nachweis herunterladen (PDF im echten System)" : "Download record (PDF in the real system)"}</Btn>
          {s.rueck ? <Btn block data-testid="zurueck-bewerbung" onClick={() => { const ziel = s.rueck as string; set((st) => ({ ...st, rueck: null })); gehe(ziel); }}>{de ? "Zurück zur Bewerbung" : "Back to application"}</Btn> : <LinkBtn href="/crew/unterweisung" block>{de ? "Zur Übersicht" : "To overview"}</LinkBtn>}
        </>
      ) : null}
    </div>
  );
}
