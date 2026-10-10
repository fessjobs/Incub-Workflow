"use client";
// Unterweisungsvideo, das wirklich abgespielt werden muss: eigene Bedienung ohne Vorspulen (zurück ist erlaubt),
// pausiert, wenn der Tab verlassen wird, und meldet erst am Ende „gesehen“. Ein Server prüft zusätzlich,
// dass seit dem Start genug Zeit vergangen ist (siehe Unterweisung am Handy).
import { useEffect, useRef, useState } from "react";
import { begrenzeSprung } from "../logic/video";

export function VideoPlayer({ src, poster, titel, de, onStart, onEnde, onFehler }: { src: string; poster?: string; titel: string; de: boolean; onStart?: () => void; onEnde: () => void; onFehler?: (fehler: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const maxGesehen = useRef(0);
  const gestartet = useRef(false);
  const [laeuft, setLaeuft] = useState(false);
  const [dauer, setDauer] = useState(0);
  const [position, setPosition] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState(false);

  // Beim Verlassen des Tabs anhalten – die Wiedergabe soll nicht nebenbei im Hintergrund durchlaufen
  useEffect(() => {
    const h = () => {
      if (document.hidden) ref.current?.pause();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const umschalten = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.ended) {
        v.currentTime = 0;
      }
      void v.play().catch(() => setFehler(true));
    } else v.pause();
  };

  useEffect(() => {
    onFehler?.(fehler);
  }, [fehler, onFehler]);

  const anteil = dauer > 0 ? Math.min(1, position / dauer) : 0;
  const mmss = (sek: number) => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, "0")}`;

  return (
    <div data-testid="video-player" data-fertig={fertig ? "1" : "0"} data-fehler={fehler ? "1" : "0"} style={{ background: "#000", borderRadius: 14, overflow: "hidden", position: "relative" }}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        aria-label={titel}
        style={{ width: "100%", display: "block", aspectRatio: "9 / 16", maxHeight: "68vh", objectFit: "contain", background: "#000" }}
        onLoadedMetadata={(e) => setDauer(e.currentTarget.duration || 0)}
        onPlay={() => {
          setLaeuft(true);
          if (!gestartet.current) {
            gestartet.current = true;
            onStart?.();
          }
        }}
        onPause={() => setLaeuft(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (t > maxGesehen.current) maxGesehen.current = t;
          setPosition(t);
        }}
        // Vorspulen wird zurückgesetzt (zurückspulen darf man)
        onSeeking={(e) => {
          const v = e.currentTarget;
          const ziel = begrenzeSprung(v.currentTime, maxGesehen.current);
          if (ziel !== v.currentTime) v.currentTime = ziel;
        }}
        onEnded={() => {
          setLaeuft(false);
          setFertig(true);
          setPosition(dauer);
          onEnde();
        }}
        onError={() => setFehler(true)}
      />
      <button
        type="button"
        onClick={umschalten}
        aria-label={laeuft ? (de ? "Pause" : "Pause") : fertig ? (de ? "Noch einmal ansehen" : "Watch again") : de ? "Video abspielen" : "Play video"}
        data-testid="video-play"
        style={{ position: "absolute", inset: 0, width: "100%", height: "calc(100% - 46px)", background: laeuft ? "transparent" : "rgba(10,26,47,.35)", border: 0, cursor: "pointer", color: "#fff", fontSize: "3.2rem" }}
      >
        {laeuft ? "" : fertig ? "↻" : "▶"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.55rem 0.8rem", background: "#0a1a2f", color: "#fff", fontSize: "0.8rem", minHeight: 46 }}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(anteil * 100)} data-testid="video-fortschritt" style={{ flex: 1, height: 6, background: "rgba(255,255,255,.25)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${anteil * 100}%`, height: "100%", background: fertig ? "#2fbf71" : "#ff5a00", transition: "width .25s linear" }} />
        </div>
        <span className="mono" style={{ minWidth: 84, textAlign: "right" }}>{mmss(position)} / {mmss(dauer)}</span>
      </div>
      {fehler ? (
        <div role="alert" style={{ background: "#fff3cd", color: "#5a4300", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }} data-testid="video-fehler">
          {de ? "Das Video lässt sich hier nicht abspielen." : "The video cannot be played here."}{" "}
          <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>{de ? "Video in neuem Tab öffnen" : "Open video in a new tab"}</a>
        </div>
      ) : null}
    </div>
  );
}
