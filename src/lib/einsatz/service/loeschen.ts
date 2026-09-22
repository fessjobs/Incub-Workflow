// Löschen im Backend: eine Zeiterfassung oder ein ganzer Einsatz.
//
// Gelöscht wird wirklich gelöscht – kein verstecktes Storno. Damit trotzdem
// nachvollziehbar bleibt, was verschwunden ist, schreibt jede Löschung einen
// vollständigen Abzug ins Audit-Log (wer, wann, was genau, inklusive der
// Prüfsummen gelöschter PDFs).
//
// Zwei Grenzen gelten immer, für jede Rolle:
//   - freigegebene Zeiten lassen sich nicht löschen (erst Freigabe zurück),
//   - ein gesperrter Monat bleibt gesperrt.
// Beides sind Abrechnungsgrenzen, keine Bequemlichkeitsregeln.
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BLOB_URL_PREFIX } from "../blob";
import { berlinDateKey, toBerlin } from "../tz";

export class LoeschError extends Error {
  constructor(
    message: string,
    public status = 409
  ) {
    super(message);
    this.name = "LoeschError";
  }
}

export type Actor = Pick<User, "id" | "organizationId" | "role">;

// Unterschriften und Kundenbestätigungen liegen als PNG im Blob-Speicher.
// Der S3-Adapter kann (noch) nicht löschen – dort bleiben die Dateien liegen,
// die Referenz in der Datenbank verschwindet trotzdem.
async function loescheBlobs(urls: Array<string | null | undefined>): Promise<number> {
  const ids = urls.filter((u): u is string => typeof u === "string" && u.startsWith(BLOB_URL_PREFIX)).map((u) => u.slice(BLOB_URL_PREFIX.length));
  if (ids.length === 0) return 0;
  const { count } = await db.blob.deleteMany({ where: { id: { in: ids } } });
  return count;
}

async function assertMonateOffen(organizationId: string, zeitpunkte: Date[]): Promise<void> {
  const monate = new Map<string, { jahr: number; monat: number }>();
  for (const d of zeitpunkte) {
    const p = toBerlin(d);
    monate.set(`${p.year}-${p.month}`, { jahr: p.year, monat: p.month });
  }
  if (monate.size === 0) return;
  const locks = await db.monthLock.findMany({
    where: { organizationId, OR: [...monate.values()].map((m) => ({ jahr: m.jahr, monat: m.monat })) },
    select: { jahr: true, monat: true },
  });
  if (locks.length > 0) {
    const liste = locks.map((l) => `${String(l.monat).padStart(2, "0")}/${l.jahr}`).join(", ");
    throw new LoeschError(`Gesperrter Monat betroffen (${liste}) – dort ist nichts mehr zu ändern.`);
  }
}

// ─── Zeiterfassung einer Person löschen ─────────────────────────────────────

export type ZeitLoeschErgebnis = { eintraege: number; person: string; schicht: string; assignmentId: string };

// Löscht die komplette Erfassung einer Person für eine Schicht: alle
// Versionen, Fahrten, die Unterschrift und die interne Beurteilung dieser
// Schicht. Die Einteilung bleibt bestehen und wird auf „geplant"
// zurückgesetzt – mit frischem Token, damit die Person neu erfassen kann.
export async function loescheZeiterfassung(actor: Actor, shiftAssignmentId: string): Promise<ZeitLoeschErgebnis> {
  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, organizationId: actor.organizationId },
    include: {
      employee: { select: { vorname: true, nachname: true } },
      bewertung: true,
      shift: { select: { bezeichnung: true, assignmentId: true } },
      timeEntries: { include: { trips: true } },
    },
  });
  if (!sa) throw new LoeschError("Einteilung nicht gefunden.", 404);
  if (sa.timeEntries.length === 0) throw new LoeschError("Für diese Person ist nichts erfasst.", 404);

  const freigegeben = sa.timeEntries.filter((t) => t.review === "FREIGEGEBEN");
  if (freigegeben.length > 0) {
    throw new LoeschError("Diese Zeiten sind freigegeben. Erst die Freigabe zurücknehmen, dann löschen.");
  }
  await assertMonateOffen(actor.organizationId, sa.timeEntries.map((t) => t.istStart));

  const person = `${sa.employee.vorname} ${sa.employee.nachname}`;
  // Abzug fürs Protokoll, bevor die Daten weg sind
  const abzug = sa.timeEntries.map((t) => ({
    id: t.id,
    version: t.version,
    aktuell: t.aktuell,
    istStart: t.istStart.toISOString(),
    istEnde: t.istEnde.toISOString(),
    pauseMinuten: t.pauseMinuten,
    stundenGesamt: Number(t.stundenGesamt),
    taetigkeit: t.taetigkeit,
    pkw: t.pkw,
    fahrten: t.trips.map((f) => ({ von: f.von, nach: f.nach, km: Number(f.km) })),
    spesen: t.spesen,
    review: t.review,
    unterschriftZeitpunkt: t.unterschriftZeitpunkt?.toISOString() ?? null,
    unterschrift: t.unterschriftMitarbeiterUrl,
    quelle: t.quelle,
  }));

  const blobs = await loescheBlobs(sa.timeEntries.map((t) => t.unterschriftMitarbeiterUrl));
  await db.$transaction(async (tx) => {
    // Korrekturketten zuerst entkoppeln, sonst hängt die Selbstreferenz
    await tx.timeEntry.updateMany({ where: { shiftAssignmentId: sa.id }, data: { korrigiertVonId: null } });
    await tx.timeEntry.deleteMany({ where: { shiftAssignmentId: sa.id } });
    // Die Beurteilung galt einer Leistung, die es nicht mehr gibt
    await tx.shiftRating.deleteMany({ where: { shiftAssignmentId: sa.id } });
    await tx.shiftAssignment.update({ where: { id: sa.id }, data: { status: "GEPLANT", tokenUsedAt: null } });
  });

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "time_entry.delete",
    entityType: "shift_assignment",
    entityId: sa.id,
    data: {
      assignmentId: sa.shift.assignmentId,
      schicht: sa.shift.bezeichnung,
      person,
      geloeschteEintraege: abzug,
      geloeschteBewertung: sa.bewertung ? { wert: sa.bewertung.wert, notiz: sa.bewertung.notiz } : null,
      geloeschteBlobs: blobs,
    },
  });

  return { eintraege: sa.timeEntries.length, person, schicht: sa.shift.bezeichnung, assignmentId: sa.shift.assignmentId };
}

// ─── Ganzen Einsatz löschen ─────────────────────────────────────────────────

export type LoeschPruefung = {
  moeglich: boolean;
  grund: string | null;
  // Bestätigung durch Eintippen der Einsatznummer nötig?
  bestaetigungNoetig: boolean;
  unterschriften: number;
  kundeBestaetigt: boolean;
  dokumente: number;
};

// Was das Löschen mitnimmt und ob es überhaupt geht. Wird auch von der
// Oberfläche benutzt, damit der Knopf gar nicht erst lügt.
export function pruefeEinsatzLoeschbar(
  actor: Pick<User, "role">,
  a: {
    shifts: Array<{ assignments: Array<{ timeEntries: Array<{ review: string; unterschriftZeitpunkt: Date | null }> }> }>;
    confirmations: Array<unknown>;
    documentLinks: Array<unknown>;
    status: string;
  }
): LoeschPruefung {
  const eintraege = a.shifts.flatMap((s) => s.assignments.flatMap((sa) => sa.timeEntries));
  const unterschriften = eintraege.filter((t) => t.unterschriftZeitpunkt).length;
  const kundeBestaetigt = a.confirmations.length > 0;
  const basis = { unterschriften, kundeBestaetigt, dokumente: a.documentLinks.length };

  if (eintraege.some((t) => t.review === "FREIGEGEBEN")) {
    return { ...basis, moeglich: false, bestaetigungNoetig: false, grund: "Es gibt freigegebene Zeiten. Erst die Freigabe zurücknehmen, dann löschen." };
  }
  if (a.status === "ABGERECHNET") {
    return { ...basis, moeglich: false, bestaetigungNoetig: false, grund: "Der Einsatz ist abgerechnet und lässt sich nicht löschen." };
  }

  // Ein Entwurf ohne Unterschriften ist Wegwerfware – das darf die Dispo.
  const unberuehrt = unterschriften === 0 && !kundeBestaetigt;
  if (unberuehrt) {
    return { ...basis, moeglich: true, bestaetigungNoetig: false, grund: null };
  }
  // Sobald jemand unterschrieben oder der Kunde bestätigt hat, ist es ein
  // Nachweis. Dann nur Admin, und nur mit ausdrücklicher Bestätigung.
  if (actor.role !== "ADMIN") {
    return {
      ...basis,
      moeglich: false,
      bestaetigungNoetig: false,
      grund: kundeBestaetigt
        ? "Der Kunde hat bestätigt – löschen darf das nur ein Admin."
        : "Es liegen Unterschriften vor – löschen darf das nur ein Admin.",
    };
  }
  return { ...basis, moeglich: true, bestaetigungNoetig: true, grund: null };
}

export type EinsatzLoeschErgebnis = { einsatznummer: string; projekt: string; schichten: number; personen: number; eintraege: number; dokumente: number };

export async function loescheEinsatz(actor: Actor, assignmentId: string, bestaetigung: string | null): Promise<EinsatzLoeschErgebnis> {
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, organizationId: actor.organizationId },
    include: {
      customer: { select: { name: true } },
      confirmations: true,
      documentLinks: { include: { document: { select: { id: true, category: true, filename: true, sha256: true } } } },
      shifts: {
        include: {
          assignments: {
            include: { employee: { select: { vorname: true, nachname: true } }, bewertung: true, timeEntries: { include: { trips: true } } },
          },
        },
      },
    },
  });
  if (!a) throw new LoeschError("Einsatz nicht gefunden.", 404);

  const pruefung = pruefeEinsatzLoeschbar(actor, a);
  if (!pruefung.moeglich) throw new LoeschError(pruefung.grund ?? "Dieser Einsatz lässt sich nicht löschen.");
  if (pruefung.bestaetigungNoetig && bestaetigung?.trim() !== a.einsatznummer) {
    throw new LoeschError(`Zur Bestätigung bitte die Einsatznummer ${a.einsatznummer} eintippen.`, 400);
  }

  const eintraege = a.shifts.flatMap((s) => s.assignments.flatMap((sa) => sa.timeEntries));
  await assertMonateOffen(actor.organizationId, eintraege.map((t) => t.istStart));

  // Dokumente, die ausschließlich an diesem Einsatz hängen, gehen mit. Ein
  // Dokument, das noch woanders verlinkt ist, bleibt bestehen.
  const dokumentIds = [...new Set(a.documentLinks.map((l) => l.document.id))];
  const weitereLinks = await db.documentLink.findMany({
    where: { documentId: { in: dokumentIds }, NOT: { assignmentId } },
    select: { documentId: true },
  });
  const behalten = new Set(weitereLinks.map((l) => l.documentId));
  const zuLoeschendeDokumente = a.documentLinks.map((l) => l.document).filter((d) => !behalten.has(d.id));

  const abzug = {
    einsatznummer: a.einsatznummer,
    projekt: a.projekt,
    kunde: a.customer.name,
    einsatzort: a.einsatzort,
    von: berlinDateKey(a.datumVon),
    bis: berlinDateKey(a.datumBis),
    status: a.status,
    schichten: a.shifts.map((s) => ({
      bezeichnung: s.bezeichnung,
      taetigkeit: s.taetigkeit,
      planStart: s.planStart.toISOString(),
      planEnde: s.planEnde.toISOString(),
      personen: s.assignments.map((sa) => ({
        name: `${sa.employee.vorname} ${sa.employee.nachname}`,
        status: sa.status,
        bewertung: sa.bewertung ? { wert: sa.bewertung.wert, notiz: sa.bewertung.notiz } : null,
        eintraege: sa.timeEntries.map((t) => ({
          version: t.version,
          istStart: t.istStart.toISOString(),
          istEnde: t.istEnde.toISOString(),
          pauseMinuten: t.pauseMinuten,
          stundenGesamt: Number(t.stundenGesamt),
          review: t.review,
          unterschriftZeitpunkt: t.unterschriftZeitpunkt?.toISOString() ?? null,
          fahrten: t.trips.map((f) => ({ von: f.von, nach: f.nach, km: Number(f.km) })),
        })),
      })),
    })),
    kundenbestaetigungen: a.confirmations.map((c) => ({ kundeName: c.kundeName, zeitpunkt: c.zeitpunkt.toISOString() })),
    // Prüfsummen bleiben im Protokoll, auch wenn die PDFs verschwinden
    dokumente: zuLoeschendeDokumente.map((d) => ({ category: d.category, filename: d.filename, sha256: d.sha256 })),
    dokumenteBehalten: a.documentLinks.map((l) => l.document).filter((d) => behalten.has(d.id)).map((d) => d.filename),
  };

  const blobs = await loescheBlobs([
    ...eintraege.map((t) => t.unterschriftMitarbeiterUrl),
    ...a.confirmations.map((c) => c.unterschriftUrl),
  ]);

  await db.$transaction(async (tx) => {
    // Selbstreferenz der Korrekturketten lösen, sonst blockiert der Cascade
    await tx.timeEntry.updateMany({ where: { shiftAssignment: { shift: { assignmentId } } }, data: { korrigiertVonId: null } });
    if (zuLoeschendeDokumente.length > 0) await tx.document.deleteMany({ where: { id: { in: zuLoeschendeDokumente.map((d) => d.id) } } });
    // Schichten, Einteilungen, Zeiteinträge, Fahrten, Bewertungen und
    // Kundenbestätigungen hängen am Cascade des Einsatzes
    await tx.assignment.delete({ where: { id: assignmentId } });
  });

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.delete",
    entityType: "assignment",
    entityId: assignmentId,
    data: { ...abzug, geloeschteBlobs: blobs },
  });

  return {
    einsatznummer: a.einsatznummer,
    projekt: a.projekt,
    schichten: a.shifts.length,
    personen: a.shifts.reduce((n, s) => n + s.assignments.length, 0),
    eintraege: eintraege.length,
    dokumente: zuLoeschendeDokumente.length,
  };
}

// ─── Person aus dem Stamm löschen ───────────────────────────────────────────

export type PersonLoeschPruefung = {
  moeglich: boolean;
  grund: string | null;
  bestaetigungNoetig: boolean;
  einteilungen: number;
  unterschrieben: number;
};

export async function pruefePersonLoeschbar(actor: Pick<User, "role">, organizationId: string, employeeId: string): Promise<PersonLoeschPruefung> {
  const e = await db.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: {
      shiftAssignments: {
        select: { timeEntries: { select: { review: true, unterschriftZeitpunkt: true } } },
      },
    },
  });
  if (!e) return { moeglich: false, grund: "Person nicht gefunden.", bestaetigungNoetig: false, einteilungen: 0, unterschrieben: 0 };

  const eintraege = e.shiftAssignments.flatMap((sa) => sa.timeEntries);
  const unterschrieben = eintraege.filter((t) => t.unterschriftZeitpunkt).length;
  const basis = { einteilungen: e.shiftAssignments.length, unterschrieben };

  // Nie gearbeitet, nie eingeteilt: reine Karteileiche, darf weg
  if (basis.einteilungen === 0) return { ...basis, moeglich: true, bestaetigungNoetig: false, grund: null };

  if (eintraege.some((t) => t.review === "FREIGEGEBEN")) {
    return { ...basis, moeglich: false, bestaetigungNoetig: false, grund: "Diese Person hat freigegebene Zeiten – die gehören zur Abrechnung. Statt löschen: auf inaktiv setzen." };
  }
  if (unterschrieben > 0) {
    return {
      ...basis,
      moeglich: false,
      bestaetigungNoetig: false,
      grund: `Diese Person hat ${unterschrieben} unterschriebene Erfassung(en). Erst die betroffenen Einsätze löschen, oder die Person auf inaktiv setzen.`,
    };
  }
  // Eingeteilt, aber nie erfasst: das ist Testdatenlage. Admin darf, mit
  // ausdrücklicher Bestätigung – die Einteilungen gehen mit.
  if (actor.role !== "ADMIN") {
    return { ...basis, moeglich: false, bestaetigungNoetig: false, grund: `Diese Person ist in ${basis.einteilungen} Schicht(en) eingeteilt – löschen darf das nur ein Admin.` };
  }
  return { ...basis, moeglich: true, bestaetigungNoetig: true, grund: null };
}

export type PersonLoeschErgebnis = { name: string; einteilungen: number };

export async function loeschePerson(actor: Actor, employeeId: string, bestaetigung: string | null): Promise<PersonLoeschErgebnis> {
  const e = await db.employee.findFirst({
    where: { id: employeeId, organizationId: actor.organizationId },
    include: {
      shiftAssignments: {
        include: { shift: { select: { bezeichnung: true, assignment: { select: { einsatznummer: true } } } }, timeEntries: true },
      },
    },
  });
  if (!e) throw new LoeschError("Person nicht gefunden.", 404);

  const pruefung = await pruefePersonLoeschbar(actor, actor.organizationId, employeeId);
  if (!pruefung.moeglich) throw new LoeschError(pruefung.grund ?? "Diese Person lässt sich nicht löschen.");
  if (pruefung.bestaetigungNoetig && bestaetigung?.trim().toLowerCase() !== e.nachname.trim().toLowerCase()) {
    throw new LoeschError(`Zur Bestätigung bitte den Nachnamen „${e.nachname}“ eintippen.`, 400);
  }

  const eintraege = e.shiftAssignments.flatMap((sa) => sa.timeEntries);
  await assertMonateOffen(actor.organizationId, eintraege.map((t) => t.istStart));

  const name = `${e.vorname} ${e.nachname}`;
  const abzug = {
    name,
    personalnummer: e.personalnummer,
    email: e.email,
    mobil: e.mobil,
    status: e.status,
    einteilungen: e.shiftAssignments.map((sa) => ({
      einsatz: sa.shift.assignment.einsatznummer,
      schicht: sa.shift.bezeichnung,
      status: sa.status,
      eintraege: sa.timeEntries.length,
    })),
  };

  const blobs = await loescheBlobs(eintraege.map((t) => t.unterschriftMitarbeiterUrl));
  await db.$transaction(async (tx) => {
    await tx.timeEntry.updateMany({ where: { shiftAssignment: { employeeId } }, data: { korrigiertVonId: null } });
    // Einteilungen zuerst: die Beziehung zur Person ist sonst gesperrt
    await tx.shiftAssignment.deleteMany({ where: { employeeId } });
    await tx.employee.delete({ where: { id: employeeId } });
  });

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "employee.delete",
    entityType: "employee",
    entityId: employeeId,
    data: { ...abzug, geloeschteBlobs: blobs },
  });

  return { name, einteilungen: e.shiftAssignments.length };
}
