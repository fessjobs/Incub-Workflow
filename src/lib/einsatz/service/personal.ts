// Personalübersicht für die Dispo: wie viele Schichten jemand tatsächlich
// geleistet hat, in welchen Tätigkeiten – und wie die internen Bewertungen
// ausfallen.
//
// Gezählt wird, was unterschrieben ist: eine Schicht gilt als geleistet,
// sobald die Person ihre Zeiten erfasst und unterschrieben hat. Nicht erst
// nach der Freigabe (die hinkt Tage hinterher) und nicht schon bei der
// Einteilung (da war noch niemand da).
//
// Alles hier ist ausschließlich fürs Backend. Nichts davon geht in einen
// Mitarbeiter-Link, in ein PDF oder in einen Export.
import type { RatingWert } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BesetzungError } from "./besetzung";

export type Bilanz = { positiv: number; neutral: number; negativ: number };

export type TaetigkeitErfahrung = { taetigkeit: string; schichten: number; stunden: number };

export type Erfahrung = {
  employeeId: string;
  schichten: number;
  stunden: number;
  taetigkeiten: TaetigkeitErfahrung[];
  bilanz: Bilanz;
  letzterEinsatz: Date | null;
  letzteBewertung: { wert: RatingWert; notiz: string | null; am: Date } | null;
};

export const LEER: Omit<Erfahrung, "employeeId"> = {
  schichten: 0,
  stunden: 0,
  taetigkeiten: [],
  bilanz: { positiv: 0, neutral: 0, negativ: 0 },
  letzterEinsatz: null,
  letzteBewertung: null,
};

// Erfahrungsstufe aus der Zahl geleisteter Schichten. Bewusst grob – die
// Zahl steht daneben, die Stufe ist nur die schnelle Einordnung.
export const STUFEN = [
  { ab: 25, name: "erfahren" },
  { ab: 8, name: "geübt" },
  { ab: 1, name: "eingearbeitet" },
  { ab: 0, name: "neu" },
] as const;

export function stufe(schichten: number): string {
  return STUFEN.find((s) => schichten >= s.ab)?.name ?? "neu";
}

// Tätigkeiten kommen aus Freitext ("Hands", "hands ", "HANDS") – fürs Zählen
// vereinheitlichen, für die Anzeige die erste gesehene Schreibweise nehmen.
export function taetigkeitKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Bilanz in einem Wort: überwiegt Negatives, soll das auffallen.
export function bilanzUrteil(b: Bilanz): "positiv" | "gemischt" | "negativ" | "offen" {
  const gesamt = b.positiv + b.neutral + b.negativ;
  if (gesamt === 0) return "offen";
  if (b.negativ > b.positiv) return "negativ";
  if (b.positiv > 0 && b.negativ === 0) return "positiv";
  return "gemischt";
}

// Erfahrung und Bilanz für eine Menge von Mitarbeitern. Eine Abfrage je
// Baustein statt N+1 – die Personalliste zeigt alle Personen auf einmal.
export async function erfahrungFuer(organizationId: string, employeeIds?: string[]): Promise<Map<string, Erfahrung>> {
  const nurDiese = employeeIds && employeeIds.length > 0 ? { in: employeeIds } : undefined;
  if (employeeIds && employeeIds.length === 0) return new Map();

  const [eintraege, bewertungen] = await Promise.all([
    // Unterschriebene, aktuelle Erfassungen = geleistete Schichten
    db.timeEntry.findMany({
      where: {
        organizationId,
        aktuell: true,
        unterschriftZeitpunkt: { not: null },
        shiftAssignment: { status: { not: "STORNIERT" }, ...(nurDiese ? { employeeId: nurDiese } : {}) },
      },
      select: {
        stundenGesamt: true,
        taetigkeit: true,
        istStart: true,
        shiftAssignment: { select: { employeeId: true, shift: { select: { taetigkeit: true } } } },
      },
    }),
    db.shiftRating.findMany({
      where: { organizationId, ...(nurDiese ? { employeeId: nurDiese } : {}) },
      orderBy: { createdAt: "desc" },
      select: { employeeId: true, wert: true, notiz: true, createdAt: true },
    }),
  ]);

  const map = new Map<string, Erfahrung & { _taet: Map<string, TaetigkeitErfahrung> }>();
  const hol = (id: string) => {
    let e = map.get(id);
    if (!e) {
      e = { employeeId: id, ...LEER, bilanz: { positiv: 0, neutral: 0, negativ: 0 }, taetigkeiten: [], _taet: new Map() };
      map.set(id, e);
    }
    return e;
  };

  for (const t of eintraege) {
    const e = hol(t.shiftAssignment.employeeId);
    e.schichten++;
    e.stunden += Number(t.stundenGesamt);
    if (!e.letzterEinsatz || t.istStart > e.letzterEinsatz) e.letzterEinsatz = t.istStart;
    const roh = (t.taetigkeit ?? t.shiftAssignment.shift.taetigkeit ?? "").trim();
    if (!roh) continue;
    const key = taetigkeitKey(roh);
    const vorhanden = e._taet.get(key);
    if (vorhanden) {
      vorhanden.schichten++;
      vorhanden.stunden += Number(t.stundenGesamt);
    } else {
      e._taet.set(key, { taetigkeit: roh, schichten: 1, stunden: Number(t.stundenGesamt) });
    }
  }

  for (const b of bewertungen) {
    const e = hol(b.employeeId);
    if (b.wert === "POSITIV") e.bilanz.positiv++;
    else if (b.wert === "NEUTRAL") e.bilanz.neutral++;
    else e.bilanz.negativ++;
    // Die Liste ist absteigend sortiert, die erste je Person ist die jüngste
    if (!e.letzteBewertung) e.letzteBewertung = { wert: b.wert, notiz: b.notiz, am: b.createdAt };
  }

  const fertig = new Map<string, Erfahrung>();
  for (const [id, e] of map) {
    const { _taet, ...rest } = e;
    fertig.set(id, {
      ...rest,
      stunden: Math.round(rest.stunden * 100) / 100,
      taetigkeiten: [..._taet.values()]
        .map((t) => ({ ...t, stunden: Math.round(t.stunden * 100) / 100 }))
        .sort((a, b) => b.schichten - a.schichten || a.taetigkeit.localeCompare(b.taetigkeit, "de")),
    });
  }
  return fertig;
}

export function erfahrungOder(map: Map<string, Erfahrung>, employeeId: string): Erfahrung {
  return map.get(employeeId) ?? { employeeId, ...LEER, bilanz: { positiv: 0, neutral: 0, negativ: 0 }, taetigkeiten: [] };
}

// ─── Bewerten ───────────────────────────────────────────────────────────────

export async function setzeBewertung(
  actor: { id: string; organizationId: string },
  shiftAssignmentId: string,
  wert: RatingWert | null,
  notiz: string | null
): Promise<void> {
  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, organizationId: actor.organizationId },
    select: { id: true, employeeId: true, shift: { select: { assignmentId: true, bezeichnung: true } } },
  });
  if (!sa) throw new BesetzungError("Einteilung nicht gefunden.", 404);

  if (wert === null) {
    await db.shiftRating.deleteMany({ where: { shiftAssignmentId: sa.id } });
    await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "shift_rating.delete", entityType: "shift_assignment", entityId: sa.id, data: { assignmentId: sa.shift.assignmentId } });
    return;
  }

  const vorher = await db.shiftRating.findUnique({ where: { shiftAssignmentId: sa.id }, select: { wert: true } });
  await db.shiftRating.upsert({
    where: { shiftAssignmentId: sa.id },
    create: { organizationId: actor.organizationId, shiftAssignmentId: sa.id, employeeId: sa.employeeId, wert, notiz, createdById: actor.id },
    update: { wert, notiz },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "shift_rating.set",
    entityType: "shift_assignment",
    entityId: sa.id,
    data: { assignmentId: sa.shift.assignmentId, schicht: sa.shift.bezeichnung, employeeId: sa.employeeId, alt: vorher?.wert ?? null, neu: wert, notiz },
  });
}

// Bewertungsverlauf einer Person – für das Profil im Backend
export async function bewertungsVerlauf(organizationId: string, employeeId: string, limit = 50) {
  return db.shiftRating.findMany({
    where: { organizationId, employeeId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      wert: true,
      notiz: true,
      createdAt: true,
      shiftAssignment: {
        select: {
          planStart: true,
          shift: { select: { bezeichnung: true, taetigkeit: true, assignment: { select: { id: true, einsatznummer: true, projekt: true, customer: { select: { name: true } } } } } },
        },
      },
    },
  });
}
