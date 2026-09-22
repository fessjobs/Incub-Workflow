"use server";

// Server Actions des Dispo-Bereichs. Autorisierung auf jeder Action,
// organizationId ausschließlich aus der Session.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canDispo, canReview, requireDispo, requireModuleUser, requireRater, requireReviewer } from "@/lib/einsatz/access";
import { processJobsOnce } from "@/lib/einsatz/jobs/worker";
import { CorrectionSchema, CreateAssignmentSchema, PasteApplySchema, PastePreviewSchema, RatingSchema, RenamePersonSchema, UpdateAssignmentSchema, UpdateShiftSchema } from "@/lib/einsatz/schemas";
import { setzeBewertung } from "@/lib/einsatz/service/personal";
import { loescheEinsatz, loeschePerson, loescheZeiterfassung, LoeschError } from "@/lib/einsatz/service/loeschen";
import { aktualisiereKopf, aktualisiereSchicht, ergaenzePersonen, loescheZeitvorgabe, setzeNamen, vorschauNamen, BesetzungError, type VorschauZeile } from "@/lib/einsatz/service/besetzung";
import { fromBerlin, keyToDateOnly } from "@/lib/einsatz/tz";
import { AssignmentError, createAssignment, renewTokens, setAssignmentStatus, type CreateResult } from "@/lib/einsatz/service/assignments";
import { scheduleLinkJobs } from "@/lib/einsatz/service/links";
import { generateKonkretisierungPdf, generateStundennachweisPdf } from "@/lib/einsatz/service/pdf";
import { correctTimeEntry, reviewTimeEntries, TimeEntryError } from "@/lib/einsatz/service/time-entries";

export type ActionResult = { ok: true; message?: string; documentId?: string } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  if (err instanceof AssignmentError || err instanceof TimeEntryError || err instanceof BesetzungError || err instanceof LoeschError) return { ok: false, error: err.message };
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

// ─── Einsatz nachträglich bearbeiten ────────────────────────────────────────

export async function updateAssignmentAction(assignmentId: string, input: unknown): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = UpdateAssignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    const d = parsed.data;
    await aktualisiereKopf({ id: user.id, organizationId: user.organizationId }, assignmentId, {
      projekt: d.projekt,
      artist: d.artist ?? null,
      customerId: d.customerId,
      einsatzort: d.einsatzort,
      einsatzbereich: d.einsatzbereich ?? null,
      aueVertragRef: d.aueVertragRef ?? null,
      bundesland: d.bundesland,
      notizen: d.notizen ?? null,
    });
    revalidatePath(`/einsaetze/${assignmentId}`);
    return { ok: true, message: "Einsatz geändert. Konkretisierung bei Bedarf neu erzeugen." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateShiftAction(shiftId: string, input: unknown): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = UpdateShiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const d = parsed.data;
  const planStart = fromBerlin(d.datum, d.start);
  const planEnde = fromBerlin(d.endeDatum, d.ende);
  try {
    await aktualisiereSchicht({ id: user.id, organizationId: user.organizationId }, shiftId, {
      bezeichnung: d.bezeichnung,
      taetigkeit: d.taetigkeit,
      datum: keyToDateOnly(d.datum),
      planStart,
      planEnde,
      treffpunkt: d.treffpunkt ?? null,
      anzahlSoll: d.anzahlSoll,
      garantieStunden: d.garantieStunden,
    });
    revalidatePath("/einsaetze");
    return { ok: true, message: "Schicht geändert." };
  } catch (err) {
    return fail(err);
  }
}

// Namen einer Einteilung richtigstellen – auch nach der Kundenbestätigung,
// denn Namen ändern sich und müssen auf dem Nachweis stimmen. Jede Änderung
// steht im Audit-Log; die Dokumente erzeugt die Dispo danach neu.
export async function renamePersonAction(shiftAssignmentId: string, input: unknown): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = RenamePersonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    const res = await setzeNamen(user.organizationId, shiftAssignmentId, parsed.data, { userId: user.id, ip: null, quelle: "dispo" });
    revalidatePath("/einsaetze");
    return { ok: true, message: res.alt === res.neu ? "Name unverändert." : `„${res.alt}“ → „${res.neu}“. Bitte die Dokumente neu erzeugen.` };
  } catch (err) {
    return fail(err);
  }
}

export type PasteVorschau = { ok: true; zeilen: VorschauZeile[] } | { ok: false; error: string };

export async function previewNamesAction(input: unknown): Promise<PasteVorschau> {
  const user = await requireDispo();
  const parsed = PastePreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    const zeilen = await vorschauNamen(user.organizationId, parsed.data.shiftId, parsed.data.text);
    if (zeilen.length === 0) return { ok: false, error: "Keine Namen erkannt. Eine Person je Zeile einfügen." };
    return { ok: true, zeilen };
  } catch (err) {
    const f = fail(err);
    return { ok: false, error: f.ok ? "" : f.error };
  }
}

export async function addNamesAction(input: unknown): Promise<ActionResult> {
  const user = await requireDispo();
  const parsed = PasteApplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    const res = await ergaenzePersonen({ id: user.id, organizationId: user.organizationId }, parsed.data.shiftId, parsed.data.personen);
    revalidatePath("/einsaetze");
    const teile = [`${res.ergaenzt} Person(en) ergänzt`];
    if (res.neuAngelegt > 0) teile.push(`${res.neuAngelegt} neu im Stamm`);
    if (res.uebersprungen.length > 0) teile.push(`übersprungen: ${res.uebersprungen.map((u) => `${u.name} (${u.grund})`).join(", ")}`);
    return { ok: true, message: `${teile.join(" · ")}.` };
  } catch (err) {
    return fail(err);
  }
}

// Von der Crew übernommene Zeitvorgabe einer Schicht zurücknehmen
export async function clearZeitvorgabeAction(shiftId: string): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    await loescheZeitvorgabe(user.organizationId, shiftId, { userId: user.id, ip: null, quelle: "dispo" });
    revalidatePath("/einsaetze");
    return { ok: true, message: "Zeitvorgabe zurückgenommen. Neue Erfassungen starten wieder mit den Planzeiten." };
  } catch (err) {
    return fail(err);
  }
}

// ─── Interne Bewertung und Freigabe am Einsatz ──────────────────────────────

export async function rateAction(shiftAssignmentId: string, input: unknown): Promise<ActionResult> {
  const user = await requireRater();
  const parsed = RatingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  try {
    await setzeBewertung({ id: user.id, organizationId: user.organizationId }, shiftAssignmentId, parsed.data.wert, parsed.data.notiz ?? null);
    revalidatePath("/einsaetze");
    return { ok: true, message: parsed.data.wert === null ? "Bewertung zurückgenommen." : "Bewertung gespeichert." };
  } catch (err) {
    return fail(err);
  }
}

// Alle unterschriebenen Zeiten eines Einsatzes auf einmal freigeben – der
// Stundenzettel in einem Rutsch statt Zeile für Zeile in der Freigabeliste.
export async function releaseAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const user = await requireReviewer();
  try {
    const eintraege = await db.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        aktuell: true,
        review: { not: "FREIGEGEBEN" },
        unterschriftZeitpunkt: { not: null },
        shiftAssignment: { status: { not: "STORNIERT" }, shift: { assignmentId } },
      },
      select: { id: true },
    });
    if (eintraege.length === 0) return { ok: false, error: "Nichts freizugeben: Es gibt keine unterschriebenen, offenen Zeiten." };
    const n = await reviewTimeEntries({ id: user.id, organizationId: user.organizationId }, eintraege.map((e) => e.id), "FREIGEGEBEN");
    revalidatePath(`/einsaetze/${assignmentId}`);
    revalidatePath("/einsaetze/freigabe");
    revalidatePath("/auswertung");
    return { ok: true, message: `${n} Zeiteintrag/-einträge freigegeben.` };
  } catch (err) {
    return fail(err);
  }
}

// ─── Löschen ────────────────────────────────────────────────────────────────

// Erfassung einer Person für eine Schicht löschen. Die Einteilung bleibt und
// steht danach wieder auf „geplant" – die Person kann neu erfassen.
// Der zweite Parameter bleibt ungenutzt: alle Lösch-Actions haben dieselbe
// Form (id, bestaetigung), damit sie sich gleich binden lassen.
export async function deleteEntryAction(shiftAssignmentId: string, _bestaetigung: string | null = null): Promise<ActionResult> {
  void _bestaetigung;
  const user = await requireReviewer();
  try {
    const res = await loescheZeiterfassung(user, shiftAssignmentId);
    revalidatePath(`/einsaetze/${res.assignmentId}`);
    revalidatePath("/einsaetze/freigabe");
    revalidatePath("/auswertung");
    return { ok: true, message: `Erfassung von ${res.person} (${res.schicht}) gelöscht – die Einteilung steht wieder auf „geplant".` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAssignmentAction(assignmentId: string, bestaetigung: string | null): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    const res = await loescheEinsatz(user, assignmentId, bestaetigung);
    revalidatePath("/einsaetze");
    revalidatePath("/dokumente");
    revalidatePath("/auswertung");
    const teile = [`${res.schichten} Schicht(en)`, `${res.personen} Einteilung(en)`];
    if (res.eintraege > 0) teile.push(`${res.eintraege} Erfassung(en)`);
    if (res.dokumente > 0) teile.push(`${res.dokumente} PDF(s)`);
    return { ok: true, message: `Einsatz ${res.einsatznummer} „${res.projekt}" gelöscht: ${teile.join(", ")}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteEmployeeAction(employeeId: string, bestaetigung: string | null): Promise<ActionResult> {
  const user = await requireDispo();
  try {
    const res = await loeschePerson(user, employeeId, bestaetigung);
    revalidatePath("/einsaetze/personal");
    return { ok: true, message: `${res.name} gelöscht${res.einteilungen > 0 ? ` (samt ${res.einteilungen} Einteilung(en))` : ""}.` };
  } catch (err) {
    return fail(err);
  }
}
