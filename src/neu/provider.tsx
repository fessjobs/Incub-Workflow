"use client";
// Zustand des echten neuen Dashboards: dieselbe Form wie im Prototyp (PvState),
// aber vom Server geladen. Jede Änderung wird als Unterschied zum letzten
// gespeicherten Stand erkannt und gespeichert; veraltete Bildschirme überschreiben
// nichts (rev-Prüfung), sie laden neu.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PvContext, initialerZustand, leererZustand, setzeHeute, type Ctx, type PvState } from "@/preview/state/store";
import { heuteBerlin } from "@/preview/logic/zeit";
import { SELF_ID } from "@/preview/data/demo";
import { setzeBearbeiter } from "@/preview/pages/stunden-aktionen";
import { aenderungen, revsAnwenden, zustandAusServer, type Revs, type ServerStand, type SyncOp } from "./state";
import type { NeuRolle } from "@/lib/neu/rollen";

// Der heutige Tag in Deutschland gilt ab dem ersten Rendern
setzeHeute(heuteBerlin());

const ABFRAGE_MS = 20_000;

async function holeJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T | null }> {
  const r = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const json = (await r.json().catch(() => null)) as T | null;
  return { ok: r.ok, status: r.status, json };
}

export function NeuProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PvState>(() => leererZustand());
  const [geladen, setGeladen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [speicher, setSpeicher] = useState<"ok" | "laeuft" | "fehler">("ok");
  const [basis, setBasis] = useState<string | null>(null);
  const [benutzer, setBenutzer] = useState("");
  const [rolle, setRolle] = useState<NeuRolle>("lesen");
  const [ladefehler, setLadefehler] = useState<string | null>(null);

  const sRef = useRef(s);
  sRef.current = s;
  const gespeichert = useRef<PvState>(s);
  const revs = useRef<Revs>(new Map());
  const stand = useRef("");
  const beschaeftigt = useRef(false);
  const nochmal = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ungespeichert = () => {
    const { ops, audit } = aenderungen(gespeichert.current, sRef.current, revs.current);
    return ops.length > 0 || audit.length > 0;
  };

  const melde = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const laden = useCallback(async () => {
    const r = await holeJson<ServerStand & { basis: string | null; benutzer: string; rolle: NeuRolle }>("/api/neu/state");
    if (!r.ok || !r.json) {
      setLadefehler(r.status === 403 ? "Für dieses Konto ist das neue Dashboard nicht freigegeben. Ein Administrator kann es unter „Benutzer“ freischalten." : "Das neue Dashboard konnte nicht geladen werden.");
      return;
    }
    const { s: neu, revs: neueRevs } = zustandAusServer(r.json);
    gespeichert.current = neu;
    revs.current = neueRevs;
    stand.current = r.json.version;
    setBasis(r.json.basis);
    setBenutzer(r.json.benutzer);
    setRolle(r.json.rolle);
    setzeBearbeiter(r.json.benutzer);
    setLadefehler(null);
    // Einstellungen der Oberfläche (Sprache) bleiben, Daten kommen vom Server
    setS((alt) => ({ ...neu, lang: alt.lang }));
    setGeladen(true);
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const speichern = useCallback(async () => {
    if (beschaeftigt.current) {
      nochmal.current = true;
      return;
    }
    beschaeftigt.current = true;
    try {
      const jetzt = sRef.current;
      const { ops, audit } = aenderungen(gespeichert.current, jetzt, revs.current);
      if (ops.length === 0 && audit.length === 0) return;
      setSpeicher("laeuft");
      // In Stücken, damit auch große Änderungen (Einfügen aus Excel) durchgehen
      for (let i = 0; i < Math.max(ops.length, 1); i += 400) {
        const stueck: SyncOp[] = ops.slice(i, i + 400);
        const r = await holeJson<{ revs?: Record<string, number>; error?: string }>("/api/neu/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: stueck, audit: i === 0 ? audit : [] }) });
        if (r.status === 409) {
          melde("Die Daten wurden zwischenzeitlich woanders geändert – neu geladen. Bitte die letzte Änderung wiederholen.");
          await laden();
          setSpeicher("ok");
          return;
        }
        if (r.status === 403) {
          // Keine Berechtigung: nicht endlos wiederholen, sondern die Änderung verwerfen und den gespeicherten Stand zeigen
          melde(r.json?.error ? `${r.json.error} Die Änderung wurde nicht gespeichert.` : "Dafür fehlt die Berechtigung. Die Änderung wurde nicht gespeichert.");
          await laden();
          setSpeicher("ok");
          return;
        }
        if (!r.ok) throw new Error(r.json?.error ?? "Speichern fehlgeschlagen");
        revsAnwenden(revs.current, stueck, r.json?.revs ?? {});
      }
      gespeichert.current = jetzt;
      setSpeicher("ok");
    } catch (e) {
      setSpeicher("fehler");
      melde(`Nicht gespeichert: ${e instanceof Error ? e.message : "Fehler"}. Es wird erneut versucht.`);
      nochmal.current = true;
      setTimeout(() => void speichern(), 4000);
    } finally {
      beschaeftigt.current = false;
      if (nochmal.current) {
        nochmal.current = false;
        void speichern();
      }
    }
  }, [laden, melde]);

  useEffect(() => {
    if (!geladen) return;
    // Sofort sichtbar machen, dass etwas noch nicht gespeichert ist
    if (ungespeichert()) setSpeicher("laeuft");
    const t = setTimeout(() => void speichern(), 350);
    return () => clearTimeout(t);
  }, [s, geladen, speichern]);

  // Beim Verlassen der Seite nichts verlieren
  useEffect(() => {
    if (!geladen) return;
    const raus = () => {
      const { ops, audit } = aenderungen(gespeichert.current, sRef.current, revs.current);
      if (ops.length === 0 && audit.length === 0 || ops.length > 200) return;
      fetch("/api/neu/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops, audit }), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", raus);
    return () => window.removeEventListener("pagehide", raus);
  }, [geladen]);

  // Hat die Crew etwas abgeschickt? Alle 20 Sekunden und beim Zurückkehren nachsehen,
  // aber nur laden, wenn hier nichts Ungespeichertes liegt.
  useEffect(() => {
    if (!geladen) return;
    const pruefen = async () => {
      if (beschaeftigt.current || ungespeichert()) return;
      const r = await holeJson<{ version: string }>("/api/neu/version");
      if (r.ok && r.json && r.json.version !== stand.current && !ungespeichert()) await laden();
    };
    const t = setInterval(() => void pruefen(), ABFRAGE_MS);
    const fokus = () => void pruefen();
    window.addEventListener("focus", fokus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", fokus);
    };
  }, [geladen, laden]);

  const set = useCallback((fn: (x: PvState) => PvState) => setS((x) => fn(x)), []);

  const beispieldatenLaden = useCallback(async () => {
    const demo = initialerZustand();
    const ops: Array<{ kind: string; id: string; data: unknown }> = [];
    for (const c of demo.crew) if (c.id !== SELF_ID) ops.push({ kind: "crew", id: c.id, data: c });
    for (const j of demo.jobs) ops.push({ kind: "job", id: j.id, data: j });
    for (const b of demo.bewerbungen) ops.push({ kind: "bewerbung", id: b.id, data: b });
    for (const a of demo.auftraege) ops.push({ kind: "auftrag", id: a.id, data: a });
    for (const r of demo.stunden) ops.push({ kind: "stunde", id: r.id, data: r });
    for (const [id, liste] of Object.entries(demo.zuweisung)) ops.push({ kind: "zuweisung", id, data: liste });
    const r = await holeJson<{ error?: string }>("/api/neu/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
    if (!r.ok) {
      melde(`Beispieldaten konnten nicht geladen werden: ${r.json?.error ?? r.status}`);
      return;
    }
    await laden();
    melde("Beispieldaten geladen. Sie lassen sich unter Einstellungen wieder entfernen.");
  }, [laden, melde]);

  const beispieldatenEntfernen = useCallback(async () => {
    const r = await holeJson<{ entfernt?: number }>("/api/neu/seed", { method: "DELETE" });
    await laden();
    melde(r.ok ? `${r.json?.entfernt ?? 0} Beispiel-Datensätze entfernt. Eigene Daten sind unberührt.` : "Entfernen fehlgeschlagen.");
  }, [laden, melde]);

  const wert = useMemo<Ctx>(
    () => ({ s, modus: "echt", basis, set, reset: () => void laden(), toast, melde, geladen, speicher, echt: { benutzer, rolle, neuLaden: laden, beispieldatenLaden, beispieldatenEntfernen } }),
    [s, basis, set, laden, toast, melde, geladen, speicher, benutzer, rolle, beispieldatenLaden, beispieldatenEntfernen]
  );

  if (ladefehler) {
    return (
      <div style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1rem" }}>
        <h1>Neues Dashboard</h1>
        <p className="mt2">{ladefehler}</p>
        <p className="mt2"><a href="/dashboard">← Zum bisherigen Dashboard</a></p>
      </div>
    );
  }
  return <PvContext.Provider value={wert}>{children}</PvContext.Provider>;
}
