// Weg eines Einsatzes zur Rechnung, in drei Handgriffen:
//
//   OFFEN ──[1 Buchhaltung: Stunden bestätigen]──▶ FREIGEGEBEN
//         ──[2 Admin: Angaben zur Abrechnung]────▶ BEREIT
//         ──[3 Buchhaltung: Rechnung]────────────▶ BERECHNET
//
// Station 1 gehört der Buchhaltung: sie bestätigt die Stunden und nimmt auf,
// was sonst noch auf die Abrechnung geht (Bonus, Fahrtkosten, Abzüge …).
// Station 2 gehört dem Admin: Angebotsnummer, Konditionen, Beschreibung.
// Station 3 wieder der Buchhaltung: Rechnungsnummer eintragen.
// Der Admin darf jeden Schritt selbst gehen.
//
// Bewusst getrennt vom operativen Status des Einsatzes (wie weit ist die
// Arbeit) und von der Freigabe einzelner Zeiteinträge (stimmen die Stunden).
import type { AbrechnungStatus, ErgaenzungArt, User } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BesetzungError } from "./besetzung";

export const ABRECHNUNG_LABELS: Record<AbrechnungStatus, string> = {
  OFFEN: "Stunden prüfen",
  FREIGEGEBEN: "Stunden freigegeben",
  BEREIT: "Rechnung offen",
  BERECHNET: "Rechnung geschrieben",
};

export const ABRECHNUNG_KURZ: Record<AbrechnungStatus, string> = {
  OFFEN: "Stunden offen",
  FREIGEGEBEN: "Stunden freigegeben",
  BEREIT: "Rechnung offen",
  BERECHNET: "Rechnung geschrieben",
};

// Wer ist als Nächstes dran – steht so in der Übersicht
export const ABRECHNUNG_WER: Record<AbrechnungStatus, string> = {
  OFFEN: "Buchhaltung: Stunden bestätigen und freigeben",
  FREIGEGEBEN: "Admin: Angaben zur Abrechnung ergänzen",
  BEREIT: "Buchhaltung: Rechnung schreiben",
  BERECHNET: "erledigt",
};

export const ERGAENZUNG_LABELS: Record<ErgaenzungArt, string> = {
  BONUS: "Bonus",
  FAHRTKOSTEN: "Fahrtkosten",
  SPESEN: "Spesen",
  ZUSCHLAG: "Zuschlag",
  ABZUG: "Abzug",
  SONSTIGES: "Sonstiges",
};

// Der Betrag wird immer positiv erfasst; das Vorzeichen steckt in der Art.
export function vorzeichen(art: ErgaenzungArt): 1 | -1 {
  return art === "ABZUG" ? -1 : 1;
}

export function summeErgaenzungen(list: Array<{ art: ErgaenzungArt; betrag: unknown }>): number {
  return Math.round(list.reduce((n, e) => n + vorzeichen(e.art) * Number(e.betrag), 0) * 100) / 100;
}

export type Voraussetzungen = {
  moeglich: boolean;
  // was noch fehlt, in Klartext – wird so angezeigt
  offen: string[];
  stunden: number;
  personen: number;
  offeneZeiten: number;
  // unterschrieben, aber noch nicht freigegeben: das erledigt „Stunden bestätigen"
  bestaetigbar: number;
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
  const bestaetigbar = eintraege.filter((t) => t.review !== "FREIGEGEBEN" && t.unterschriftZeitpunkt).length;
  const stundennachweis = a.documentLinks.some((l) => l.document.category === "stundennachweis");

  const offen: string[] = [];
  if (eintraege.length === 0) offen.push("Es sind noch keine Zeiten erfasst.");
  else if (offeneZeiten > 0 && bestaetigbar === offeneZeiten) offen.push(`${offeneZeiten} unterschriebene Zeit(en) noch nicht bestätigt – auf „Stunden bestätigen“ tippen.`);
  else if (offeneZeiten > 0) offen.push(`${offeneZeiten} Zeiteintrag/-einträge sind offen, davon ${offeneZeiten - bestaetigbar} ohne Unterschrift.`);
  if (!stundennachweis) offen.push("Es gibt noch keinen Stundennachweis als PDF.");

  return {
    // Der Stundennachweis ist ein Hinweis, kein Riegel – die Stunden sind es.
    moeglich: freigegeben.length > 0 && offeneZeiten === 0,
    offen,
    stunden: Math.round(freigegeben.reduce((n, t) => n + Number(t.stundenGesamt), 0) * 100) / 100,
    personen: new Set(a.shifts.flatMap((s) => s.assignments.filter((sa) => sa.status !== "STORNIERT").map((sa) => sa.employeeId))).size,
    offeneZeiten,
    bestaetigbar,
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

// ─── Station 1: Ergänzungen der Buchhaltung ─────────────────────────────────

export type ErgaenzungEingabe = { art: ErgaenzungArt; betrag: number; employeeId: string | null; bemerkung: string | null };

export async function ergaenzungHinzufuegen(actor: Pick<User, "id" | "organizationId">, assignmentId: string, input: ErgaenzungEingabe): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Die Rechnung ist geschrieben – Ergänzungen lassen sich nicht mehr ändern.", 409);
  if (input.employeeId) {
    const person = await db.employee.findFirst({ where: { id: input.employeeId, organizationId: actor.organizationId }, select: { id: true } });
    if (!person) throw new BesetzungError("Person nicht gefunden.", 404);
  }
  const e = await db.assignmentAdjustment.create({
    data: {
      organizationId: actor.organizationId,
      assignmentId: a.id,
      employeeId: input.employeeId,
      art: input.art,
      betrag: input.betrag,
      bemerkung: input.bemerkung,
      createdById: actor.id,
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.ergaenzung",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, ergaenzungId: e.id, art: input.art, betrag: input.betrag, employeeId: input.employeeId, bemerkung: input.bemerkung },
  });
}

export async function ergaenzungLoeschen(actor: Pick<User, "id" | "organizationId">, ergaenzungId: string): Promise<{ assignmentId: string }> {
  const e = await db.assignmentAdjustment.findFirst({
    where: { id: ergaenzungId, organizationId: actor.organizationId },
    include: { assignment: { select: { id: true, einsatznummer: true, abrechnung: true } } },
  });
  if (!e) throw new BesetzungError("Ergänzung nicht gefunden.", 404);
  if (e.assignment.abrechnung === "BERECHNET") throw new BesetzungError("Die Rechnung ist geschrieben – Ergänzungen lassen sich nicht mehr ändern.", 409);
  await db.assignmentAdjustment.delete({ where: { id: e.id } });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.ergaenzung_weg",
    entityType: "assignment",
    entityId: e.assignment.id,
    data: { einsatznummer: e.assignment.einsatznummer, art: e.art, betrag: Number(e.betrag), bemerkung: e.bemerkung },
  });
  return { assignmentId: e.assignment.id };
}

// ─── Station 1: Freigabe durch die Buchhaltung ──────────────────────────────

export async function gibFuerAbrechnungFrei(actor: Pick<User, "id" | "organizationId" | "name">, assignmentId: string): Promise<{ einsatznummer: string; stunden: number }> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung !== "OFFEN") throw new BesetzungError("Die Stunden dieses Einsatzes sind schon freigegeben.", 409);

  const pruefung = pruefeAbrechnungsfreigabe(a);
  if (!pruefung.moeglich) throw new BesetzungError(pruefung.offen[0] ?? "Freigabe noch nicht möglich.", 409);

  await db.assignment.update({
    where: { id: a.id },
    data: {
      abrechnung: "FREIGEGEBEN",
      freigabeVon: actor.name ?? actor.id,
      freigabeAm: new Date(),
      // Wer die Stunden freigibt, hat den Einsatz hinter sich – der operative
      // Status zieht mit, damit die Liste nicht auseinanderläuft.
      ...(a.status === "ABGESCHLOSSEN" || a.status === "ABGERECHNET" ? {} : { status: "ABGESCHLOSSEN" as const }),
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.freigabe",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, kunde: a.customer.name, stunden: pruefung.stunden },
  });
  return { einsatznummer: a.einsatznummer, stunden: pruefung.stunden };
}

export async function nimmFreigabeZurueck(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "OFFEN") throw new BesetzungError("Die Stunden sind noch nicht freigegeben.", 409);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Erst den Rechnungsvermerk entfernen.", 409);
  await db.assignment.update({ where: { id: a.id }, data: { abrechnung: "OFFEN", freigabeVon: null, freigabeAm: null, angabenVon: null, angabenAm: null } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.abrechnung.freigabe_zurueck", entityType: "assignment", entityId: a.id, data: { einsatznummer: a.einsatznummer } });
}

// ─── Station 2: Angaben des Admins ──────────────────────────────────────────

export type AbrechnungsAngaben = { angebotsnummer: string | null; konditionen: string | null; abrechnungHinweis: string | null };

// Zwischenspeichern ändert den Stand nicht – erst „an die Buchhaltung“ meldet,
// dass die Angaben vollständig sind.
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

export async function gibAngabenWeiter(actor: Pick<User, "id" | "organizationId" | "name">, assignmentId: string, input: AbrechnungsAngaben): Promise<{ einsatznummer: string }> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "OFFEN") throw new BesetzungError("Erst muss die Buchhaltung die Stunden freigeben.", 409);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Die Rechnung ist bereits geschrieben.", 409);
  if (!input.angebotsnummer) throw new BesetzungError("Ohne Angebotsnummer kann die Buchhaltung nicht abrechnen.", 409);

  await db.assignment.update({
    where: { id: a.id },
    data: { ...input, abrechnung: "BEREIT", angabenVon: actor.name ?? actor.id, angabenAm: new Date() },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "assignment.abrechnung.angaben_fertig",
    entityType: "assignment",
    entityId: a.id,
    data: { einsatznummer: a.einsatznummer, kunde: a.customer.name, ...input },
  });
  return { einsatznummer: a.einsatznummer };
}

export async function nimmAngabenZurueck(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung !== "BEREIT") throw new BesetzungError("Die Angaben sind nicht an die Buchhaltung gemeldet.", 409);
  await db.assignment.update({ where: { id: a.id }, data: { abrechnung: "FREIGEGEBEN", angabenVon: null, angabenAm: null } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.abrechnung.angaben_zurueck", entityType: "assignment", entityId: a.id, data: { einsatznummer: a.einsatznummer } });
}

// ─── Station 3: Rechnung durch die Buchhaltung ──────────────────────────────

export async function setzeRechnung(actor: Pick<User, "id" | "organizationId" | "name">, assignmentId: string, rechnungsnummer: string): Promise<{ einsatznummer: string }> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung === "OFFEN") throw new BesetzungError("Erst muss die Buchhaltung die Stunden freigeben.", 409);
  if (a.abrechnung === "FREIGEGEBEN") throw new BesetzungError("Es fehlen noch die Angaben zur Abrechnung (Angebotsnummer).", 409);

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
    data: { einsatznummer: a.einsatznummer, kunde: a.customer.name, rechnungsnummer, alt: a.rechnungsnummer, angebotsnummer: a.angebotsnummer },
  });
  return { einsatznummer: a.einsatznummer };
}

export async function nimmRechnungZurueck(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<void> {
  const a = await ladeEinsatz(actor.organizationId, assignmentId);
  if (a.abrechnung !== "BERECHNET") throw new BesetzungError("Für diesen Einsatz ist keine Rechnung eingetragen.", 409);
  await db.assignment.update({
    where: { id: a.id },
    data: {
      abrechnung: "BEREIT",
      rechnungsnummer: null,
      rechnungVon: null,
      rechnungAm: null,
      ...(a.status === "ABGERECHNET" ? { status: "ABGESCHLOSSEN" as const } : {}),
    },
  });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.abrechnung.rechnung_zurueck", entityType: "assignment", entityId: a.id, data: { einsatznummer: a.einsatznummer, alt: a.rechnungsnummer } });
}
