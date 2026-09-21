// Besetzung über den Gruppenlink korrigieren: Namen richtigstellen und
// Personen ergänzen, die kurzfristig mitgekommen sind – ohne Login, durch die
// Crew selbst.
//
// Die Konkretisierung nach § 1 Abs. 1 Satz 6 AÜG benennt die überlassenen
// Personen namentlich. Deshalb gilt: solange niemand unterschrieben hat und
// der Kunde nicht bestätigt hat, ist eine Korrektur eine Korrektur. Danach
// ist sie eine Änderung am unterschriebenen Beleg und gehört zur Dispo.
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeName } from "../parser";
import { TOKEN_DAYS } from "./assignments";

export class RosterError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "RosterError";
  }
}

export type RosterMeta = { ip: string | null; userAgent: string | null };

// „Gülhan, Samira" und „Samira Gülhan" sind dieselbe Person
function nameKey(vorname: string, nachname: string): string {
  return normalizeName(`${vorname} ${nachname}`).split(" ").sort().join(" ");
}

export function teileEingabe(vorname: string, nachname: string): { vorname: string; nachname: string } {
  return { vorname: vorname.trim().replace(/\s{2,}/g, " "), nachname: nachname.trim().replace(/\s{2,}/g, " ") };
}

async function assertOffen(assignmentId: string): Promise<{ id: string; organizationId: string }> {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, organizationId: true, status: true, _count: { select: { confirmations: true } } },
  });
  if (!a) throw new RosterError("Einsatz nicht gefunden.", 404);
  if (a._count.confirmations > 0) throw new RosterError("Der Kunde hat bereits bestätigt. Änderungen bitte über die Dispo.", 409);
  if (a.status === "ABGESCHLOSSEN" || a.status === "ABGERECHNET") throw new RosterError("Der Einsatz ist abgeschlossen. Änderungen bitte über die Dispo.", 409);
  return { id: a.id, organizationId: a.organizationId };
}

// Vorhandene Person suchen (exakt, dann namensgleich), sonst neu anlegen
async function findeOderLegeAn(organizationId: string, vorname: string, nachname: string): Promise<{ id: string; neu: boolean }> {
  const exakt = await db.employee.findFirst({
    where: { organizationId, vorname: { equals: vorname, mode: "insensitive" }, nachname: { equals: nachname, mode: "insensitive" } },
    select: { id: true },
  });
  if (exakt) return { id: exakt.id, neu: false };

  const key = nameKey(vorname, nachname);
  const alle = await db.employee.findMany({ where: { organizationId, status: "AKTIV" }, select: { id: true, vorname: true, nachname: true } });
  const treffer = alle.find((e) => nameKey(e.vorname, e.nachname) === key);
  if (treffer) return { id: treffer.id, neu: false };

  const angelegt = await db.employee.create({ data: { organizationId, vorname, nachname } });
  return { id: angelegt.id, neu: true };
}

// Ein Datensatz, der nur für diesen einen Einsatz entstanden ist: keine
// Personalnummer, keine Kontaktdaten, keine zweite Einteilung. Ein Tippfehler
// darin wird korrigiert, statt eine Karteileiche zu hinterlassen.
async function istProvisorisch(employeeId: string, ausserShiftAssignmentId: string): Promise<boolean> {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: { personalnummer: true, email: true, mobil: true, geburtsdatum: true, _count: { select: { shiftAssignments: true } } },
  });
  if (!e) return false;
  if (e.personalnummer || e.email || e.mobil || e.geburtsdatum) return false;
  if (e._count.shiftAssignments > 1) return false;
  const eigene = await db.shiftAssignment.findFirst({ where: { employeeId, NOT: { id: ausserShiftAssignmentId } }, select: { id: true } });
  return eigene === null;
}

export type NamensKorrektur = { shiftAssignmentId: string; alt: string; neu: string; weg: "umbenannt" | "zugeordnet" };

export async function korrigiereName(
  assignmentId: string,
  shiftAssignmentId: string,
  eingabe: { vorname: string; nachname: string },
  meta: RosterMeta
): Promise<NamensKorrektur> {
  const a = await assertOffen(assignmentId);
  const { vorname, nachname } = teileEingabe(eingabe.vorname, eingabe.nachname);

  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, shift: { assignmentId: a.id } },
    include: { employee: true, shift: { select: { id: true } }, timeEntries: { where: { aktuell: true }, select: { unterschriftZeitpunkt: true } } },
  });
  if (!sa) throw new RosterError("Person gehört nicht zu diesem Einsatz.", 403);
  if (sa.status === "STORNIERT") throw new RosterError("Diese Einteilung ist storniert.", 409);
  if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) {
    throw new RosterError("Diese Person hat bereits unterschrieben – der Name steht so auf dem Beleg. Bitte die Dispo ansprechen.", 409);
  }

  const alt = `${sa.employee.vorname} ${sa.employee.nachname}`;
  if (alt === `${vorname} ${nachname}`) return { shiftAssignmentId, alt, neu: alt, weg: "umbenannt" };

  let weg: NamensKorrektur["weg"];
  const vorhanden = await db.employee.findFirst({
    where: { organizationId: a.organizationId, vorname: { equals: vorname, mode: "insensitive" }, nachname: { equals: nachname, mode: "insensitive" }, NOT: { id: sa.employeeId } },
    select: { id: true },
  });

  if (!vorhanden && (await istProvisorisch(sa.employeeId, sa.id))) {
    // Reiner Schreibfehler an einem Datensatz, der nur hier vorkommt
    await db.employee.update({ where: { id: sa.employeeId }, data: { vorname, nachname } });
    weg = "umbenannt";
  } else {
    const ziel = vorhanden ?? (await findeOderLegeAn(a.organizationId, vorname, nachname));
    if (ziel.id === sa.employeeId) return { shiftAssignmentId, alt, neu: `${vorname} ${nachname}`, weg: "umbenannt" };
    const doppelt = await db.shiftAssignment.findFirst({ where: { shiftId: sa.shiftId, employeeId: ziel.id }, select: { id: true } });
    if (doppelt) throw new RosterError(`${vorname} ${nachname} steht schon auf dieser Schicht.`, 409);
    await db.shiftAssignment.update({ where: { id: sa.id }, data: { employeeId: ziel.id } });
    weg = "zugeordnet";
  }

  await logAudit({
    organizationId: a.organizationId,
    action: "assignment.crew.name_korrigiert",
    entityType: "shift_assignment",
    entityId: sa.id,
    data: { assignmentId: a.id, alt, neu: `${vorname} ${nachname}`, weg, ip: meta.ip, quelle: "crew-link" },
  });
  return { shiftAssignmentId, alt, neu: `${vorname} ${nachname}`, weg };
}

export type PersonErgaenzt = { shiftAssignmentId: string; name: string; neuerStamm: boolean };

export async function ergaenzePerson(
  assignmentId: string,
  shiftId: string,
  eingabe: { vorname: string; nachname: string },
  meta: RosterMeta
): Promise<PersonErgaenzt> {
  const a = await assertOffen(assignmentId);
  const { vorname, nachname } = teileEingabe(eingabe.vorname, eingabe.nachname);

  const shift = await db.shift.findFirst({ where: { id: shiftId, assignmentId: a.id }, select: { id: true, planStart: true, planEnde: true } });
  if (!shift) throw new RosterError("Schicht gehört nicht zu diesem Einsatz.", 403);

  const ziel = await findeOderLegeAn(a.organizationId, vorname, nachname);
  const doppelt = await db.shiftAssignment.findFirst({ where: { shiftId: shift.id, employeeId: ziel.id }, select: { id: true, status: true } });
  if (doppelt) {
    if (doppelt.status !== "STORNIERT") throw new RosterError(`${vorname} ${nachname} steht schon auf dieser Schicht.`, 409);
    // Storniert und wieder da: die alte Einteilung reaktivieren
    await db.shiftAssignment.update({ where: { id: doppelt.id }, data: { status: "GEPLANT", token: randomUUID(), tokenExpiresAt: new Date(shift.planEnde.getTime() + TOKEN_DAYS * 86400000), tokenUsedAt: null } });
    await logAudit({ organizationId: a.organizationId, action: "assignment.crew.person_ergaenzt", entityType: "shift_assignment", entityId: doppelt.id, data: { assignmentId: a.id, name: `${vorname} ${nachname}`, reaktiviert: true, ip: meta.ip, quelle: "crew-link" } });
    return { shiftAssignmentId: doppelt.id, name: `${vorname} ${nachname}`, neuerStamm: false };
  }

  const sa = await db.shiftAssignment.create({
    data: {
      organizationId: a.organizationId,
      shiftId: shift.id,
      employeeId: ziel.id,
      planStart: shift.planStart,
      planEnde: shift.planEnde,
      token: randomUUID(),
      tokenExpiresAt: new Date(shift.planEnde.getTime() + TOKEN_DAYS * 86400000),
    },
  });
  await logAudit({
    organizationId: a.organizationId,
    action: "assignment.crew.person_ergaenzt",
    entityType: "shift_assignment",
    entityId: sa.id,
    data: { assignmentId: a.id, shiftId: shift.id, name: `${vorname} ${nachname}`, neuerStamm: ziel.neu, ip: meta.ip, quelle: "crew-link" },
  });
  return { shiftAssignmentId: sa.id, name: `${vorname} ${nachname}`, neuerStamm: ziel.neu };
}
