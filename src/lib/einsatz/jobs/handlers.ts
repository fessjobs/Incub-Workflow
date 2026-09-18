// Job-Handler des Einsatzmoduls. Wird einmal vom Worker (und der Run-Route)
// registriert.
import { db } from "@/lib/db";
import { isMailConfigured, mailSubject, sendMail, whatsappText } from "../mail";
import { loadAssignment } from "../service/assignments";
import { messageInputFor, markLinkSent } from "../service/links";
import { generateStundennachweisPdf } from "../service/pdf";
import { registerJobHandler } from "./queue";

let registered = false;

export function registerEinsatzJobHandlers(): void {
  if (registered) return;
  registered = true;

  // Versand des Mitarbeiter-Links (E-Mail, wenn konfiguriert und Adresse vorhanden)
  registerJobHandler("link.versand", async ({ shiftAssignmentId }) => {
    const sa = await db.shiftAssignment.findUnique({ where: { id: shiftAssignmentId }, include: { shift: { select: { assignmentId: true } } } });
    if (!sa || sa.status === "STORNIERT") return { skipped: "storniert oder nicht gefunden" };
    const a = await loadAssignment(sa.organizationId, sa.shift.assignmentId);
    if (!a) return { skipped: "Einsatz nicht gefunden" };
    const shift = a.shifts.find((s) => s.assignments.some((x) => x.id === sa.id));
    const full = shift?.assignments.find((x) => x.id === sa.id);
    if (!shift || !full) return { skipped: "Zuordnung nicht gefunden" };
    const input = messageInputFor(a, shift, full);
    const text = whatsappText(input);
    let mail: { sent: boolean; error: string | null } = { sent: false, error: "keine E-Mail-Adresse" };
    if (full.employee.email && isMailConfigured()) mail = await sendMail(full.employee.email, mailSubject(input), text);
    else if (full.employee.email) mail = { sent: false, error: "SMTP nicht konfiguriert" };
    await markLinkSent(sa.id, "linkSentAt");
    return { mail, whatsappBereit: true };
  });

  // Erinnerung nach Schichtende an alle, die noch nicht erfasst haben
  registerJobHandler("link.erinnerung", async ({ shiftAssignmentId }) => {
    const sa = await db.shiftAssignment.findUnique({ where: { id: shiftAssignmentId }, include: { shift: { select: { assignmentId: true } }, timeEntries: { where: { aktuell: true } } } });
    if (!sa || sa.status === "STORNIERT") return { skipped: "storniert oder nicht gefunden" };
    if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) return { skipped: "bereits erfasst" };
    const a = await loadAssignment(sa.organizationId, sa.shift.assignmentId);
    if (!a) return { skipped: "Einsatz nicht gefunden" };
    const shift = a.shifts.find((s) => s.assignments.some((x) => x.id === sa.id));
    const full = shift?.assignments.find((x) => x.id === sa.id);
    if (!shift || !full) return { skipped: "Zuordnung nicht gefunden" };
    const input = messageInputFor(a, shift, full, true);
    let mail: { sent: boolean; error: string | null } = { sent: false, error: "keine E-Mail-Adresse" };
    if (full.employee.email && isMailConfigured()) mail = await sendMail(full.employee.email, mailSubject(input), whatsappText(input));
    await markLinkSent(sa.id, "reminderSentAt");
    return { mail };
  });

  // Stundennachweis-PDF erzeugen (nach Abschluss, Kundenunterschrift, Korrektur)
  registerJobHandler("stundennachweis.pdf", async ({ assignmentId }) => {
    const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { organizationId: true } });
    if (!a) return { skipped: "Einsatz nicht gefunden" };
    const res = await generateStundennachweisPdf(a.organizationId, assignmentId, null);
    return { documentId: res.documentId, offen: res.offen };
  });

  // Prüft nach jeder Signatur, ob alle unterschrieben haben → PDF + Abschluss
  registerJobHandler("einsatz.abschluss-check", async ({ assignmentId }) => {
    const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { organizationId: true, status: true } });
    if (!a) return { skipped: "Einsatz nicht gefunden" };
    const full = await loadAssignment(a.organizationId, assignmentId);
    if (!full) return { skipped: "Einsatz nicht gefunden" };
    const offen = full.shifts.flatMap((s) => s.assignments).filter((sa) => sa.status !== "STORNIERT" && !sa.timeEntries.some((t) => t.unterschriftZeitpunkt));
    if (offen.length > 0) return { offen: offen.length };
    const res = await generateStundennachweisPdf(a.organizationId, assignmentId, null);
    if (a.status === "LAUFEND" || a.status === "KONKRETISIERT" || a.status === "ENTWURF") {
      await db.assignment.update({ where: { id: assignmentId }, data: { status: "ABGESCHLOSSEN" } });
    }
    return { documentId: res.documentId, abgeschlossen: true };
  });
}
