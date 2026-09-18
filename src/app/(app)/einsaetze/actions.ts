"use server";

// Server Actions des Dispo-Bereichs. Autorisierung auf jeder Action,
// organizationId ausschließlich aus der Session.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canDispo, canReview, requireDispo, requireModuleUser, requireReviewer } from "@/lib/einsatz/access";
import { processJobsOnce } from "@/lib/einsatz/jobs/worker";
import { CorrectionSchema, CreateAssignmentSchema } from "@/lib/einsatz/schemas";
import { AssignmentError, createAssignment, renewTokens, setAssignmentStatus, type CreateResult } from "@/lib/einsatz/service/assignments";
import { scheduleLinkJobs } from "@/lib/einsatz/service/links";
import { generateKonkretisierungPdf, generateStundennachweisPdf } from "@/lib/einsatz/service/pdf";
import { correctTimeEntry, reviewTimeEntries, TimeEntryError } from "@/lib/einsatz/service/time-entries";

export type ActionResult = { ok: true; message?: string; documentId?: string } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  if (err instanceof AssignmentError || err instanceof TimeEntryError) return { ok: false, error: err.message };
  const message = err instanceof Error ? err.message : "Unbekannter Fehler";
  console.error("Einsatz-Action fehlgeschlagen:", message);
  return { ok: false, error: message };
}

export async function createAssignmentAction(input: unknown, options: { konkretisierung: boolean }): Promise<CreateResult> {
  const user = await requireDispo();
  const parsed = CreateAssignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message, konflikte: [] };
  try {
    const result = await createAssignment({ id: user.id, organizationId: user.organizationId }, parsed.data);
    if (result.ok && options.konkretisierung) {
      try {
        await generateKonkretisierungPdf(user.organizationId, result.id, user.id);
      } catch (err) {
        console.error("Konkretisierung nach Anlage fehlgeschlagen:", err instanceof Error ? err.message : err);
      }
    }
    revalidatePath("/einsaetze");
    return result;
  } catch (err) {
    const f = fail(err);
    return { ok: false, error: f.ok ? "" : f.error, konflikte: [] };
  }
}

export async function generateKonkretisierungAction(assignmentId: string): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    const res = await generateKonkretisierungPdf(user.organizationId, assignmentId, user.id);
    revalidatePath(`/einsaetze/${assignmentId}`);
    return { ok: true, message: `${res.filename} erzeugt.`, documentId: res.documentId };
  } catch (err) {
    return fail(err);
  }
}

export async function generateStundennachweisAction(assignmentId: string): Promise<ActionResult> {
  const user = await requireModuleUser();
  if (!canDispo(user) && !canReview(user)) return { ok: false, error: "Keine Berechtigung." };
  try {
    const res = await generateStundennachweisPdf(user.organizationId, assignmentId, user.id);
    revalidatePath(`/einsaetze/${assignmentId}`);
    return { ok: true, message: `${res.filename} erzeugt${res.offen > 0 ? ` (${res.offen} ohne Unterschrift)` : ""}.`, documentId: res.documentId };
  } catch (err) {
    return fail(err);
  }
}

export async function scheduleLinksAction(assignmentId: string, sofort: boolean): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    const res = await scheduleLinkJobs({ id: user.id, organizationId: user.organizationId }, assignmentId, { sofort });
    if (sofort) await processJobsOnce(50);
    revalidatePath(`/einsaetze/${assignmentId}`);
    return { ok: true, message: sofort ? `${res.geplant} Link(s) versendet bzw. zum Kopieren bereit.` : `${res.geplant} Link(s) geplant (24 h vor Schichtbeginn).` };
  } catch (err) {
    return fail(err);
  }
}

const StatusSchema = z.enum(["ENTWURF", "KONKRETISIERT", "LAUFEND", "ABGESCHLOSSEN", "ABGERECHNET"]);

export async function setStatusAction(assignmentId: string, status: string): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = StatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Ungültiger Status." };
  try {
    await setAssignmentStatus({ id: user.id, organizationId: user.organizationId }, assignmentId, parsed.data);
    if (parsed.data === "ABGESCHLOSSEN") {
      await generateStundennachweisPdf(user.organizationId, assignmentId, user.id);
    }
    revalidatePath(`/einsaetze/${assignmentId}`);
    revalidatePath("/einsaetze");
    return { ok: true, message: "Status aktualisiert." };
  } catch (err) {
    return fail(err);
  }
}

export async function renewTokensAction(assignmentId: string): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    const n = await renewTokens({ id: user.id, organizationId: user.organizationId }, assignmentId);
    revalidatePath(`/einsaetze/${assignmentId}`);
    return { ok: true, message: `${n} Link(s) erneuert.` };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelShiftAssignmentAction(shiftAssignmentId: string): Promise<void> {
  const user = await requireDispo();
  const sa = await db.shiftAssignment.findFirst({ where: { id: shiftAssignmentId, organizationId: user.organizationId }, include: { shift: true, timeEntries: { where: { aktuell: true } } } });
  if (!sa) return;
  if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) return;
  await db.shiftAssignment.update({ where: { id: sa.id }, data: { status: sa.status === "STORNIERT" ? "GEPLANT" : "STORNIERT" } });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "shift_assignment.toggle_cancel", entityType: "shift_assignment", entityId: sa.id, data: { alt: sa.status } });
  revalidatePath(`/einsaetze/${sa.shift.assignmentId}`);
}

export async function correctEntryAction(timeEntryId: string, input: unknown): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = CorrectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    await correctTimeEntry({ id: user.id, organizationId: user.organizationId }, timeEntryId, parsed.data);
    await processJobsOnce(5);
    revalidatePath("/einsaetze");
    return { ok: true, message: "Korrektur gespeichert (neue Version, alte bleibt protokolliert)." };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewAction(ids: string[], target: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN"): Promise<ActionResult> {
  const user = await requireReviewer();
  try {
    const n = await reviewTimeEntries({ id: user.id, organizationId: user.organizationId }, ids.filter(Boolean), target);
    revalidatePath("/einsaetze/freigabe");
    revalidatePath("/auswertung");
    return { ok: true, message: `${n} Eintrag/Einträge → ${target === "FREIGEGEBEN" ? "freigegeben" : target === "GEPRUEFT" ? "geprüft" : "zurück auf erfasst"}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function runJobsAction(): Promise<ActionResult> {
  const user = await requireDispo();
  const res = await processJobsOnce(50);
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "jobs.run", entityType: "job", data: { processed: res.processed, failed: res.failed } });
  revalidatePath("/einsaetze");
  return { ok: true, message: `${res.processed} Job(s) verarbeitet, ${res.failed} fehlgeschlagen.` };
}
