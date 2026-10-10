// Verbindung zwischen dem Zustand der Oberfläche (PvState) und den Datensätzen
// auf dem Server. Reine Funktionen: aus dem Serverstand den Zustand bauen und aus
// dem Unterschied zweier Zustände die Änderungen ableiten, die zu speichern sind.
import type { Application, AuditEintrag, Crew, Job, StundenRow } from "@/preview/logic/types";
import { leererZustand, standardEinstellungen, type BelegEintrag, type Einstellungen, type Notiz, type PvState, type Zuweisung } from "@/preview/state/store";
import type { VergangenerAuftrag } from "@/preview/data/demo";
import { bereinigeSchulung } from "@/preview/logic/unterweisung";
import { bereinigeKleidung } from "@/preview/logic/einstellungen-neu";

export type Kind = "crew" | "job" | "bewerbung" | "auftrag" | "stunde" | "zuweisung" | "briefing" | "beleg" | "notiz" | "einst" | "benutzer";

export interface ServerStand {
  records: Record<Kind, Array<{ id: string; rev: number; data: unknown }>>;
  audit: AuditEintrag[];
  version: string;
}

export interface SyncOp {
  kind: Kind;
  id: string;
  data: unknown | null;
  rev?: number;
}

export type Revs = Map<string, number>;
export const revKey = (kind: Kind, id: string) => `${kind}:${id}`;

const LISTEN = [
  ["crew", "crew"],
  ["jobs", "job"],
  ["bewerbungen", "bewerbung"],
  ["auftraege", "auftrag"],
  ["stunden", "stunde"],
  ["belege", "beleg"],
  ["notizen", "notiz"],
] as const;

export function zustandAusServer(stand: ServerStand): { s: PvState; revs: Revs } {
  const revs: Revs = new Map();
  const liste = <T>(k: Kind): T[] =>
    (stand.records[k] ?? []).map((r) => {
      revs.set(revKey(k, r.id), r.rev);
      return r.data as T;
    });
  const s = leererZustand();
  s.crew = liste<Crew>("crew");
  s.jobs = liste<Job>("job");
  s.bewerbungen = liste<Application>("bewerbung");
  s.auftraege = liste<VergangenerAuftrag>("auftrag");
  s.stunden = liste<StundenRow>("stunde");
  s.belege = liste<BelegEintrag>("beleg");
  s.notizen = liste<Notiz>("notiz");
  for (const r of stand.records.zuweisung ?? []) {
    s.zuweisung[r.id] = r.data as Zuweisung[];
    revs.set(revKey("zuweisung", r.id), r.rev);
  }
  for (const r of stand.records.briefing ?? []) {
    s.briefingGesendet[r.id] = r.data as string;
    revs.set(revKey("briefing", r.id), r.rev);
  }
  const e = (stand.records.einst ?? []).find((x) => x.id === "main");
  if (e) {
    // Neue Standardwerte (spätere Versionen) bleiben erhalten, gespeicherte gewinnen
    const roh = e.data as Partial<Einstellungen>;
    const std = standardEinstellungen();
    s.einst = {
      ...std,
      ...roh,
      // Neue Bereiche der Einstellungen: gespeicherte Werte gelten, Fehlendes kommt aus dem Standard
      schulung: bereinigeSchulung(roh.schulung),
      kleidung: bereinigeKleidung(roh.kleidung),
      nachrichten: Array.isArray(roh.nachrichten) ? roh.nachrichten : std.nachrichten,
      schnittstelle: { ...std.schnittstelle, ...(roh.schnittstelle ?? {}) },
    };
    revs.set(revKey("einst", "main"), e.rev);
  }
  s.audit = stand.audit;
  return { s, revs };
}

const gleich = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Was hat sich zwischen `alt` und `neu` geändert? Unveränderte Datensätze bleiben
// als dieselbe Referenz erhalten, deshalb ist der Vergleich billig.
export function aenderungen(alt: PvState, neu: PvState, revs: Revs): { ops: SyncOp[]; audit: AuditEintrag[] } {
  const ops: SyncOp[] = [];
  for (const [feld, kind] of LISTEN) {
    const a = alt[feld] as Array<{ id: string }>;
    const n = neu[feld] as Array<{ id: string }>;
    if (a === n) continue;
    const altMap = new Map(a.map((x) => [x.id, x]));
    const neuIds = new Set<string>();
    for (const x of n) {
      neuIds.add(x.id);
      const vorher = altMap.get(x.id);
      if (vorher === x || (vorher !== undefined && gleich(vorher, x))) continue;
      ops.push({ kind, id: x.id, data: x, rev: revs.get(revKey(kind, x.id)) });
    }
    for (const [id] of altMap) if (!neuIds.has(id)) ops.push({ kind, id, data: null, rev: revs.get(revKey(kind, id)) });
  }
  if (alt.zuweisung !== neu.zuweisung) {
    for (const [id, liste] of Object.entries(neu.zuweisung)) if (!gleich(alt.zuweisung[id], liste)) ops.push({ kind: "zuweisung", id, data: liste, rev: revs.get(revKey("zuweisung", id)) });
    for (const id of Object.keys(alt.zuweisung)) if (!(id in neu.zuweisung)) ops.push({ kind: "zuweisung", id, data: null, rev: revs.get(revKey("zuweisung", id)) });
  }
  if (alt.briefingGesendet !== neu.briefingGesendet) {
    for (const [id, v] of Object.entries(neu.briefingGesendet)) if (alt.briefingGesendet[id] !== v) ops.push({ kind: "briefing", id, data: v, rev: revs.get(revKey("briefing", id)) });
  }
  if (alt.einst !== neu.einst && !gleich(alt.einst, neu.einst)) ops.push({ kind: "einst", id: "main", data: neu.einst, rev: revs.get(revKey("einst", "main")) });

  let audit: AuditEintrag[] = [];
  if (alt.audit !== neu.audit) {
    const bekannt = new Set(alt.audit.map((x) => x.id));
    audit = neu.audit.filter((x) => !bekannt.has(x.id));
  }
  return { ops, audit };
}

// Nach erfolgreichem Speichern: neue Stände merken, gelöschte vergessen
export function revsAnwenden(revs: Revs, ops: SyncOp[], neueRevs: Record<string, number>): void {
  for (const op of ops) {
    const k = revKey(op.kind, op.id);
    if (op.data === null) revs.delete(k);
    else if (neueRevs[k] !== undefined) revs.set(k, neueRevs[k]);
  }
}
