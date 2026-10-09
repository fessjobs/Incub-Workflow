"use client";
// Zustand der Crew-Seiten im echten System: dieselbe Form wie im Prototyp, aber
// vom Server. Die Crew darf nur ganz bestimmte Dinge tun (Entwurf speichern,
// Fragebogen abschicken, Unterweisung bestätigen, bewerben); jede Änderung geht
// als eigene, serverseitig geprüfte Aktion hinaus – nie als freier Datensatz.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PvContext, leererZustand, setzeHeute, standardEinstellungen, type Ctx, type PvState } from "@/preview/state/store";
import { leereAntworten, type Antworten } from "@/preview/logic/profil";
import type { Application, Crew, Job } from "@/preview/logic/types";
import { modulById } from "@/preview/data/trainings";
import { heuteBerlin } from "@/preview/logic/zeit";

setzeHeute(heuteBerlin());

interface CrewServerStand {
  self: Crew;
  entwurf: { antworten: Record<string, unknown>; etappe: number } | null;
  fragebogenFertig: boolean;
  jobs: Job[];
  bewerbungen: Application[];
  xp: unknown;
  heute: string;
}

const LOKAL = "neu.crew.lokal.v1";

async function aufruf<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T | null }> {
  const r = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  return { ok: r.ok, status: r.status, json: (await r.json().catch(() => null)) as T | null };
}

function zustandAusServer(srv: CrewServerStand, lokal: Partial<Pick<PvState, "lang" | "entwurf" | "rueck">>, vorher?: PvState): PvState {
  const s = leererZustand();
  s.crew = [srv.self];
  s.jobs = srv.jobs;
  s.bewerbungen = srv.bewerbungen;
  s.eingeloggt = true;
  s.dsgvo = true;
  s.fragebogenFertig = srv.fragebogenFertig;
  s.lang = lokal.lang ?? "de";
  s.entwurf = lokal.entwurf ?? {};
  s.rueck = lokal.rueck ?? null;
  if (srv.xp && typeof srv.xp === "object") s.einst = { ...standardEinstellungen(), xp: srv.xp as PvState["einst"]["xp"] };
  // Was gerade getippt wird, gewinnt gegenüber dem Serverstand
  s.antworten = vorher ? vorher.antworten : { ...leereAntworten(), ...((srv.entwurf?.antworten ?? {}) as Partial<Antworten>) };
  s.etappe = vorher ? vorher.etappe : srv.entwurf?.etappe ?? 1;
  return s;
}

export function CrewProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PvState>(() => leererZustand());
  const [geladen, setGeladen] = useState(false);
  const [abgemeldet, setAbgemeldet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sRef = useRef(s);
  sRef.current = s;
  // Letzter Stand, den der Server kennt
  const bekannt = useRef<{ antworten: Antworten | null; etappe: number; fertig: boolean; acks: string; bewerbungen: Set<string> }>({ antworten: null, etappe: 1, fertig: false, acks: "{}", bewerbungen: new Set() });
  const beschaeftigt = useRef(false);
  const nochmal = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const melde = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const merkeServer = (srv: CrewServerStand, antworten: Antworten | null, etappe: number) => {
    bekannt.current = { antworten, etappe, fertig: srv.fragebogenFertig, acks: JSON.stringify(srv.self.unterweisungen), bewerbungen: new Set(srv.bewerbungen.map((b) => b.id)) };
  };

  const lokalLesen = (): Partial<Pick<PvState, "lang" | "entwurf" | "rueck">> => {
    try {
      return JSON.parse(window.sessionStorage.getItem(LOKAL) ?? "{}") as Partial<Pick<PvState, "lang" | "entwurf" | "rueck">>;
    } catch {
      return {};
    }
  };

  const laden = useCallback(async () => {
    const r = await aufruf<CrewServerStand>("/api/neu/crew/state");
    if (!r.ok || !r.json) {
      setAbgemeldet(true);
      return;
    }
    setzeHeute(r.json.heute);
    const neu = zustandAusServer(r.json, lokalLesen());
    merkeServer(r.json, neu.antworten, neu.etappe);
    setS(neu);
    setGeladen(true);
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Nur Oberfläche (Sprache, angefangene Bewerbungen) bleibt im Browser
  useEffect(() => {
    if (!geladen) return;
    try {
      window.sessionStorage.setItem(LOKAL, JSON.stringify({ lang: s.lang, entwurf: s.entwurf, rueck: s.rueck }));
    } catch {
      /* ohne sessionStorage geht es auch */
    }
  }, [s.lang, s.entwurf, s.rueck, geladen]);

  const abgleichen = useCallback(async () => {
    if (beschaeftigt.current) {
      nochmal.current = true;
      return;
    }
    beschaeftigt.current = true;
    try {
      for (let runde = 0; runde < 6; runde++) {
        const jetzt = sRef.current;
        const b = bekannt.current;
        const ich = jetzt.crew[0];
        if (!ich) return;
        // „Angaben ändern“ hebt das Abgeschickt auf: das nächste Abschicken zählt wieder
        if (!jetzt.fragebogenFertig && b.fertig) bekannt.current = { ...bekannt.current, fertig: false };
        const senden = async (aktion: unknown): Promise<{ ok: boolean; fehler?: string; stand?: CrewServerStand }> => {
          const r = await aufruf<{ state?: CrewServerStand; error?: string }>("/api/neu/crew/aktion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aktion) });
          if (r.status === 401) {
            setAbgemeldet(true);
            return { ok: false, fehler: "Nicht angemeldet." };
          }
          return r.ok ? { ok: true, stand: r.json?.state } : { ok: false, fehler: r.json?.error ?? "Fehler" };
        };

        // 1 Entwurf des Fragebogens
        if (b.antworten !== jetzt.antworten || b.etappe !== jetzt.etappe) {
          const r = await senden({ typ: "entwurf", antworten: jetzt.antworten, etappe: jetzt.etappe });
          if (!r.ok) return melde(`Nicht gespeichert: ${r.fehler}`);
          bekannt.current = { ...bekannt.current, antworten: jetzt.antworten, etappe: jetzt.etappe };
          continue;
        }
        // 2 Fragebogen abschicken
        if (jetzt.fragebogenFertig && !b.fertig) {
          const r = await senden({ typ: "abschicken" });
          if (!r.ok) {
            setS((x) => ({ ...x, fragebogenFertig: false }));
            return melde(r.fehler ?? "Der Fragebogen konnte nicht abgeschickt werden.");
          }
          if (r.stand) {
            merkeServer(r.stand, jetzt.antworten, jetzt.etappe);
            setS((x) => ({ ...x, crew: [r.stand!.self], fragebogenFertig: r.stand!.fragebogenFertig }));
          }
          continue;
        }
        // 3 Unterweisungen
        const acksJetzt = JSON.stringify(ich.unterweisungen);
        if (acksJetzt !== b.acks) {
          const alt = JSON.parse(b.acks) as Crew["unterweisungen"];
          const neu = Object.entries(ich.unterweisungen).find(([m, a]) => JSON.stringify(alt[m]) !== JSON.stringify(a));
          if (!neu) {
            bekannt.current = { ...b, acks: acksJetzt };
            continue;
          }
          const [modul, ack] = neu;
          const gesamt = modulById(modul)?.quiz.length ?? 1;
          const r = await senden({ typ: "unterweisung", modul, richtig: Math.round(ack.quizScore * gesamt), gesamt });
          if (!r.ok) {
            setS((x) => ({ ...x, crew: x.crew.map((c) => ({ ...c, unterweisungen: JSON.parse(b.acks) as Crew["unterweisungen"] })) }));
            return melde(r.fehler ?? "Die Unterweisung konnte nicht gespeichert werden.");
          }
          if (r.stand) {
            merkeServer(r.stand, sRef.current.antworten, sRef.current.etappe);
            setS((x) => ({ ...x, crew: [r.stand!.self] }));
          }
          continue;
        }
        // 4 Bewerbungen
        const neueBew = jetzt.bewerbungen.find((x) => x.pnr === ich.pnr && !b.bewerbungen.has(x.id));
        if (neueBew) {
          const r = await senden({ typ: "bewerbung", jobId: neueBew.jobId, schichtIds: neueBew.schichtIds, eigeneAnreise: neueBew.eigeneAnreise, hatVertrag: neueBew.hatVertrag, abfahrtsort: neueBew.abfahrtsort, plaetze: neueBew.fahrgemeinschaftPlaetze, kommentar: neueBew.kommentar });
          if (!r.ok) {
            setS((x) => ({ ...x, bewerbungen: x.bewerbungen.filter((y) => y.id !== neueBew.id) }));
            return melde(r.fehler ?? "Die Bewerbung konnte nicht abgeschickt werden.");
          }
          if (r.stand) {
            merkeServer(r.stand, sRef.current.antworten, sRef.current.etappe);
            setS((x) => ({ ...x, bewerbungen: r.stand!.bewerbungen, jobs: r.stand!.jobs }));
          }
          continue;
        }
        return;
      }
    } finally {
      beschaeftigt.current = false;
      if (nochmal.current) {
        nochmal.current = false;
        void abgleichen();
      }
    }
  }, [melde]);

  // Tippen: kurz warten und gesammelt speichern
  useEffect(() => {
    if (!geladen) return;
    const t = setTimeout(() => void abgleichen(), 500);
    return () => clearTimeout(t);
  }, [s.antworten, s.etappe, geladen, abgleichen]);

  // Abschicken, Unterweisung bestätigen, Bewerben: sofort, nicht erst nach einer Pause
  useEffect(() => {
    if (!geladen) return;
    void abgleichen();
  }, [s.fragebogenFertig, s.crew, s.bewerbungen, geladen, abgleichen]);

  // Beim Verlassen der Seite den letzten Stand des Fragebogens nicht verlieren
  useEffect(() => {
    if (!geladen) return;
    const raus = () => {
      const jetzt = sRef.current;
      if (bekannt.current.antworten === jetzt.antworten && bekannt.current.etappe === jetzt.etappe) return;
      fetch("/api/neu/crew/aktion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typ: "entwurf", antworten: jetzt.antworten, etappe: jetzt.etappe }), keepalive: true, credentials: "same-origin" }).catch(() => undefined);
    };
    window.addEventListener("pagehide", raus);
    return () => window.removeEventListener("pagehide", raus);
  }, [geladen]);

  const set = useCallback((fn: (x: PvState) => PvState) => setS((x) => fn(x)), []);

  // „Zurücksetzen“ heißt hier: Daten löschen (DSGVO)
  const loeschen = useCallback(async () => {
    await aufruf("/api/neu/crew/konto", { method: "DELETE" });
    try {
      window.sessionStorage.removeItem(LOKAL);
    } catch {
      /* egal */
    }
    window.location.href = "/crew";
  }, []);

  const wert = useMemo<Ctx>(() => ({ s, modus: "crew", set, reset: () => void loeschen(), toast, melde, geladen, abmelden: () => void crewAbmelden() }), [s, set, loeschen, toast, melde, geladen]);

  if (abgemeldet) {
    return (
      <div className="pvc" style={{ padding: "2rem 1rem" }}>
        <div className="pv-wordmark" style={{ fontSize: "1.4rem" }}>fess<span>.</span>jobs</div>
        <h1 className="mt3">Link abgelaufen</h1>
        <p className="mt2">Dein Zugang ist abgelaufen oder der Link ist ungültig. Bitte bei FESS einen neuen persönlichen Link anfordern.</p>
      </div>
    );
  }
  return <PvContext.Provider value={wert}>{children}</PvContext.Provider>;
}

// Abmelden: nur diese Sitzung beenden
export async function crewAbmelden(): Promise<void> {
  await fetch("/api/neu/crew/abmelden", { method: "POST", credentials: "same-origin" });
  window.location.href = "/crew";
}
