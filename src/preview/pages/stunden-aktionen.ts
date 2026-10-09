// Änderungen an der Stundentabelle in den Zustand schreiben – immer mit
// Eintrag im Änderungsprotokoll (audit_log). Reine Funktionen.
import type { AuditEintrag, StundenRow, StundenStatus } from "../logic/types";
import type { Aenderung } from "../logic/stundentabelle";
import { neueAudit, type PvState } from "../state/store";

export const BEARBEITER = "Maik (Admin)";

// Im echten System setzt das Dashboard hier den angemeldeten Benutzer ein
let aktuellerBearbeiter = BEARBEITER;
export function setzeBearbeiter(name: string): void {
  aktuellerBearbeiter = name || BEARBEITER;
}
export function bearbeiter(): string {
  return aktuellerBearbeiter;
}

export function uebernehmeAenderungen(st: PvState, geaendert: Array<{ row: StundenRow; aenderungen: Aenderung[] }>, grund: string | null): PvState {
  if (geaendert.length === 0) return st;
  const neu = new Map<string, StundenRow>();
  const audit: AuditEintrag[] = [];
  const alt = new Map(st.stunden.map((r) => [r.id, r]));
  for (const g of geaendert) {
    const vorher = alt.get(g.row.id);
    let row = g.row;
    const aenderungen = [...g.aenderungen];
    // Eine freigegebene Zeile, die sich inhaltlich ändert, muss neu geprüft werden
    if (vorher?.status === "freigegeben" && aenderungen.some((a) => a.feld !== "bemerkung" && a.feld !== "status")) {
      row = { ...row, status: "geprueft" };
      aenderungen.push({ feld: "status", alt: "freigegeben", neu: "geprueft" });
    }
    neu.set(row.id, row);
    for (const a of aenderungen) audit.push(neueAudit(bearbeiter(), "time_entries", row.id, a.feld, a.alt, a.neu, grund));
  }
  return { ...st, stunden: st.stunden.map((r) => neu.get(r.id) ?? r), audit: [...audit.reverse(), ...st.audit] };
}

export function setzeStatus(st: PvState, ids: Set<string>, status: StundenStatus, grund: string | null): PvState {
  const audit: AuditEintrag[] = [];
  const stunden = st.stunden.map((r) => {
    if (!ids.has(r.id) || r.status === status) return r;
    audit.push(neueAudit(bearbeiter(), "time_entries", r.id, "status", r.status, status, grund));
    return { ...r, status };
  });
  return { ...st, stunden, audit: [...audit.reverse(), ...st.audit] };
}

export function naechsterStatus(s: StundenStatus): StundenStatus {
  return s === "offen" ? "geprueft" : s === "geprueft" ? "freigegeben" : "offen";
}
