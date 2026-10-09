"use client";
// Rahmen des Prototyps: Banner „Testversion“ (auf jeder Seite), Admin-Gerüst
// (Seitenleiste) und Crew-Gerüst (Handy, untere Leiste).
import { useState, type ReactNode } from "react";
import { Link, STANDALONE, usePath } from "../nav";
import { usePv } from "../state/store";
import { Btn, Modal } from "./kit";
import { MODULE } from "../data/trainings";
import { statusFuer } from "../logic/unterweisung";
import { HEUTE } from "../state/store";

export function Banner() {
  const pfad = usePath();
  const { reset, melde, s } = usePv();
  const [bestaetige, setBestaetige] = useState(false);
  const istCrew = pfad.startsWith("/crew") || pfad.startsWith("/b/");
  const istAdmin = pfad.startsWith("/admin");
  return (
    <>
      <div className="pv-banner pv-noprint" role="banner">
        <span className="tag">Testversion</span>
        <span className="muted" style={{ color: "rgba(255,255,255,.75)" }}>
          Beispieldaten · nichts wird gespeichert oder versendet
        </span>
        <span className="grow" />
        <span className="switch" aria-label="Ansicht wechseln">
          <Link href="/admin" className={istAdmin ? "on" : ""}>
            Dashboard
          </Link>
          <Link href="/crew" className={istCrew ? "on" : ""}>
            Mitarbeiterlink
          </Link>
        </span>
        <Link href="/">Start</Link>
        <Link href="/notizen">Notizen{s.notizen.length ? ` (${s.notizen.length})` : ""}</Link>
        <button type="button" onClick={() => setBestaetige(true)}>
          Zurücksetzen
        </button>
        {!STANDALONE ? <a href="/">← echtes Dashboard</a> : null}
      </div>
      {bestaetige ? (
        <Modal
          titel="Beispieldaten zurücksetzen?"
          onClose={() => setBestaetige(false)}
          fuss={
            <>
              <Btn v="sec" onClick={() => setBestaetige(false)}>
                Abbrechen
              </Btn>
              <Btn
                onClick={() => {
                  reset();
                  setBestaetige(false);
                  melde("Zurückgesetzt – alles wieder wie am Anfang.");
                }}
              >
                Ja, zurücksetzen
              </Btn>
            </>
          }
        >
          <p>Alles, was du im Prototyp geändert hast (Stunden, Einteilungen, Fragebogen, Notizen), geht verloren. Die echte App ist davon nicht betroffen.</p>
        </Modal>
      ) : null}
    </>
  );
}

interface NavEintrag {
  href: string;
  label: string;
  badge?: string | number;
  gruppe?: string;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pfad = usePath();
  const { s } = usePv();
  const offeneBewerber = s.crew.filter((c) => c.status === "Bewerber" && c.profile).length;
  const neueBewerbungen = s.bewerbungen.filter((a) => a.status === "neu").length;
  const eintraege: NavEintrag[] = [
    { href: "/admin", label: "Übersicht", gruppe: "Betrieb" },
    { href: "/admin/dispo", label: "Disposition", badge: s.jobs.length },
    { href: "/admin/bewerber", label: "Bewerber", badge: neueBewerbungen + offeneBewerber },
    { href: "/admin/stunden", label: "Stundentabelle", gruppe: "Abrechnung" },
    { href: "/admin/unterlagen", label: "Unterlagen" },
    { href: "/admin/crew", label: "Crew", gruppe: "Personal" },
    { href: "/admin/unterweisungen", label: "Unterweisungen" },
    { href: "/admin/einstellungen", label: "Einstellungen", gruppe: "System" },
  ];
  const aktiv = (h: string) => (h === "/admin" ? pfad === "/admin" : pfad === h || pfad.startsWith(h + "/"));
  return (
    <div className="pva">
      <nav className="pva-side pv-noprint" aria-label="Dashboard">
        <div className="pv-wordmark">
          incub<span>:</span>workflow
        </div>
        {eintraege.map((e) => (
          <div key={e.href} style={{ display: "contents" }}>
            {e.gruppe ? <div className="grp">{e.gruppe}</div> : null}
            <Link href={e.href} className={aktiv(e.href) ? "on" : ""}>
              {e.label}
              {e.badge !== undefined && e.badge !== 0 ? <span className="badge">{e.badge}</span> : null}
            </Link>
          </div>
        ))}
        <div className="foot">
          Belege, Auslagen und Einsätze bleiben unverändert und sind hier nicht gezeigt. Der Prototyp zeigt nur die neuen Bereiche.
        </div>
      </nav>
      <main className="pva-main" id="inhalt">
        {children}
      </main>
    </div>
  );
}

export function CrewShell({ children, titel }: { children: ReactNode; titel?: string }) {
  const pfad = usePath();
  const { s } = usePv();
  const ich = s.crew.find((c) => c.id === "c-self");
  const offeneUnterweisung = ich ? MODULE.filter((m) => statusFuer(ich.unterweisungen[m.id], HEUTE) === "fehlt").length : 0;
  const nav: Array<{ href: string; label: string; ic: string; on: boolean }> = [
    { href: "/crew", label: s.lang === "de" ? "Start" : "Home", ic: "⌂", on: pfad === "/crew" },
    { href: "/crew/jobs", label: "Jobs", ic: "▤", on: pfad.startsWith("/crew/jobs") },
    { href: "/crew/unterweisung", label: s.lang === "de" ? "Unterweisung" : "Safety", ic: "✓", on: pfad.startsWith("/crew/unterweisung") },
    { href: "/crew/profil", label: s.lang === "de" ? "Profil" : "Profile", ic: "☺", on: pfad.startsWith("/crew/profil") || pfad.startsWith("/crew/fragebogen") },
  ];
  return (
    <div className="pvc">
      <header className="pvc-top">
        <Link href="/crew" className="pv-wordmark" style={{ textDecoration: "none" }}>
          fess<span style={{ color: "var(--orange)" }}>.</span>jobs
        </Link>
        <span className="small" style={{ opacity: 0.85 }}>
          {titel ?? ""}
        </span>
      </header>
      <main className="pvc-main" id="inhalt">
        {children}
      </main>
      <nav className="pvc-nav pv-noprint" aria-label="Mitarbeiter">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={n.on ? "on" : ""}>
            <span className="ic" aria-hidden>
              {n.ic}
            </span>
            {n.label}
            {n.href === "/crew/unterweisung" && offeneUnterweisung > 0 && s.eingeloggt ? <span className="pv-chip orange" style={{ position: "absolute", marginLeft: 26, marginTop: -4, fontSize: "0.6rem", padding: "0 0.35rem" }}>{offeneUnterweisung}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Toast() {
  const { toast } = usePv();
  if (!toast) return null;
  return (
    <div className="pv-toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}

