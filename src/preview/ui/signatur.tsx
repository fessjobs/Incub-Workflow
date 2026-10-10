"use client";
// Unterschriftenfeld (Finger oder Stift): Zeichnen auf einem Canvas, Ausgabe als PNG-Data-URL auf weißem Grund.
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_BREITE = 900;

export function Signatur({ onChange, de, hoehe = 170 }: { onChange: (dataUrl: string | null) => void; de: boolean; hoehe?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const striche = useRef(0);
  const [leer, setLeer] = useState(true);

  // Auflösung an die Größe des Feldes anpassen (scharf auf Handys)
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const einstellen = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Beim Größenänderung bleibt nur das Feld leer, nichts Halbes
      c.width = Math.max(300, Math.round(r.width * dpr));
      c.height = Math.round(hoehe * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.lineWidth = 2.6 * dpr;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0a1a2f";
      }
      striche.current = 0;
      setLeer(true);
      onChange(null);
    };
    einstellen();
    const ro = new ResizeObserver(() => {
      if (striche.current === 0) einstellen();
    });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoehe]);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const ausgeben = useCallback(() => {
    const c = canvas.current;
    if (!c || striche.current === 0) return onChange(null);
    // Auf weißem Grund, höchstens 900 Pixel breit
    const skala = Math.min(1, MAX_BREITE / c.width);
    const out = document.createElement("canvas");
    out.width = Math.round(c.width * skala);
    out.height = Math.round(c.height * skala);
    const ctx = out.getContext("2d");
    if (!ctx) return onChange(null);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  }, [onChange]);

  const beginn = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    zeichnet.current = true;
    const p = punkt(e);
    letzter.current = p;
    // Ein Tipp ergibt einen Punkt
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0a1a2f";
      ctx.fill();
    }
  };
  const bewegung = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!zeichnet.current) return;
    const ctx = canvas.current?.getContext("2d");
    const von = letzter.current;
    if (!ctx || !von) return;
    const nach = punkt(e);
    ctx.beginPath();
    ctx.moveTo(von.x, von.y);
    ctx.lineTo(nach.x, nach.y);
    ctx.stroke();
    letzter.current = nach;
    if (Math.hypot(nach.x - von.x, nach.y - von.y) > 0) striche.current++;
  };
  const ende = () => {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    letzter.current = null;
    if (striche.current > 4) {
      setLeer(false);
      ausgeben();
    }
  };
  const loeschen = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    striche.current = 0;
    setLeer(true);
    onChange(null);
  };

  return (
    <div>
      <div style={{ position: "relative", border: "2px dashed #9aa7ba", borderRadius: 12, background: "#fff", touchAction: "none" }}>
        <canvas
          ref={canvas}
          data-testid="signatur"
          aria-label={de ? "Unterschriftenfeld" : "Signature field"}
          style={{ width: "100%", height: hoehe, display: "block", touchAction: "none", cursor: "crosshair" }}
          onPointerDown={beginn}
          onPointerMove={bewegung}
          onPointerUp={ende}
          onPointerCancel={ende}
          onPointerLeave={ende}
        />
        {leer ? <div aria-hidden style={{ position: "absolute", left: 14, top: 12, color: "#9aa7ba", pointerEvents: "none", fontSize: "0.9rem" }}>{de ? "Hier unterschreiben" : "Sign here"}</div> : null}
        <div aria-hidden style={{ position: "absolute", left: 14, right: 14, bottom: 30, borderBottom: "1px solid #c7d0de", pointerEvents: "none" }} />
      </div>
      <button type="button" className="pv-btn ghost sm" style={{ marginTop: 6 }} onClick={loeschen} data-testid="signatur-loeschen">
        {de ? "Neu unterschreiben" : "Clear"}
      </button>
    </div>
  );
}
