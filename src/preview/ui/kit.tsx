"use client";
// Kleine Bausteine des Prototyps. Bewusst ohne Fremdbibliothek.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "../nav";
import type { Ampel as AmpelTyp } from "../logic/grenzen";
import { usePv } from "../state/store";
import { ampelText } from "../logic/grenzen";

type Variante = "prim" | "sec" | "navy" | "ghost" | "danger";

const klasseFuer = (v: Variante, groesse?: "sm" | "lg", block?: boolean) =>
  ["pv-btn", v === "sec" ? "sec" : v === "navy" ? "navy" : v === "ghost" ? "ghost" : v === "danger" ? "danger" : "", groesse ?? "", block ? "block" : ""].filter(Boolean).join(" ");

export function Btn({ v = "prim", groesse, block, className, ...rest }: { v?: Variante; groesse?: "sm" | "lg"; block?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} className={`${klasseFuer(v, groesse, block)} ${className ?? ""}`} />;
}

export function LinkBtn({ href, v = "prim", groesse, block, children, className, ...rest }: { href: string; v?: Variante; groesse?: "sm" | "lg"; block?: boolean; children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <Link href={href} className={`${klasseFuer(v, groesse, block)} ${className ?? ""}`} {...rest}>
      {children}
    </Link>
  );
}

export function Chip({ ton, children, mono, title }: { ton?: "gut" | "warn" | "err" | "info" | "orange" | "navy"; children: ReactNode; mono?: boolean; title?: string }) {
  return (
    <span className={`pv-chip ${ton ?? ""} ${mono ? "mono" : ""}`} title={title}>
      {children}
    </span>
  );
}

// Markiert eine Annahme, die Maik noch bestätigen muss (offene Punkte des Plans)
export function Offen({ children, nr }: { children?: ReactNode; nr?: number }) {
  const { modus } = usePv();
  // Im echten System sind die offenen Punkte in docs/neu-system.md festgehalten, nicht auf jeder Seite
  if (modus !== "demo") return null;
  return (
    <span className="pv-offen" title="Offener Punkt – Annahme des Prototyps, bitte prüfen">
      ⚑ offen{nr ? ` ${nr}` : ""}
      {children ? <span style={{ fontWeight: 400 }}>· {children}</span> : null}
    </span>
  );
}

export function Entwurf({ children }: { children: ReactNode }) {
  return <div className="pv-entwurf">{children}</div>;
}

export function Note({ ton, children }: { ton?: "warn" | "err" | "ok"; children: ReactNode }) {
  return <div className={`pv-note ${ton ?? ""}`}>{children}</div>;
}

export function Stat({ wert, label, ton }: { wert: ReactNode; label: string; ton?: "gut" | "warn" | "err" }) {
  return (
    <div className="pv-stat">
      <div className="v" style={ton === "err" ? { color: "var(--err)" } : ton === "warn" ? { color: "var(--warn)" } : ton === "gut" ? { color: "var(--ok)" } : undefined}>
        {wert}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Bar({ anteil, ton }: { anteil: number; ton?: "gut" | "warn" | "err" }) {
  return (
    <div className={`pv-bar ${ton ?? ""}`} role="progressbar" aria-valuenow={Math.round(anteil * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, anteil)) * 100}%` }} />
    </div>
  );
}

export function AmpelPunkt({ a, mitText }: { a: AmpelTyp; mitText?: boolean }) {
  return (
    <span className="row gap1" style={{ display: "inline-flex" }} title={ampelText(a)}>
      <i className={`pv-ampel ${a === "grau" ? "" : a}`} />
      {mitText ? <span className="small">{ampelText(a)}</span> : null}
    </span>
  );
}

export function Feld({ label, hint, fehler, children }: { label?: string; hint?: string; fehler?: string | null; children: ReactNode }) {
  return (
    <div className="pv-field">
      {label ? <label className="pv-label">{label}</label> : null}
      {children}
      {hint ? <div className="pv-hint">{hint}</div> : null}
      {fehler ? <div className="pv-error">{fehler}</div> : null}
    </div>
  );
}

export function Seg<T extends string>({ wert, optionen, onChange, stretch }: { wert: T | null; optionen: Array<{ wert: T; label: string }>; onChange: (w: T) => void; stretch?: boolean }) {
  return (
    <div className={`pv-seg ${stretch ? "stretch" : ""}`} role="group">
      {optionen.map((o) => (
        <button key={o.wert} type="button" className={wert === o.wert ? "on" : ""} onClick={() => onChange(o.wert)} aria-pressed={wert === o.wert}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function JaNein({ wert, onChange, lang = "de" }: { wert: boolean | null; onChange: (w: boolean) => void; lang?: "de" | "en" }) {
  return (
    <div className="pv-seg" role="group">
      <button type="button" className={wert === true ? "on" : ""} onClick={() => onChange(true)} aria-pressed={wert === true}>
        {lang === "de" ? "Ja" : "Yes"}
      </button>
      <button type="button" className={wert === false ? "on" : ""} onClick={() => onChange(false)} aria-pressed={wert === false}>
        {lang === "de" ? "Nein" : "No"}
      </button>
    </div>
  );
}

export function Tabs<T extends string>({ wert, tabs, onChange }: { wert: T; tabs: Array<{ id: T; label: string; n?: number }>; onChange: (t: T) => void }) {
  return (
    <div className="pv-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={wert === t.id} className={wert === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          {t.label}
          {t.n !== undefined ? <span className="n">{t.n}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titel, onClose, wide, children, fuss }: { titel: string; onClose: () => void; wide?: boolean; children: ReactNode; fuss?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="pv-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pv-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={titel}>
        <div className="row between" style={{ marginBottom: "0.8rem" }}>
          <h2>{titel}</h2>
          <Btn v="ghost" groesse="sm" onClick={onClose} aria-label="Schließen">
            ✕
          </Btn>
        </div>
        {children}
        {fuss ? <div className="row wrap mt3" style={{ justifyContent: "flex-end" }}>{fuss}</div> : null}
      </div>
    </div>
  );
}

export function Kopf({ titel, sub, aktionen, eyebrow }: { titel: string; sub?: ReactNode; aktionen?: ReactNode; eyebrow?: string }) {
  return (
    <div className="pva-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{titel}</h1>
        {sub ? <div className="muted mt1">{sub}</div> : null}
      </div>
      {aktionen ? <div className="row wrap">{aktionen}</div> : null}
    </div>
  );
}

// ─── Hilfsfunktionen für Dateien und Zwischenablage ─────────────────────────

export function ladeTextHerunter(name: string, text: string, mime = "text/csv;charset=utf-8"): void {
  // BOM, damit Excel Umlaute richtig liest
  const blob = new Blob(["﻿", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function kopiere(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function useDebounced<T>(wert: T, ms = 250): T {
  const [v, setV] = useState(wert);
  useEffect(() => {
    const t = setTimeout(() => setV(wert), ms);
    return () => clearTimeout(t);
  }, [wert, ms]);
  return v;
}

export function useStabil<T>(wert: T): { current: T } {
  const r = useRef(wert);
  r.current = wert;
  return r;
}

// kleine Karte mit Überschrift
export function Karte({ titel, aktionen, children, ton }: { titel?: string; aktionen?: ReactNode; children: ReactNode; ton?: "navy" | "orange" }) {
  return (
    <section className={`pv-card ${ton ?? ""}`}>
      {titel || aktionen ? (
        <div className="row between" style={{ marginBottom: "0.7rem" }}>
          {titel ? <h3>{titel}</h3> : <span />}
          {aktionen}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Initialen({ name }: { name: string }) {
  const t = name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--navy)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--head)", fontWeight: 800, fontSize: "0.95rem", flex: "none" }} aria-hidden>
      {t}
    </span>
  );
}
