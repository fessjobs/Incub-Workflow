// Weg eines Einsatzes zur Rechnung, in drei Stationen:
//
//   OFFEN  ──[Dispo gibt frei]──▶  FREIGEGEBEN  ──[Buchhaltung]──▶  BERECHNET
//
// Die Dispo pflegt vorher Angebotsnummer, Konditionen und einen Hinweis –
// das ist genau das, was die Buchhaltung zum Schreiben der Rechnung braucht.
// Danach trägt die Buchhaltung die Rechnungsnummer ein.
//
// Bewusst getrennt vom operativen Status des Einsatzes (wie weit ist die
// Arbeit) und von der Freigabe einzelner Zeiteinträge (stimmen die Stunden).
import type { AbrechnungStatus, User } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BesetzungError } from "./besetzung";

export const ABRECHNUNG_LABELS: Record<AbrechnungStatus, string> = {
  OFFEN: "Abrechnung offen",
  FREIGEGEBEN: "zur Abrechnung freigegeben",
  BERECHNET: "Rechnung geschrieben",
};

export const ABRECHNUNG_KURZ: Record<AbrechnungStatus, string> = {
  OFFEN: "offen",
  FREIGEGEBEN: "freigegeben",
  BERECHNET: "berechnet",
};

export type Voraussetzungen = {
  moeglich: boolean;
  // was noch fehlt, in Klartext – wird so angezeigt
  offen: string[];
  stunden: number;
  personen: number;
  offeneZeiten: number;
  stundennachweis: boolean;
};

type PruefEinsatz = {
  shifts: Array<{ assignments: Array<{ status: string; employeeId: string; timeEntries: Array<{ review: string; stundenGesamt: unknown; unterschriftZeitpunkt: Date | null }> }> }>;
  documentLinks: Array<{ document: { category: string } }>;
};

// Was vor der Freigabe stimmen muss: erfasste Zeiten, und zwar freigegebene.
// Ohne freigegebene Stunden gäbe es nichts zu berechnen – der Excel- und
// zvoove-Export enthält sie ebenfalls nicht.
export function pruefeAbrechnungsfreigabe(a: PruefEinsatz): Voraussetzungen {
  const eintraege = a.shifts.flatMap((s) => s.assignments.filter((sa) => sa.status !== "STORNIERT").flatMap((sa) => sa.timeEntries));
  const freigegeben = eintraege.filter((t) => t.review === "FREIGEGEBEN");
  const offeneZeiten = eintraege.filter((t) => t.review !== "FREIGEGEBEN").length;
  const stundennachweis = a.documentLinks.some((l) => l.document.category === "stundennachweis");

  const offen: string[] = [];
  if (eintraege.length === 0) offen.push("Es sind noch keine Zeiten erfasst.");
  else if (freigegeben.length === 0) offen.push("Keine Zeit ist freigegeben – zuerst den Stundenzettel freigeben.");
  else if (offeneZeiten > 0) offen.push(`${offeneZeiten} Zeiteintrag/-einträge sind noch nicht freigegeben.`);
  if (!stundennachweis) offen.push("Es gibt noch keinen Stundennachweis als PDF.");

  return {
    // Der Stundennachweis ist ein Hinweis, kein Riegel – die Stunden sind es.
    moeglich: freigegeben.length > 0 && offeneZeiten === 0,
    offen,
    stunden: Math.round(freigegeben.reduce((n, t) => n + Number(t.stundenGesamt), 0) * 100) / 100,
    personen: new Set(a.shifts.flatMap((s) => s.assignments.filter((sa) => sa.status !== "STORNIERT").map((sa) => sa.employeeId))).size,
    offeneZeiten,
    stundennachweis,
  };
}

async function ladeEinsatz(organizationId: string, id: string) {
  const a = await db.assignment.findFirst({
    where: { id, organizationId },
    include: {
      customer: { select: { name: true } },
      documentLinks: { select: { document: { select: { category: true } } } },
      shifts: { select: { assignments: { select: { status: true, employeeId: true, timeEntries: { where: { aktuell: true }, select: { review: true, stundenGesamt: true, unterschriftZeitpunkt: true } } } } } },
    },
  });
  if (!a) throw new BesetzungError("Einsatz nicht gefunden.", 404);
  return a;
}

// ─── Angaben für die Buchhaltung ────────────────────────────────────────────

export type AbrechnungsAngaben = { angebotsnummer: string | null; konditionen: string | null; abrechnungHinweis: string | null };

export async function speichereAngaben(actor: Pick<User, "id" | "organizationId">, assignmentId: string, input: AbrechnungsAngaben): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Die Rechnung ist geschrieben – Angaben lassen sich nicht mehr ändern.", 409);

  const vorher = { angebotsnummer: a.angebotsnummer, konditionen: a.konditionen, abrechnungHinweis: a.abrechnungHinweis };
  await db.assignment.update({ where: { id: a.id }, data: input });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.angaben",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, vorher, nachher: input },
  });
}

// ─── Freigabe durch die Dispo ───────────────────────────────────────────────

export async function gibFuerAbrechnungFrei(actor: Pick<User, "id" | "organizationId" | "name">, assignmentId: string): Promise<{ einsatznummer: string; stunden: number }> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Die Rechnung ist bereits geschrieben.", 409);
  if (a.abrechnung === "FREIGEGEBEN") throw new BesetzungError("Dieser Einsatz ist schon freigegeben.", 409);

  const pruefung = pruefeAbrechnungsfreigabe(a);
  if (!pruefung.moeglich) throw new BesetzungError(pruefung.offen[0] ?? "Freigabe noch nicht möglich.", 409);

  await db.assignment.update({
    where: { id: a.id },
    data: {
      abrechnung: "FREIGEGEBEN",
      freigabeVon: actor.name ?? actor.id,
      freigabeAm: new Date(),
      // Wer zur Abrechnung freigibt, hat den Einsatz hinter sich – der
      // operative Status zieht mit, damit die Liste nicht auseinanderläuft.
      ...(a.status === "ABGESCHLOSSEN" || a.status === "ABGERECHNET" ? {} : { status: "ABGESCHLOSSEN" as const }),
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.freigabe",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, kunde: a.customer.name, stunden: pruefung.stunden, angebotsnummer: a.angebotsnummer },
  });
  return { einsatznummer: a.einsatznummer, stunden: pruefung.stunden };
}

export async function nimmFreigabeZurueck(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung !== "FREIGEGEBEN") throw new BesetzungError("Nur eine offene Freigabe lässt sich zurücknehmen.", 409);
  await db.assignment.update({ where: { id: a.id }, data: { abrechnung: "OFFEN", freigabeVon: null, freigabeAm: null } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.abrechnung.freigabe_zurueck", entityType: "assignment", entityId: a.id, data: { einsatznummer: a.einsatznummer } });
}

// ─── Rechnung durch die Buchhaltung ─────────────────────────────────────────

export async function setzeRechnung(actor: Pick<User, "id" | "organizationId" | "name">, assignmentId: string, rechnungsnummer: string): Promise<{ einsatznummer: string }> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "OFFEN") throw new BesetzungError("Dieser Einsatz ist noch nicht für die Abrechnung freigegeben.", 409);

  const doppelt = await db.assignment.findFirst({
    where: { organizationId: actor.organizationId, rechnungsnummer: { equals: rechnungsnummer, mode: "insensitive" }, NOT: { id: a.id } },
    select: { einsatznummer: true },
  });
  if (doppelt) throw new BesetzungError(`Rechnungsnummer ${rechnungsnummer} ist schon bei Einsatz ${doppelt.einsatznummer} eingetragen.`, 409);

  await db.assignment.update({
    where: { id: a.id },
    data: {
      abrechnung: "BERECHNET",
      rechnungsnummer,
      rechnungVon: actor.name ?? actor.id,
      rechnungAm: new Date(),
      // Ein Einsatz mit Rechnung ist abgerechnet – der operative Status zieht mit.
      status: "ABGERECHNET" as const,
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.rechnung",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, kunde: a.customer.name, rechnungsnummer, alt: a.rechnungsnummer },
  });
  return { einsatznummer: a.einsatznummer };
}

export async function nimmRechnungZurueck(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung !== "BERECHNET") throw new BesetzungError("Für diesen Einsatz ist keine Rechnung eingetragen.", 409);
  await db.assignment.update({
    where: { id: a.id },
    data: {
      abrechnung: "FREIGEGEBEN",
      rechnungsnummer: null,
      rechnungVon: null,
      rechnungAm: null,
      ...(a.status === "ABGERECHNET" ? { status: "ABGESCHLOSSEN" as const } : {}),
    },
  });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.abrechnung.rechnung_zurueck", entityType: "assignment", entityId: a.id, data: { einsatznummer: a.einsatznummer, alt: a.rechnungsnummer } });
}
