// Mitarbeiter-Links: Versand-Jobs planen (24 h vor Schichtbeginn, Erinnerung
// nach Schichtende) und WhatsApp-Texte zum Kopieren erzeugen.
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { enqueueJob } from "../jobs/queue";
import { crewLinkUrl, employeeLinkUrl, whatsappText, type LinkMessageInput } from "../mail";
import { loadAssignment, type AssignmentDetail } from "./assignments";

export const LINK_LEAD_HOURS = 24;
export const REMINDER_DELAY_HOURS = 2;

export function messageInputFor(a: AssignmentDetail, shift: AssignmentDetail["shifts"][number], sa: AssignmentDetail["shifts"][number]["assignments"][number], erinnerung = false): LinkMessageInput {
  return {
    vorname: sa.employee.vorname,
    projekt: a.projekt,
    kunde: a.customer.name,
    einsatzort: a.einsatzort,
    bezeichnung: shift.bezeichnung,
    planStart: sa.planStart,
    planEnde: sa.planEnde,
    treffpunkt: shift.treffpunkt,
    token: sa.token,
    erinnerung,
  };
}

export type LinkRow = {
  shiftAssignmentId: string;
  name: string;
  schicht: string;
  email: string | null;
  mobil: string | null;
  url: string;
  status: string;
  tokenUsedAt: Date | null;
  linkSentAt: Date | null;
  reminderSentAt: Date | null;
  whatsapp: string;
};

export function linkRows(a: AssignmentDetail): LinkRow[] {
  const rows: LinkRow[] = [];
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      rows.push({
        shiftAssignmentId: sa.id,
        name: `${sa.employee.vorname} ${sa.employee.nachname}`,
        schicht: s.bezeichnung,
        email: sa.employee.email,
        mobil: sa.employee.mobil,
        url: employeeLinkUrl(sa.token),
        status: sa.status,
        tokenUsedAt: sa.tokenUsedAt,
        linkSentAt: sa.linkSentAt,
        reminderSentAt: sa.reminderSentAt,
        whatsapp: whatsappText(messageInputFor(a, s, sa)),
      });
    }
  }
  return rows;
}

export function crewUrlFor(a: AssignmentDetail): string | null {
  return a.crewToken ? crewLinkUrl(a.crewToken) : null;
}

// Plant Versand + Erinnerung je Person (idempotent über dedupeKey)
export async function scheduleLinkJobs(actor: { id: string; organizationId: string }, assignmentId: string, options: { sofort?: boolean } = {}): Promise<{ geplant: number }> {
  const a = await loadAssignment(actor.organizationId, assignmentId);
  if (!a) throw new Error("Einsatz nicht gefunden.");
  const now = Date.now();
  let geplant = 0;
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      const sendAt = options.sofort ? new Date() : new Date(Math.max(now, sa.planStart.getTime() - LINK_LEAD_HOURS * 3600000));
      await enqueueJob("link.versand", { shiftAssignmentId: sa.id }, { runAt: sendAt, dedupeKey: `link:${sa.id}`, organizationId: a.organizationId });
      await enqueueJob(
        "link.erinnerung",
        { shiftAssignmentId: sa.id },
        { runAt: new Date(Math.max(now, sa.planEnde.getTime() + REMINDER_DELAY_HOURS * 3600000)), dedupeKey: `erinnerung:${sa.id}`, organizationId: a.organizationId }
      );
      geplant++;
    }
  }
  await logAudit({ organizationId: a.organizationId, userId: actor.id, action: "assignment.links.schedule", entityType: "assignment", entityId: a.id, data: { geplant, sofort: Boolean(options.sofort) } });
  return { geplant };
}

export async function markLinkSent(shiftAssignmentId: string, field: "linkSentAt" | "reminderSentAt"): Promise<void> {
  await db.shiftAssignment.update({ where: { id: shiftAssignmentId }, data: { [field]: new Date() } });
}
