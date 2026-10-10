"use client";
// Vorstellungsvideo: wer FESS ist, wie es vom Bewerben bis zum Lohn läuft. Die Person wählt Deutsch oder Englisch,
// danach läuft das Video (mit den üblichen Bedienelementen – anders als bei der Unterweisung darf man vor- und zurückspulen).
import { useState } from "react";
import { Link } from "../nav";
import { usePv } from "../state/store";
import { Btn, Karte, Note } from "../ui/kit";
import { CrewGate, SpracheSchalter } from "./crew-start";
import { vorstellungVideo, type VorstellungSprache } from "../logic/vorstellung";

export function CrewVorstellung() {
  return <CrewGate><VorstellungInhalt /></CrewGate>;
}

function VorstellungInhalt() {
  const { s, modus } = usePv();
  const de = s.lang === "de";
  const [wahl, setWahl] = useState<VorstellungSprache | null>(null);
  const [fehler, setFehler] = useState(false);
  const waehle = (l: VorstellungSprache) => {
    setFehler(false);
    setWahl(l);
  };
  const quelle = wahl ? vorstellungVideo(wahl) : null;
  const optionen: Array<[VorstellungSprache, string]> = [["de", "Deutsch"], ["en", "English"]];

  return (
    <div className="col gap2" data-testid="vorstellung">
      <div className="row between"><Link href="/crew" className="small">← {de ? "Zurück zum Start" : "Back to start"}</Link><SpracheSchalter /></div>
      <div>
        <div className="eyebrow">fess.jobs</div>
        <h1>{de ? "Vorstellungsvideo" : "Introduction video"}</h1>
      </div>
      <p className="muted small">{de ? "Etwa eine Minute: wer wir sind, wie es von der Bewerbung bis zum Lohn läuft und wer dir weiterhilft." : "About one minute: who we are, how it works from applying to payday, and who can help you."}</p>

      <Karte>
        <h3>{de ? "In welcher Sprache möchtest du es ansehen?" : "Which language would you like to watch it in?"}</h3>
        <div className="row mt2" role="group" aria-label={de ? "Sprache des Videos" : "Video language"}>
          {optionen.map(([l, name]) => (
            <Btn key={l} block v={wahl === l ? "prim" : "sec"} aria-pressed={wahl === l} data-testid={`vorstellung-${l}`} onClick={() => waehle(l)}>{name}</Btn>
          ))}
        </div>
      </Karte>

      {quelle ? (
        modus === "demo" ? (
          <Note>{de ? "In der Testversion gibt es das Video nicht – im echten System läuft es hier ab." : "The video is not available in the test version – in the real system it plays here."}</Note>
        ) : (
          <div className="col gap1">
            <div style={{ background: "#000", borderRadius: 14, overflow: "hidden" }}>
              <video
                key={wahl}
                data-testid="vorstellung-video"
                src={quelle.video}
                poster={quelle.poster}
                controls
                playsInline
                autoPlay
                preload="metadata"
                aria-label={de ? "Vorstellungsvideo" : "Introduction video"}
                style={{ width: "100%", display: "block", aspectRatio: "9 / 16", maxHeight: "70vh", objectFit: "contain", background: "#000" }}
                onError={() => setFehler(true)}
              />
            </div>
            {fehler ? (
              <Note ton="warn"><span data-testid="vorstellung-fehler">{de ? "Das Video lässt sich hier nicht abspielen." : "The video cannot be played here."}</span>{" "}<a href={quelle.video} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>{de ? "In neuem Tab öffnen" : "Open in a new tab"}</a></Note>
            ) : (
              <div className="tiny muted">{de ? "Mit Ton und Untertiteln. Falls es nicht von selbst startet: auf Play tippen." : "With sound and subtitles. If it does not start by itself, tap play."}</div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
