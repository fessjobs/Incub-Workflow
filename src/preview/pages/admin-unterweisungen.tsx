"use client";
import { useMemo, useState } from "react";
import { usePv, HEUTE } from "../state/store";
import { Btn, Chip, Karte, Kopf, Note, Offen, Seg, Stat, Tabs } from "../ui/kit";
import { AKTUELLE_VERSION, MODULE, NACHWEIS_HINWEIS, t } from "../data/trainings";
import { ablaufDatum, erinnerungAm, statusFuer, type UnterweisungStatus } from "../logic/unterweisung";
import { formatDatumDE } from "../logic/zeit";
import type { Lang } from "../logic/types";
import { vollName } from "./helfer";
import { PflichtUndVideos } from "./admin-schulung-regeln";

const ZEICHEN: Record<UnterweisungStatus, { text: string; ton?: "gut" | "warn" | "err" }> = {
  gueltig: { text: "✓", ton: "gut" },
  laeuftBaldAb: { text: "!", ton: "warn" },
  abgelaufen: { text: "✕", ton: "err" },
  fehlt: { text: "–" },
};

export function AdminUnterweisungen() {
  const { s, melde, modus } = usePv();
  const [tab, setTab] = useState<"matrix" | "texte" | "erinnerung" | "pflicht">("matrix");
  const [nurProbleme, setNurProbleme] = useState(false);
  const [modulId, setModulId] = useState(MODULE[0].id);
  const [lang, setLang] = useState<Lang>("de");
  const aktive = s.crew.filter((c) => c.status === "aktiv");

  const zaehler = useMemo(() => {
    let gueltig = 0, bald = 0, abgelaufen = 0;
    for (const c of aktive) for (const m of MODULE) {
      const st = statusFuer(c.unterweisungen[m.id], HEUTE);
      if (st === "gueltig") gueltig++;
      if (st === "laeuftBaldAb") bald++;
      if (st === "abgelaufen") abgelaufen++;
    }
    return { gueltig, bald, abgelaufen };
  }, [aktive]);

  const zeilen = aktive.filter((c) => !nurProbleme || MODULE.some((m) => ["abgelaufen", "laeuftBaldAb"].includes(statusFuer(c.unterweisungen[m.id], HEUTE))));
  const erinnerungen = aktive.flatMap((c) =>
    Object.entries(c.unterweisungen)
      .filter(([m, ack]) => statusFuer(ack, HEUTE) === "laeuftBaldAb" || erinnerungAm(ack.bestaetigtAm) === HEUTE)
      .map(([m, ack]) => ({ c, m, ack }))
  );
  const modul = MODULE.find((m) => m.id === modulId) ?? MODULE[0];

  return (
    <>
      <Kopf eyebrow="Personal" titel="Unterweisungen" sub={`Version ${AKTUELLE_VERSION} · gültig 12 Monate · Erinnerung 14 Tage vorher · Quiz ab 80 %`} />
      <div className="pva-grid c4">
        <Stat wert={zaehler.gueltig} label="gültige Nachweise" ton="gut" />
        <Stat wert={zaehler.bald} label="laufen in 14 Tagen ab" ton="warn" />
        <Stat wert={zaehler.abgelaufen} label="abgelaufen" ton="err" />
        <Stat wert={MODULE.length} label="Module (Deutsch und Englisch)" />
      </div>
      <div className="mt2"><Note>{t(NACHWEIS_HINWEIS, "de")}</Note></div>
      <div className="mt3"><Tabs wert={tab} onChange={setTab} tabs={[{ id: "matrix", label: "Wer ist gültig", n: aktive.length }, { id: "texte", label: "Texte und Quiz" }, { id: "erinnerung", label: "Erinnerungen", n: erinnerungen.length }, { id: "pflicht", label: "Pflicht & Videos" }]} /></div>

      {tab === "pflicht" ? <div className="mt2"><PflichtUndVideos /></div> : null}

      {tab === "matrix" ? (
        <div className="mt2">
          <label className="pv-check"><input type="checkbox" checked={nurProbleme} onChange={(e) => setNurProbleme(e.target.checked)} /> nur Personen mit ablaufender oder abgelaufener Unterweisung</label>
          <div className="pv-card pv-scroll mt2" style={{ padding: 0 }}>
            <table className="pv-table" data-testid="unterweisung-matrix">
              <thead><tr><th>Person</th>{MODULE.map((m) => <th key={m.id} title={t(m.titel, "de")}>{m.id}</th>)}</tr></thead>
              <tbody>
                {zeilen.map((c) => (
                  <tr key={c.id}>
                    <td>{vollName(c)} <span className="tiny muted mono">{c.pnr}</span></td>
                    {MODULE.map((m) => {
                      const ack = c.unterweisungen[m.id];
                      const st = statusFuer(ack, HEUTE);
                      return <td key={m.id} title={ack ? `bestätigt ${formatDatumDE(ack.bestaetigtAm)}, gültig bis ${formatDatumDE(ablaufDatum(ack.bestaetigtAm))}` : "nicht bestätigt"}><Chip ton={ZEICHEN[st].ton}>{ZEICHEN[st].text}</Chip></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted mt2">✓ gültig · ! läuft in 14 Tagen ab · ✕ abgelaufen · – fehlt. Pflicht ergibt sich aus der Tätigkeit der Schicht; „Höhe“ nur, wenn im Auftrag hinterlegt.</div>
        </div>
      ) : null}

      {tab === "texte" ? (
        <div className="mt2 pva-grid c2" style={{ gridTemplateColumns: "260px minmax(0,1fr)" }}>
          <div className="col gap1">
            {MODULE.map((m) => <button key={m.id} type="button" className={`pv-btn ${m.id === modulId ? "navy" : "sec"} block`} style={{ justifyContent: "flex-start" }} onClick={() => setModulId(m.id)}>{t(m.titel, "de")}</button>)}
          </div>
          <Karte titel={t(modul.titel, lang)} aktionen={<Seg wert={lang} onChange={setLang} optionen={[{ wert: "de", label: "Deutsch" }, { wert: "en", label: "English" }]} />}>
            <div className="small muted">Pflicht für: {t(modul.pflichtFuer, lang)} · ca. {modul.minuten} Minuten · {modul.karten.length} Karten · {modul.quiz.length} Quizfragen</div>
            <div className="col mt2">
              {modul.karten.map((k, i) => (
                <div key={i} className="pv-card flat" style={{ background: "var(--mist)" }}>
                  <b>{k.icon} {t(k.titel, lang)}</b>
                  <p className="mt1">{t(k.text, lang)}</p>
                </div>
              ))}
              <h4 className="mt2">Quiz</h4>
              {modul.quiz.map((q, i) => (
                <div key={i}>
                  <b>{i + 1}. {t(q.frage, lang)}</b>
                  <ul className="small" style={{ margin: "0.2rem 0 0", paddingLeft: "1.2rem" }}>{q.optionen.map((o, j) => <li key={j} style={{ color: o.richtig ? "var(--ok)" : undefined, fontWeight: o.richtig ? 700 : 400 }}>{t(o.text, lang)}{o.richtig ? " ✓" : ""}</li>)}</ul>
                </div>
              ))}
            </div>
            {modus === "demo" ? <div className="row mt3"><Btn v="sec" onClick={() => melde("Prototyp: neue Version veröffentlichen – alle müssen neu bestätigen.")}>Neue Version veröffentlichen</Btn><Offen nr={0}>Freigabe der Texte durch Fachkraft für Arbeitssicherheit</Offen></div> : null}
          </Karte>
        </div>
      ) : null}

      {tab === "erinnerung" ? (
        <div className="mt2">
          <Karte titel="Erinnerungen per WhatsApp (14 Tage vor Ablauf)">
            {erinnerungen.length === 0 ? <div className="muted">Heute läuft nichts ab.</div> : null}
            <table className="pv-table">
              <thead><tr><th>Person</th><th>Modul</th><th>Läuft ab</th><th>Text</th></tr></thead>
              <tbody>
                {erinnerungen.map(({ c, m, ack }) => (
                  <tr key={c.id + m}>
                    <td>{vollName(c)}</td><td>{m}</td><td>{formatDatumDE(ablaufDatum(ack.bestaetigtAm))}</td>
                    <td className="small">Hallo {c.vorname}, deine Unterweisung „{m}“ läuft am {formatDatumDE(ablaufDatum(ack.bestaetigtAm))} ab. Kurz erneuern: fess.jobs/crew/unterweisung (ca. 3 Minuten).</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="small muted mt2">{modus === "demo" ? "Im Prototyp wird nichts verschickt." : "Erinnerungen werden noch nicht automatisch verschickt – der Text lässt sich hier kopieren und per WhatsApp senden."}</div>
          </Karte>
        </div>
      ) : null}
    </>
  );
}
