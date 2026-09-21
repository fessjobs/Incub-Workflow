// Besetzung über den Gruppenlink korrigieren: Namen richtigstellen und
// Personen ergänzen, die kurzfristig mitgekommen sind – ohne Login, durch die
// Crew selbst.
//
// Die Konkretisierung nach § 1 Abs. 1 Satz 6 AÜG benennt die überlassenen
// Personen namentlich. Deshalb gilt hier, wo niemand angemeldet ist: solange
// die Person nicht unterschrieben hat und der Kunde nicht bestätigt hat, ist
// eine Korrektur eine Korrektur. Danach ist sie eine Änderung am
// unterschriebenen Beleg und gehört zur Dispo (besetzung.ts).
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BesetzungError, findeOderLegeAn, setzeNamen, teileEingabe, type NamensAenderung } from "./besetzung";
import { TOKEN_DAYS } from "./assignments";

// Eigener Fehlertyp bleibt für die Route erhalten; der Kern wirft
// BesetzungError, beide tragen einen Statuscode.
export { BesetzungError as RosterError };
export type { NamensAenderung as NamensKorrektur };
export { teileEingabe };

export type RosterMeta = { ip: string | null; userAgent: string | null };

async function assertOffen(assignmentId: string): Promise<{ id: string; organizationId: string }> {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, organizationId: true, status: true, _count: { select: { confirmations: true } } },
  });
  if (!a) throw new BesetzungError("Einsatz nicht gefunden.", 404);
  if (a._count.confirmations > 0) throw new BesetzungError("Der Kunde hat bereits bestätigt. Änderungen bitte über die Dispo.", 409);
  if (a.status === "ABGESCHLOSSEN" || a.status === "ABGERECHNET") throw new BesetzungError("Der Einsatz ist abgeschlossen. Änderungen bitte über die Dispo.", 409);
  return { id: a.id, organizationId: a.organizationId };
}

export async function korrigiereName(
  assignmentId: string,
  shiftAssignmentId: string,
  eingabe: { vorname: string; nachname: string },
  meta: RosterMeta
): Promise<NamensAenderung> {
  const a = await assertOffen(assignmentId);

  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, shift: { assignmentId: a.id } },
    include: { timeEntries: { where: { aktuell: true }, select: { unterschriftZeitpunkt: true } } },
  });
  if (!sa) throw new BesetzungError("Person gehört nicht zu diesem Einsatz.", 403);
  if (sa.status === "STORNIERT") throw new BesetzungError("Diese Einteilung ist storniert.", 409);
  if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) {
    throw new BesetzungError("Diese Person hat bereits unterschrieben – der Name steht so auf dem Beleg. Bitte die Dispo ansprechen.", 409);
  }

  return setzeNamen(a.organizationId, sa.id, eingabe, { userId: null, ip: meta.ip, quelle: "crew-link" });
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
  if (!shift) throw new BesetzungError("Schicht gehört nicht zu diesem Einsatz.", 403);

  const ziel = await findeOderLegeAn(a.organizationId, vorname, nachname);
  const doppelt = await db.shiftAssignment.findFirst({ where: { shiftId: shift.id, employeeId: ziel.id }, select: { id: true, status: true } });
  if (doppelt) {
    if (doppelt.status !== "STORNIERT") throw new BesetzungError(`${vorname} ${nachname} steht schon auf dieser Schicht.`, 409);
    // Storniert und wieder da: die alte Einteilung reaktivieren
    await db.shiftAssignment.update({
      where: { id: doppelt.id },
      data: { status: "GEPLANT", token: randomUUID(), tokenExpiresAt: new Date(shift.planEnde.getTime() + TOKEN_DAYS * 86400000), tokenUsedAt: null },
    });
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
