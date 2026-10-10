"use client";
// Unterweisung am Handy (Modul C): Lernkarten, Quiz ab 80 %, bei falscher
// Antwort erscheint die passende Karte erneut, danach Bestätigung und Nachweis.
import { useEffect, useMemo, useState } from "react";
import { Link, gehe } from "../nav";
import { usePv, selbst, HEUTE } from "../state/store";
import { Btn, Chip, Entwurf, Karte, LinkBtn, Note, ladeTextHerunter } from "../ui/kit";
import { CrewGate, SpracheSchalter } from "./crew-start";
import { AKTUELLE_VERSION, MODULE, NACHWEIS_HINWEIS, modulById, t } from "../data/trainings";
import { ablaufDatum, mischen, pflichtModule, quizBestanden, statusFuer } from "../logic/unterweisung";
import { formatDatumDE } from "../logic/zeit";
import { videoEinbettung, videoPoster } from "../logic/video";
import { VideoPlayer } from "../ui/video-player";
import { Signatur } from "../ui/signatur";

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
    for (const m of pflichtModule(tn, { hoehe: job.hoehe, kunde: job.kunde, zusatz: job.zusatzModule }, s.einst.schulung)) pflichtFuerMich.add(m);
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

type Phase = "video" | "karten" | "quiz" | "ergebnis" | "bestaetigung" | "unterschrift" | "fertig";

// Videos, die nicht der eigene Player abspielt (YouTube, Vimeo, Link): eingebettet, bestätigt wird per Haken
function FremdVideo({ emb, titel, de }: { emb: NonNullable<ReturnType<typeof videoEinbettung>>; titel?: string; de: boolean }) {
  if (emb.art === "iframe") {
    return (
      <div className="pv-video" style={{ padding: 0, aspectRatio: "16 / 9", overflow: "hidden" }} data-testid="video">
        <iframe src={emb.src} title={titel || (de ? "Unterweisungsvideo" : "Briefing video")} style={{ width: "100%", height: "100%", border: 0 }} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  return (
    <div className="pv-video" data-testid="video">
      <a href={emb.src} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>▶ {titel || (de ? "Video öffnen" : "Open video")}</a>
    </div>
  );
}

export function CrewModul({ id }: { id: string }) {
  return <CrewGate><ModulInhalt id={id} /></CrewGate>;
}

function ModulInhalt({ id }: { id: string }) {
  const { s, set, melde, modus, crewAktion } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const mod = modulById(id);
  // Video nur im echten System: die Testversion hat keinen Zugriff auf die Videodateien
  const video = mod && modus !== "demo" ? s.einst.schulung.video[mod.id] : undefined;
  const videoUrl = s.lang === "en" && video?.urlEn ? video.urlEn : video?.url;
  const emb = videoUrl ? videoEinbettung(videoUrl) : null;
  const videoPflichtig = Boolean(emb && video?.pflicht);
  const [phase, setPhase] = useState<Phase>(emb ? "video" : "karten");
  const [karte, setKarte] = useState(0);
  const [frage, setFrage] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [richtig, setRichtig] = useState(0);
  const [versuch, setVersuch] = useState(1);
  const [haken, setHaken] = useState(false);
  // Video: im Player zu Ende gesehen („player“) oder von Hand bestätigt („manuell“, wenn es hier nicht abspielbar ist)
  const [videoModus, setVideoModus] = useState<"player" | "manuell" | null>(null);
  const [playerFehler, setPlayerFehler] = useState(false);
  const [videoHaken, setVideoHaken] = useState(false);
  const [unterschrift, setUnterschrift] = useState<string | null>(null);
  const [abgeschlossenAm, setAbgeschlossenAm] = useState<number | null>(null);
  const [vorherNachweis, setVorherNachweis] = useState<string | undefined>(undefined);
  const [zuLange, setZuLange] = useState(false);

  // Hat die Seite zuerst ohne Einstellungen gerendert (Server-Stand noch nicht da), gilt das Video, sobald es bekannt ist
  useEffect(() => {
    if (emb && phase === "karten" && karte === 0 && videoModus === null && richtig === 0 && gewaehlt === null && frage === 0 && versuch === 1 && abgeschlossenAm === null && !haken) setPhase("video");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(emb)]);

  const reihenfolgen = useMemo(() => (mod ? mod.quiz.map((q, i) => mischen(q.optionen.map((_, k) => k), versuch * 31 + i * 7 + 3)) : []), [mod, versuch]);

  const ack = mod ? ich.unterweisungen[mod.id] : undefined;
  // Im echten System gilt es erst als abgeschlossen, wenn der Server das Nachweis-PDF angelegt hat
  const gespeichert = modus !== "crew" || Boolean(ack?.nachweisId && ack.nachweisId !== vorherNachweis);
  useEffect(() => {
    if (phase !== "fertig" || gespeichert) return;
    const t = setTimeout(() => setZuLange(true), 20_000);
    return () => clearTimeout(t);
  }, [phase, gespeichert]);

  if (!mod) return <Note ton="err">{de ? "Modul nicht gefunden." : "Module not found."}</Note>;
  const q = mod.quiz[frage];
  const bestanden = quizBestanden(richtig, mod.quiz.length);
  const videoErfuellt = !videoPflichtig || videoModus !== null;

  const abschliessen = () => {
    if (!unterschrift) return;
    const modulId = mod.id;
    setVorherNachweis(ich.unterweisungen[modulId]?.nachweisId);
    setAbgeschlossenAm(Date.now());
    setZuLange(false);
    set((st) => ({
      ...st,
      crew: st.crew.map((c) =>
        c.id === ich.id
          ? { ...c, unterweisungen: { ...c.unterweisungen, [modulId]: { version: AKTUELLE_VERSION, bestaetigtAm: HEUTE, quizScore: richtig / mod.quiz.length, video: emb ? (videoModus ?? "keins") : "keins", unterschriftAm: new Date().toISOString(), unterschrift } } }
          : c
      ),
    }));
    setPhase("fertig");
    melde(de ? "Unterweisung unterschrieben." : "Briefing signed.");
  };

  const nachweisText = [
    modus === "demo" ? "NACHWEIS UNTERWEISUNG (Prototyp)" : "NACHWEIS UNTERWEISUNG",
    `Person: ${ich.vorname} ${ich.nachname} (${ich.pnr})`,
    `Modul: ${t(mod.titel, "de")}`,
    `Bestätigt und unterschrieben am: ${formatDatumDE(HEUTE)}`,
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

      {phase === "video" && emb ? (
        <>
          <div className="small muted">{de ? `Schritt 1: Video ansehen${videoPflichtig ? " (bis zum Ende, Vorspulen ist nicht möglich)" : ""}` : `Step 1: watch the video${videoPflichtig ? " (to the end, skipping ahead is not possible)" : ""}`}</div>
          {emb.art === "video" ? (
            <VideoPlayer
              key={emb.src}
              src={emb.src}
              poster={videoPoster(emb.src)}
              titel={video?.titel || t(mod.titel, s.lang)}
              de={de}
              onStart={() => void crewAktion?.({ typ: "unterweisung-start", modul: mod.id })}
              onEnde={() => setVideoModus("player")}
              onFehler={setPlayerFehler}
            />
          ) : (
            <FremdVideo emb={emb} titel={video?.titel} de={de} />
          )}
          {videoModus === "player" ? <Note ton="ok"><span data-testid="video-fertig-hinweis">✓ {de ? "Video gesehen." : "Video watched."}</span></Note> : null}
          {videoPflichtig && videoModus !== "player" && (emb.art !== "video" || playerFehler) ? (
            <label className="pv-check"><input type="checkbox" checked={videoHaken} onChange={(e) => { setVideoHaken(e.target.checked); setVideoModus(e.target.checked ? "manuell" : null); }} data-testid="video-gesehen" /><span>{emb.art === "video" ? (de ? "Das Video lässt sich hier nicht abspielen. Ich habe es auf andere Weise vollständig angesehen." : "The video cannot be played here. I have watched it in full another way.") : de ? "Ich habe das Video angesehen." : "I have watched the video."}</span></label>
          ) : null}
          <Btn block data-testid="video-weiter" disabled={!videoErfuellt} onClick={() => { setPhase("karten"); setKarte(0); }}>{de ? "Weiter zu den Lernkarten" : "Continue to the cards"}</Btn>
          {!videoErfuellt ? <div className="tiny muted" style={{ textAlign: "center" }}>{de ? "Der Knopf wird frei, sobald das Video zu Ende gelaufen ist." : "The button unlocks when the video has finished."}</div> : null}
        </>
      ) : null}

      {phase === "karten" ? (
        <>
          <div className="pv-lesson" data-testid="karte">
            {karte === 0 && !emb ? <div className="pv-video">▶ {t(mod.video, s.lang)}</div> : null}
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
          <div className="mt2"><Btn block disabled={!haken} onClick={() => setPhase("unterschrift")} data-testid="zur-unterschrift">{de ? "Weiter zur Unterschrift" : "Continue to signature"}</Btn></div>
        </Karte>
      ) : null}

      {phase === "unterschrift" ? (
        <Karte>
          <div className="eyebrow">{de ? "Letzter Schritt" : "Last step"}</div>
          <h2 className="mt1">{de ? "Unterschrift" : "Signature"}</h2>
          <p className="small mt1">{de ? `Mit deiner Unterschrift bestätigst du, dass du die Unterweisung „${t(mod.titel, "de")}“ durchgearbeitet, gelesen und verstanden hast.` : `With your signature you confirm that you have worked through, read and understood the briefing “${t(mod.titel, "en")}”.`}</p>
          <div className="mt2"><Signatur de={de} onChange={setUnterschrift} /></div>
          <div className="mt2"><Btn block disabled={!unterschrift} onClick={abschliessen} data-testid="bestaetigen-uw">{de ? "Unterschreiben und abschließen" : "Sign and finish"}</Btn></div>
          {!unterschrift ? <div className="tiny muted mt1" style={{ textAlign: "center" }}>{de ? "Bitte mit dem Finger oder Stift im Feld unterschreiben." : "Please sign in the field with your finger or a pen."}</div> : null}
        </Karte>
      ) : null}

      {phase === "fertig" ? (
        <>
          <Karte>
            <div className="eyebrow">{de ? "Nachweis" : "Record"}</div>
            <h2 className="mt1" data-testid="uw-fertig">✓ {de ? "Gültig bis " : "Valid until "}{formatDatumDE(ablaufDatum(HEUTE))}</h2>
            {unterschrift ? <img src={unterschrift} alt={de ? "Deine Unterschrift" : "Your signature"} style={{ maxWidth: 260, width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", marginTop: "0.6rem" }} /> : null}
            {modus === "crew" ? (
              gespeichert ? (
                <p className="small mt2" data-testid="nachweis-gespeichert">{de ? "Dein Nachweis ist gespeichert." : "Your record is saved."}</p>
              ) : zuLange ? (
                <Note ton="warn"><span data-testid="nachweis-fehler">{de ? "Der Nachweis konnte nicht gespeichert werden. Bitte noch einmal unterschreiben." : "The record could not be saved. Please sign again."}</span> <Btn groesse="sm" v="sec" onClick={() => { setZuLange(false); setPhase("unterschrift"); }}>{de ? "Erneut versuchen" : "Try again"}</Btn></Note>
              ) : (
                <p className="small mt2 muted">{de ? "Wird gespeichert …" : "Saving …"}</p>
              )
            ) : (
              <pre className="small mt2" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--body)", margin: "0.6rem 0 0" }}>{nachweisText}</pre>
            )}
          </Karte>
          {modus === "crew" ? (
            gespeichert ? <a className="pv-btn sec block" href={`/api/neu/crew/nachweis/${mod.id}`} target="_blank" rel="noopener noreferrer" data-testid="nachweis-pdf">{de ? "Nachweis als PDF öffnen" : "Open record as PDF"}</a> : null
          ) : (
            <Btn v="sec" block onClick={() => ladeTextHerunter(`nachweis-${mod.id}.txt`, nachweisText, "text/plain;charset=utf-8")}>{de ? "Nachweis herunterladen (PDF im echten System)" : "Download record (PDF in the real system)"}</Btn>
          )}
          {s.rueck ? <Btn block data-testid="zurueck-bewerbung" disabled={!gespeichert} onClick={() => { const ziel = s.rueck as string; set((st) => ({ ...st, rueck: null })); gehe(ziel); }}>{de ? "Zurück zur Bewerbung" : "Back to application"}</Btn> : <LinkBtn href="/crew/unterweisung" block>{de ? "Zur Übersicht" : "To overview"}</LinkBtn>}
        </>
      ) : null}
    </div>
  );
}
