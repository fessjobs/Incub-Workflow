"use client";

// Unterschriftenfeld (Canvas, Touch + Maus + Stift). Liefert ein PNG als
// Data-URL; leere Unterschriften werden erkannt.
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

export type SignaturePadHandle = { clear: () => void; toDataUrl: () => string | null; isEmpty: () => boolean };

type Props = { onChange?: (empty: boolean) => void; label?: string; testId?: string };

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ onChange, label, testId }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    // Inhalt beim Resize übernehmen
    const prev = document.createElement("canvas");
    prev.width = canvas.width;
    prev.height = canvas.height;
    prev.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1A1613";
    if (prev.width > 0 && prev.height > 0) ctx.drawImage(prev, 0, 0, prev.width / ratio, prev.height / ratio);
  }, []);

  useEffect(() => {
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, [setup]);

  const point = (e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    strokes.current += 1;
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    strokes.current = 0;
    setEmpty(true);
    onChange?.(true);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => strokes.current === 0,
    toDataUrl: () => {
      const canvas = canvasRef.current;
      if (!canvas || strokes.current === 0) return null;
      // Export auf weißem Hintergrund, begrenzte Größe
      const out = document.createElement("canvas");
      const scale = Math.min(1, 900 / canvas.width);
      out.width = Math.round(canvas.width * scale);
      out.height = Math.round(canvas.height * scale);
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  }));

  return (
    <div>
      {label ? <span className="ez-label">{label}</span> : null}
      <div className="ez-sig" data-testid={testId ?? "signature-pad"}>
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} aria-label="Unterschriftenfeld" />
        {empty ? <div className="ez-sig-hint">Hier mit dem Finger unterschreiben</div> : null}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={clear}>
          Löschen
        </button>
      </div>
    </div>
  );
});
