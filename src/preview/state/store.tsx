"use client";
// Zustand des Prototyps: nur im Browser (React + sessionStorage). Nichts
// davon erreicht einen Server oder eine Datenbank. „Zurücksetzen“ stellt die
// Beispieldaten wieder her.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Application, AuditEintrag, Crew, Job, Lang, StundenRow } from "../logic/types";
import { baueDemo, DEMO_HEUTE, SELF_ID, type VergangenerAuftrag } from "../data/demo";
import { leereAntworten, type Antworten } from "../logic/profil";
import { DEFAULT_SCORING, type ScoringSettings } from "../logic/scoring";
import { DEFAULT_XP, type XpSettings } from "../logic/xp";
import { DEFAULT_EXPORT, type ExportEinstellungen } from "../logic/export";
import type { Abweichung, Belegart, BelegAuslesung } from "../logic/beleg";

const SCHLUESSEL = "pv.state.v1";

export interface Einstellungen {
  scoring: ScoringSettings;
  xp: XpSettings;
  exp: ExportEinstellungen;
  // Minijob-Verdienstgrenze je Monat. Standardwert ist eine Annahme und vor
  // dem Einsatz zu prüfen – ändert sich mit dem Mindestlohn.
  minijobEur: number;
  fragebogenLinkText: string;
}

export interface Notiz {
  id: string;
  zeit: string;
  bereich: string;
  text: string;
}

export interface BelegEintrag {
  id: string;
  zeit: string;
  pnr: string;
  art: Belegart;
  betrag: number | null;
  datum: string;
  haendler: string;
  zweck: string;
  auftragId: string;
  dateiname: string;
  gelesen: BelegAuslesung;
  abweichungen: Abweichung[];
  beiblatt: string;
}

export interface Zuweisung {
  pnr: string;
  begruendung: string | null;
}

export interface BewerbungEntwurf {
  schichtIds: string[];
  eigeneAnreise: boolean | null;
  // „Ich habe schon einen Vertrag bei FESS“ (Entscheidung 7 des Plans)
  hatVertrag: boolean | null;
  abfahrtsort: string;
  plaetze: number;
  kommentar: string;
  schritt: number;
  bestaetigt: boolean;
}

export interface PvState {
  lang: Lang;
  crew: Crew[];
  jobs: Job[];
  bewerbungen: Application[];
  auftraege: VergangenerAuftrag[];
  stunden: StundenRow[];
  audit: AuditEintrag[];
  einst: Einstellungen;
  // Schicht-ID → eingeplante Personen
  zuweisung: Record<string, Zuweisung[]>;
  briefingGesendet: Record<string, string>;
  belege: BelegEintrag[];
  notizen: Notiz[];
  // Crew-Seite: Mara Beispiel
  antworten: Antworten;
  etappe: number;
  fragebogenFertig: boolean;
  dsgvo: boolean;
  eingeloggt: boolean;
  // Wohin es nach einer Unterweisung zurückgeht (Bewerbung läuft)
  rueck: string | null;
  // Angefangene Bewerbungen je Auftrag (bleiben erhalten, wenn man zwischendurch die Unterweisung macht)
  entwurf: Record<string, BewerbungEntwurf>;
}

export function initialerZustand(): PvState {
  const d = baueDemo();
  const crew = [...d.crew, d.self];
  // Bestätigte Bewerbungen sind die Ausgangsbesetzung der Disposition
  const zuweisung: Record<string, Zuweisung[]> = {};
  for (const a of d.bewerbungen) {
    if (a.status !== "bestätigt") continue;
    const sid = a.schichtIds[0];
    (zuweisung[sid] ??= []).push({ pnr: a.pnr, begruendung: null });
  }
  return {
    lang: "de",
    crew,
    jobs: d.jobs,
    bewerbungen: d.bewerbungen,
    auftraege: d.auftraege,
    stunden: d.stunden,
    audit: [],
    einst: { scoring: DEFAULT_SCORING, xp: DEFAULT_XP, exp: DEFAULT_EXPORT, minijobEur: 603, fragebogenLinkText: "Hallo {vorname}, hier ist dein persönlicher Link zum Crew-Fragebogen von fess.jobs: {link} – dauert ca. 8 Minuten, du kannst jederzeit unterbrechen und später weitermachen." },
    zuweisung,
    briefingGesendet: {},
    belege: [],
    notizen: [],
    antworten: leereAntworten(),
    etappe: 1,
    fragebogenFertig: false,
    dsgvo: false,
    eingeloggt: false,
    rueck: null,
    entwurf: {},
  };
}

interface Ctx {
  s: PvState;
  set: (fn: (s: PvState) => PvState) => void;
  reset: () => void;
  toast: string | null;
  melde: (text: string) => void;
  geladen: boolean;
}

const PvContext = createContext<Ctx | null>(null);

export function PvProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PvState>(() => initialerZustand());
  const [geladen, setGeladen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gespeicherten Stand erst nach dem Mounten lesen – Server und Browser rendern
  // beim ersten Mal dasselbe (Beispieldaten), sonst gäbe es Hydration-Fehler.
  useEffect(() => {
    try {
      const roh = window.sessionStorage.getItem(SCHLUESSEL);
      if (roh) {
        const p = JSON.parse(roh) as { v?: number; s?: PvState };
        if (p.v === 1 && p.s) setS({ ...initialerZustand(), ...p.s });
      }
    } catch {
      /* ohne sessionStorage läuft der Prototyp nur im Speicher */
    }
    setGeladen(true);
  }, []);

  const aktuell = useRef(s);
  aktuell.current = s;
  const speichern = useCallback(() => {
    try {
      window.sessionStorage.setItem(SCHLUESSEL, JSON.stringify({ v: 1, s: aktuell.current }));
    } catch {
      /* Speicher voll oder gesperrt – egal */
    }
  }, []);

  useEffect(() => {
    if (!geladen) return;
    const t = setTimeout(speichern, 500);
    return () => clearTimeout(t);
  }, [s, geladen, speichern]);

  // Beim Verlassen oder Neuladen sofort sichern, damit nichts aus den letzten 500 ms fehlt
  useEffect(() => {
    if (!geladen) return;
    const raus = () => speichern();
    window.addEventListener("pagehide", raus);
    document.addEventListener("visibilitychange", raus);
    return () => {
      window.removeEventListener("pagehide", raus);
      document.removeEventListener("visibilitychange", raus);
    };
  }, [geladen, speichern]);

  const set = useCallback((fn: (x: PvState) => PvState) => setS((x) => fn(x)), []);
  const reset = useCallback(() => {
    try {
      window.sessionStorage.removeItem(SCHLUESSEL);
    } catch {
      /* egal */
    }
    setS(initialerZustand());
  }, []);
  const melde = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const wert = useMemo(() => ({ s, set, reset, toast, melde, geladen }), [s, set, reset, toast, melde, geladen]);
  return <PvContext.Provider value={wert}>{children}</PvContext.Provider>;
}

export function usePv(): Ctx {
  const c = useContext(PvContext);
  if (!c) throw new Error("PvProvider fehlt");
  return c;
}

// ─── Ableitungen ────────────────────────────────────────────────────────────

export function selbst(s: PvState): Crew {
  return s.crew.find((c) => c.id === SELF_ID) as Crew;
}

export function crewNachPnr(s: PvState): Map<string, Crew> {
  return new Map(s.crew.map((c) => [c.pnr, c]));
}

// Personen, die in Listen auftauchen: Mara erst, wenn sie den Fragebogen abgegeben hat
export function sichtbareCrew(s: PvState): Crew[] {
  return s.crew.filter((c) => c.id !== SELF_ID || c.profile !== null);
}

export function neueAudit(user: string, tabelle: string, datensatz: string, feld: string, alt: string, neu: string, grund: string | null = null): AuditEintrag {
  return { id: `au-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, zeitpunkt: new Date().toISOString(), user, tabelle, datensatz, feld, alt, neu, grund };
}

export const HEUTE = DEMO_HEUTE;
