// Arbeitszeit-Konfliktprüfung (serverseitig gegen ALLE Einsätze des Mandanten):
// - weniger als 11 h Ruhezeit zwischen zwei Schichten derselben Person
// - mehr als 10 h Arbeitszeit innerhalb von 24 h
// - Doppelbuchung (zeitliche Überschneidung) in zwei Einsätzen
import { db } from "@/lib/db";
import { minutesBetween } from "./hours";
import { formatKeyDE, berlinDateKey, berlinTime } from "./tz";

export type PlannedSlot = {
  // Referenz auf Stamm-Mitarbeiter (null = noch nicht zugeordnet → keine DB-Prüfung)
  employeeId: string | null;
  // Anzeigename (für Hinweise)
  name: string;
  start: Date;
  end: Date;
  // Bezeichnung der Schicht im aktuellen Entwurf
  label: string;
  // Einsatz-Referenz (für DB-Slots die Einsatznummer)
  einsatz: string;
};

export type ConflictKind = "ruhezeit" | "arbeitszeit" | "doppelbuchung";

export type Conflict = {
  kind: ConflictKind;
  employeeId: string | null;
  name: string;
  message: string;
};

export const MIN_REST_MINUTES = 11 * 60;
export const MAX_WORK_MINUTES_24H = 10 * 60;

function fmt(d: Date): string {
  return `${formatKeyDE(berlinDateKey(d))} ${berlinTime(d)}`;
}

// Reine Prüfung über eine Menge von Slots (geplant + bestehende)
export function detectConflicts(slots: PlannedSlot[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const byPerson = new Map<string, PlannedSlot[]>();
  for (const s of slots) {
    const key = s.employeeId ?? `name:${s.name.toLowerCase()}`;
    byPerson.set(key, [...(byPerson.get(key) ?? []), s]);
  }
  const seen = new Set<string>();
  const push = (c: Conflict) => {
    const k = `${c.kind}|${c.employeeId ?? c.name}|${c.message}`;
    if (!seen.has(k)) {
      seen.add(k);
      conflicts.push(c);
    }
  };

  for (const [, list] of byPerson) {
    const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        // Überschneidung
        if (b.start < a.end && a.start < b.end) {
          push({
            kind: "doppelbuchung",
            employeeId: a.employeeId,
            name: a.name,
            message: `${a.name}: „${a.label}“ (${a.einsatz}, ${fmt(a.start)}–${berlinTime(a.end)}) überschneidet sich mit „${b.label}“ (${b.einsatz}, ${fmt(b.start)}–${berlinTime(b.end)}).`,
          });
          continue;
        }
        // Ruhezeit zwischen Ende a und Beginn b
        const rest = minutesBetween(a.end, b.start);
        if (rest < MIN_REST_MINUTES && rest >= 0) {
          push({
            kind: "ruhezeit",
            employeeId: a.employeeId,
            name: a.name,
            message: `${a.name}: nur ${Math.floor(rest / 60)} h ${rest % 60} min Ruhezeit zwischen „${a.label}“ (${a.einsatz}, Ende ${fmt(a.end)}) und „${b.label}“ (${b.einsatz}, Beginn ${fmt(b.start)}) – mindestens 11 h nötig.`,
          });
        }
      }
      // Arbeitszeit in einem 24-h-Fenster ab Beginn dieser Schicht
      const windowEnd = new Date(a.start.getTime() + 24 * 60 * 60000);
      let minutes = 0;
      for (const s of sorted) {
        const st = Math.max(s.start.getTime(), a.start.getTime());
        const en = Math.min(s.end.getTime(), windowEnd.getTime());
        if (en > st) minutes += Math.round((en - st) / 60000);
      }
      if (minutes > MAX_WORK_MINUTES_24H) {
        push({
          kind: "arbeitszeit",
          employeeId: a.employeeId,
          name: a.name,
          message: `${a.name}: ${Math.floor(minutes / 60)} h ${minutes % 60} min Arbeitszeit innerhalb von 24 h ab ${fmt(a.start)} (Grenze 10 h).`,
        });
      }
    }
  }
  return conflicts;
}

// Lädt bestehende Schichtzuordnungen der betroffenen Personen im Umfeld ±3 Tage
export async function loadExistingSlots(organizationId: string, employeeIds: string[], from: Date, to: Date, excludeAssignmentId?: string): Promise<PlannedSlot[]> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const pad = 3 * 24 * 60 * 60000;
  const rows = await db.shiftAssignment.findMany({
    where: {
      organizationId,
      employeeId: { in: ids },
      status: { not: "STORNIERT" },
      planStart: { lte: new Date(to.getTime() + pad) },
      planEnde: { gte: new Date(from.getTime() - pad) },
      ...(excludeAssignmentId ? { shift: { assignmentId: { not: excludeAssignmentId } } } : {}),
    },
    include: {
      employee: { select: { vorname: true, nachname: true } },
      shift: { select: { bezeichnung: true, assignment: { select: { einsatznummer: true, projekt: true } } } },
    },
  });
  return rows.map((r) => ({
    employeeId: r.employeeId,
    name: `${r.employee.vorname} ${r.employee.nachname}`,
    start: r.planStart,
    end: r.planEnde,
    label: r.shift.bezeichnung,
    einsatz: `${r.shift.assignment.einsatznummer} ${r.shift.assignment.projekt}`,
  }));
}

// Geplante Slots gegen sich selbst UND gegen die Datenbank prüfen
export async function checkConflicts(organizationId: string, planned: PlannedSlot[], excludeAssignmentId?: string): Promise<Conflict[]> {
  if (planned.length === 0) return [];
  const from = new Date(Math.min(...planned.map((p) => p.start.getTime())));
  const to = new Date(Math.max(...planned.map((p) => p.end.getTime())));
  const existing = await loadExistingSlots(
    organizationId,
    planned.map((p) => p.employeeId).filter((id): id is string => Boolean(id)),
    from,
    to,
    excludeAssignmentId
  );
  return detectConflicts([...planned, ...existing]);
}
