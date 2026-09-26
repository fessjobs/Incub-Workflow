// Zeiterfassung: Token-Kontext, Einreichung mit Unterschrift (Mitarbeiter-
// Link und Crew-Link), Kundenbestätigung, Korrektur durch die Dispo
// (neue Version, alte bleibt), Prüfung/Freigabe, Monatssperre.
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { decodeSignatureDataUrl, putBlob } from "../blob";
import { netHours } from "../hours";
import { enqueueJob } from "../jobs/queue";
import { SAFETY_VERSION } from "../safety";
import type { CorrectionSchema, CustomerSignSchema, TimeEntrySubmitInput } from "../schemas";
import { berlinDateKey, fromBerlin, toBerlin } from "../tz";
import type { z } from "zod";

export class TimeEntryError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export type RequestMeta = { ip: string | null; userAgent: string | null; geraet?: string | null };

const tokenInclude = {
  employee: true,
  shift: { include: { assignment: { include: { customer: true } } } },
  timeEntries: { where: { aktuell: true }, include: { trips: { orderBy: { reihenfolge: "asc" as const } } } },
} as const;

export async function loadByToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  return db.shiftAssignment.findUnique({ where: { token }, include: tokenInclude });
}

export type TokenState = "offen" | "erfasst" | "abgelaufen" | "storniert";

export function tokenState(sa: { tokenExpiresAt: Date; tokenUsedAt: Date | null; status: string }): TokenState {
  if (sa.status === "STORNIERT") return "storniert";
  if (sa.tokenUsedAt) return "erfasst";
  if (sa.tokenExpiresAt < new Date()) return "abgelaufen";
  return "offen";
}

export async function assertMonthOpen(orgId: string, at: Date): Promise<void> {
  const p = toBerlin(at);
  const lock = await db.monthLock.findUnique({ where: { organizationId_jahr_monat: { organizationId: orgId, jahr: p.year, monat: p.month } } });
  if (lock) throw new TimeEntryError(`Der Monat ${String(p.month).padStart(2, "0")}/${p.year} ist gesperrt – keine Änderungen mehr möglich.`, 409);
}

function resolveTimes(input: { startDatum: string; start: string; endeDatum: string; ende: string }): { istStart: Date; istEnde: Date } {
  const istStart = fromBerlin(input.startDatum, input.start);
  const istEnde = fromBerlin(input.endeDatum, input.ende);
  if (istEnde <= istStart) throw new TimeEntryError("Ende muss nach dem Beginn liegen.");
  if (istEnde.getTime() - istStart.getTime() > 24 * 3600 * 1000) throw new TimeEntryError("Eine Schicht darf nicht länger als 24 Stunden sein.");
  return { istStart, istEnde };
}

// Einreichung für eine Schichtzuordnung (Mitarbeiter-Link oder Crew-Gerät)
export async function submitTimeEntry(
  shiftAssignmentId: string,
  input: TimeEntrySubmitInput,
  meta: RequestMeta,
  quelle: "MITARBEITER" | "CREW"
): Promise<{ timeEntryId: string }> {
  const sa = await db.shiftAssignment.findUnique({ where: { id: shiftAssignmentId }, include: tokenInclude });
  if (!sa) throw new TimeEntryError("Zuordnung nicht gefunden.", 404);
  if (sa.status === "STORNIERT") throw new TimeEntryError("Diese Einteilung wurde storniert.", 409);
  const current = sa.timeEntries[0];
  if (current?.unterschriftZeitpunkt) throw new TimeEntryError("Dieser Eintrag wurde bereits unterschrieben und ist gesperrt.", 409);

  const { istStart, istEnde } = resolveTimes(input);
  await assertMonthOpen(sa.organizationId, istStart);
  if (input.pauseMinuten * 60000 >= istEnde.getTime() - istStart.getTime()) throw new TimeEntryError("Pause ist länger als die Arbeitszeit.");
  if (input.pkw && !input.pkwArt) throw new TimeEntryError("Bitte privat oder Firmenwagen auswählen.");
  if (input.pkw && input.fahrten.length === 0) throw new TimeEntryError("Bitte mindestens eine Fahrt eintragen.");

  const png = decodeSignatureDataUrl(input.unterschrift);
  const blob = await putBlob(sa.organizationId, "unterschriften", png, "image/png");
  const now = new Date();

  const entry = await db.$transaction(async (tx) => {
    if (current) await tx.timeEntry.update({ where: { id: current.id }, data: { aktuell: false } });
    const created = await tx.timeEntry.create({
      data: {
        organizationId: sa.organizationId,
        shiftAssignmentId: sa.id,
        version: current ? current.version + 1 : 1,
        aktuell: true,
        korrigiertVonId: current?.id ?? null,
        istStart,
        istEnde,
        pauseMinuten: input.pauseMinuten,
        stundenGesamt: netHours(istStart, istEnde, input.pauseMinuten),
        taetigkeit: input.taetigkeit || sa.shift.taetigkeit || null,
        notiz: input.notiz || null,
        pkw: input.pkw,
        pkwArt: input.pkw ? input.pkwArt : null,
        spesen: input.spesen,
        spesenBetrag: input.spesen ? input.spesenBetrag : null,
        unterschriftMitarbeiterUrl: blob.url,
        unterschriftZeitpunkt: now,
        unterweisungBestaetigt: true,
        unterweisungVersion: SAFETY_VERSION,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        geraet: (input.geraet ?? meta.geraet ?? null)?.slice(0, 200) ?? null,
        quelle,
        review: "ERFASST",
        trips: {
          create: input.pkw
            ? input.fahrten.map((f, i) => ({ organizationId: sa.organizationId, von: f.von, nach: f.nach, km: f.km, reihenfolge: i }))
            : [],
        },
      },
    });
    await tx.shiftAssignment.update({ where: { id: sa.id }, data: { status: "ERFASST", tokenUsedAt: now } });
    return created;
  });

  await logAudit({
    organizationId: sa.organizationId,
    action: "time_entry.sign",
    entityType: "time_entry",
    entityId: entry.id,
    data: {
      quelle,
      shiftAssignmentId: sa.id,
      employeeId: sa.employeeId,
      neu: { istStart, istEnde, pauseMinuten: input.pauseMinuten, stundenGesamt: Number(entry.stundenGesamt), pkw: input.pkw, spesen: input.spesen },
      unterschrift: blob.url,
      ip: meta.ip,
      erfasstAm: input.erfasstAm ?? null,
    },
  });

  // Einsatz laufend, Abschluss-Prüfung anstoßen (erzeugt den Stundennachweis
  // automatisch, sobald alle unterschrieben haben)
  await db.assignment.updateMany({ where: { id: sa.shift.assignmentId, status: { in: ["ENTWURF", "KONKRETISIERT"] } }, data: { status: "LAUFEND" } });
  await enqueueJob("einsatz.abschluss-check", { assignmentId: sa.shift.assignmentId }, { dedupeKey: `abschluss:${sa.shift.assignmentId}:${randomUUID()}`, organizationId: sa.organizationId });
  return { timeEntryId: entry.id };
}

const CREW_INCLUDE = {
  customer: true,
  confirmations: { orderBy: { zeitpunkt: "desc" } },
  shifts: {
    orderBy: { planStart: "asc" },
    include: { assignments: { include: { employee: true, timeEntries: { where: { aktuell: true } } }, orderBy: { createdAt: "asc" } } },
  },
} satisfies Prisma.AssignmentInclude;

// Ein Crew-Token gehört entweder zum ganzen Einsatz oder zu genau einer
// Schicht. Beim Schichtlink bleibt nur diese eine Schicht in der Sicht, und
// „nurSchichtId" ist die Grenze, an der jede Schreibaktion geprüft wird.
export type CrewKontext = {
  a: Prisma.AssignmentGetPayload<{ include: typeof CREW_INCLUDE }>;
  nurSchichtId: string | null;
  // Schichten des Einsatzes insgesamt – beim Schichtlink ist „a.shifts" auf
  // die eine Schicht gekürzt, für die Kundenbestätigung zählt aber, ob der
  // Einsatz noch aus mehr besteht.
  schichtenGesamt: number;
  abgelaufen: boolean;
};

export async function loadCrewByToken(token: string): Promise<CrewKontext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const a = await db.assignment.findUnique({ where: { crewToken: token }, include: CREW_INCLUDE });
  if (a) return { a, nurSchichtId: null, schichtenGesamt: a.shifts.length, abgelaufen: Boolean(a.crewTokenExpiresAt && a.crewTokenExpiresAt < new Date()) };

  const shift = await db.shift.findUnique({ where: { crewToken: token }, select: { id: true, assignmentId: true, crewTokenExpiresAt: true } });
  if (!shift) return null;
  const voll = await db.assignment.findUnique({ where: { id: shift.assignmentId }, include: CREW_INCLUDE });
  if (!voll) return null;
  return {
    a: { ...voll, shifts: voll.shifts.filter((s) => s.id === shift.id) },
    nurSchichtId: shift.id,
    schichtenGesamt: voll.shifts.length,
    abgelaufen: Boolean(shift.crewTokenExpiresAt && shift.crewTokenExpiresAt < new Date()),
  };
}

export async function customerSign(assignmentId: string, input: z.infer<typeof CustomerSignSchema>, meta: RequestMeta): Promise<void> {
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, organizationId: true } });
  if (!a) throw new TimeEntryError("Einsatz nicht gefunden.", 404);
  const png = decodeSignatureDataUrl(input.unterschrift);
  const blob = await putBlob(a.organizationId, "kundenbestaetigungen", png, "image/png");
  const conf = await db.assignmentConfirmation.create({
    data: { organizationId: a.organizationId, assignmentId: a.id, kundeName: input.kundeName, unterschriftUrl: blob.url, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  await logAudit({ organizationId: a.organizationId, action: "assignment.customer_sign", entityType: "assignment", entityId: a.id, data: { confirmationId: conf.id, kundeName: input.kundeName, unterschrift: blob.url, ip: meta.ip } });
  await enqueueJob("stundennachweis.pdf", { assignmentId: a.id, force: true }, { organizationId: a.organizationId, dedupeKey: `pdf:${a.id}:${Date.now()}` });
}

// Dispo-Korrektur nach Signatur: neue Version, alte bleibt unverändert
export async function correctTimeEntry(actor: { id: string; organizationId: string }, timeEntryId: string, input: z.infer<typeof CorrectionSchema>): Promise<{ id: string }> {
  const old = await db.timeEntry.findFirst({ where: { id: timeEntryId, organizationId: actor.organizationId, aktuell: true }, include: { trips: true, shiftAssignment: { include: { shift: true } } } });
  if (!old) throw new TimeEntryError("Zeiteintrag nicht gefunden oder nicht aktuell.", 404);
  if (old.review === "FREIGEGEBEN") throw new TimeEntryError("Freigegebene Einträge können nicht mehr korrigiert werden – Freigabe zuerst zurücknehmen.", 409);
  const { istStart, istEnde } = resolveTimes(input);
  await assertMonthOpen(actor.organizationId, old.istStart);
  await assertMonthOpen(actor.organizationId, istStart);

  const created = await db.$transaction(async (tx) => {
    await tx.timeEntry.update({ where: { id: old.id }, data: { aktuell: false } });
    return tx.timeEntry.create({
      data: {
        organizationId: actor.organizationId,
        shiftAssignmentId: old.shiftAssignmentId,
        version: old.version + 1,
        aktuell: true,
        korrigiertVonId: old.id,
        korrekturGrund: input.korrekturGrund,
        istStart,
        istEnde,
        pauseMinuten: input.pauseMinuten,
        stundenGesamt: netHours(istStart, istEnde, input.pauseMinuten),
        taetigkeit: input.taetigkeit || old.taetigkeit,
        notiz: input.notiz || null,
        pkw: input.pkw,
        pkwArt: input.pkw ? input.pkwArt : null,
        spesen: input.spesen,
        spesenBetrag: input.spesen ? input.spesenBetrag : null,
        // Unterschrift und Unterweisung bleiben aus der Originalversion referenziert
        unterschriftMitarbeiterUrl: old.unterschriftMitarbeiterUrl,
        unterschriftZeitpunkt: old.unterschriftZeitpunkt,
        unterweisungBestaetigt: old.unterweisungBestaetigt,
        unterweisungVersion: old.unterweisungVersion,
        ip: old.ip,
        userAgent: old.userAgent,
        geraet: old.geraet,
        quelle: "DISPO",
        review: "ERFASST",
        createdById: actor.id,
        trips: { create: old.trips.map((t) => ({ organizationId: actor.organizationId, von: t.von, nach: t.nach, km: t.km, reihenfolge: t.reihenfolge })) },
      },
    });
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "time_entry.correct",
    entityType: "time_entry",
    entityId: created.id,
    data: {
      korrigiertVon: old.id,
      grund: input.korrekturGrund,
      alt: { istStart: old.istStart, istEnde: old.istEnde, pauseMinuten: old.pauseMinuten, stundenGesamt: Number(old.stundenGesamt), pkw: old.pkw, spesen: old.spesen, notiz: old.notiz },
      neu: { istStart, istEnde, pauseMinuten: input.pauseMinuten, stundenGesamt: Number(created.stundenGesamt), pkw: input.pkw, spesen: input.spesen, notiz: input.notiz || null },
    },
  });
  await enqueueJob("stundennachweis.pdf", { assignmentId: old.shiftAssignment.shift.assignmentId, force: true }, { organizationId: actor.organizationId, dedupeKey: `pdf:${old.shiftAssignment.shift.assignmentId}:${Date.now()}` });
  return { id: created.id };
}

// Prüfung / Freigabe (nur freigegebene Zeiten gehen in den Export)
export async function reviewTimeEntries(actor: { id: string; organizationId: string }, ids: string[], target: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN"): Promise<number> {
  const entries = await db.timeEntry.findMany({ where: { id: { in: ids }, organizationId: actor.organizationId, aktuell: true }, select: { id: true, istStart: true, review: true, shiftAssignmentId: true } });
  let n = 0;
  for (const e of entries) {
    await assertMonthOpen(actor.organizationId, e.istStart);
    const data =
      target === "FREIGEGEBEN"
        ? { review: target, freigegebenVon: actor.id, freigegebenAm: new Date(), geprueftVon: actor.id, geprueftAm: new Date() }
        : target === "GEPRUEFT"
          ? { review: target, geprueftVon: actor.id, geprueftAm: new Date(), freigegebenVon: null, freigegebenAm: null }
          : { review: target, geprueftVon: null, geprueftAm: null, freigegebenVon: null, freigegebenAm: null };
    await db.timeEntry.update({ where: { id: e.id }, data });
    await db.shiftAssignment.update({ where: { id: e.shiftAssignmentId }, data: { status: target === "FREIGEGEBEN" ? "FREIGEGEBEN" : "ERFASST" } });
    await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "time_entry.review", entityType: "time_entry", entityId: e.id, data: { alt: e.review, neu: target } });
    n++;
  }
  return n;
}

export function entryDateKey(e: { istStart: Date }): string {
  return berlinDateKey(e.istStart);
}
