// Projekt = Sammelmappe über mehrere Einsätze.
//
// Ein Kunde bucht über Wochen fünf einzelne Jobs und will dafür *eine*
// Rechnung. Genau dafür ist das Projekt da: Angebotsnummer, Konditionen und
// Rechnungsnummer werden einmal gepflegt und auf alle Einsätze der Mappe
// durchgeschrieben.
//
// Was bewusst **nicht** ins Projekt wandert: die Stunden. Die werden weiter
// je Einsatz bestätigt und freigegeben – dort hängen Unterschriften und
// Nachweise. Der Stand des Projekts leitet sich daraus ab, statt ein zweites
// Mal gespeichert zu werden; so können die beiden nicht auseinanderlaufen.
import type { AbrechnungStatus, User } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { BesetzungError } from "./besetzung";
import { summeErgaenzungen } from "./abrechnung";

export type ProjektStand = AbrechnungStatus;

type MitgliedRoh = {
  abrechnung: AbrechnungStatus;
  ergaenzungen: Array<{ art: "BONUS" | "FAHRTKOSTEN" | "SPESEN" | "ZUSCHLAG" | "ABZUG" | "SONSTIGES"; betrag: unknown }>;
  shifts: Array<{ assignments: Array<{ status: string; timeEntries: Array<{ review: string; stundenGesamt: unknown }> }> }>;
};

export type ProjektZahlen = {
  einsaetze: number;
  stunden: number;
  ergaenzungen: number;
  // Einsätze, deren Stunden noch nicht freigegeben sind
  offeneEinsaetze: number;
};

export function zahlenFuer(mitglieder: MitgliedRoh[]): ProjektZahlen {
  let stunden = 0;
  let ergaenzungen = 0;
  let offeneEinsaetze = 0;
  for (const a of mitglieder) {
    if (a.abrechnung === "OFFEN") offeneEinsaetze++;
    ergaenzungen += summeErgaenzungen(a.ergaenzungen);
    for (const s of a.shifts)
      for (const sa of s.assignments) {
        if (sa.status === "STORNIERT") continue;
        for (const t of sa.timeEntries) if (t.review === "FREIGEGEBEN") stunden += Number(t.stundenGesamt);
      }
  }
  return {
    einsaetze: mitglieder.length,
    stunden: Math.round(stunden * 100) / 100,
    ergaenzungen: Math.round(ergaenzungen * 100) / 100,
    offeneEinsaetze,
  };
}

// Der Stand wird abgeleitet, nicht gespeichert – aus den Einsätzen und den
// beiden Marken, die am Projekt selbst hängen.
export function standVon(projekt: { angabenAm: Date | null; rechnungsnummer: string | null }, mitglieder: Array<{ abrechnung: AbrechnungStatus }>): ProjektStand {
  if (projekt.rechnungsnummer) return "BERECHNET";
  if (mitglieder.length === 0 || mitglieder.some((m) => m.abrechnung === "OFFEN")) return "OFFEN";
  return projekt.angabenAm ? "BEREIT" : "FREIGEGEBEN";
}

const MITGLIED_SELECT = {
  abrechnung: true,
  ergaenzungen: { select: { art: true, betrag: true } },
  shifts: { select: { assignments: { select: { status: true, timeEntries: { where: { aktuell: true }, select: { review: true, stundenGesamt: true } } } } } },
} as const;

async function ladeProjekt(organizationId: string, id: string) {
  const p = await db.project.findFirst({
    where: { id, organizationId },
    include: { assignments: { select: { id: true, einsatznummer: true, ...MITGLIED_SELECT } } },
  });
  if (!p) throw new BesetzungError("Projekt nicht gefunden.", 404);
  return p;
}

// ─── Anlegen und Zuordnen ───────────────────────────────────────────────────

export async function legeProjektAn(
  actor: Pick<User, "id" | "organizationId">,
  input: { name: string; assignmentIds: string[] }
): Promise<{ id: string; name: string; einsaetze: number }> {
  const einsaetze = await db.assignment.findMany({
    where: { id: { in: input.assignmentIds }, organizationId: actor.organizationId },
    select: { id: true, einsatznummer: true, customerId: true, projectId: true, abrechnung: true },
  });
  if (einsaetze.length === 0) throw new BesetzungError("Keine Einsätze ausgewählt.", 400);
  const schonDrin = einsaetze.find((e) => e.projectId);
  if (schonDrin) throw new BesetzungError(`Einsatz ${schonDrin.einsatznummer} gehört schon zu einem Projekt.`, 409);
  const berechnet = einsaetze.find((e) => e.abrechnung === "BERECHNET");
  if (berechnet) throw new BesetzungError(`Für Einsatz ${berechnet.einsatznummer} ist die Rechnung schon geschrieben.`, 409);

  // Ein Projekt gehört zu einem Kunden – nur wenn alle Einsätze denselben haben
  const kunden = new Set(einsaetze.map((e) => e.customerId));

  const projekt = await db.project.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      customerId: kunden.size === 1 ? einsaetze[0].customerId : null,
      createdById: actor.id,
      assignments: { connect: einsaetze.map((e) => ({ id: e.id })) },
    },
    select: { id: true, name: true },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "project.create",
    entityType: "project",
    entityId: projekt.id,
    data: { name: projekt.name, einsaetze: einsaetze.map((e) => e.einsatznummer) },
  });
  return { id: projekt.id, name: projekt.name, einsaetze: einsaetze.length };
}

export async function benenneProjekt(actor: Pick<User, "id" | "organizationId">, projektId: string, name: string): Promise<void> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  await db.project.update({ where: { id: p.id }, data: { name } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.rename", entityType: "project", entityId: p.id, data: { alt: p.name, neu: name } });
}

export async function nimmEinsatzAuf(actor: Pick<User, "id" | "organizationId">, projektId: string, assignmentId: string): Promise<{ einsatznummer: string }> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (p.rechnungsnummer) throw new BesetzungError("Die Rechnung des Projekts ist geschrieben – es nimmt keine Einsätze mehr auf.", 409);
  const a = await db.assignment.findFirst({ where: { id: assignmentId, organizationId: actor.organizationId }, select: { id: true, einsatznummer: true, projectId: true, abrechnung: true } });
  if (!a) throw new BesetzungError("Einsatz nicht gefunden.", 404);
  if (a.projectId === p.id) throw new BesetzungError("Dieser Einsatz ist schon im Projekt.", 409);
  if (a.projectId) throw new BesetzungError("Dieser Einsatz gehört schon zu einem anderen Projekt.", 409);
  if (a.abrechnung === "BERECHNET") throw new BesetzungError("Für diesen Einsatz ist die Rechnung schon geschrieben.", 409);

  await db.assignment.update({ where: { id: a.id }, data: { projectId: p.id } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.add", entityType: "project", entityId: p.id, data: { name: p.name, einsatznummer: a.einsatznummer } });
  return { einsatznummer: a.einsatznummer };
}

export async function loeseEinsatzHeraus(actor: Pick<User, "id" | "organizationId">, assignmentId: string): Promise<{ einsatznummer: string }> {
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, organizationId: actor.organizationId },
    select: { id: true, einsatznummer: true, projectId: true, project: { select: { name: true, rechnungsnummer: true } } },
  });
  if (!a?.projectId || !a.project) throw new BesetzungError("Dieser Einsatz gehört zu keinem Projekt.", 409);
  if (a.project.rechnungsnummer) throw new BesetzungError("Die Rechnung des Projekts ist geschrieben – erst den Vermerk entfernen.", 409);

  await db.assignment.update({ where: { id: a.id }, data: { projectId: null } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.remove", entityType: "project", entityId: a.projectId, data: { name: a.project.name, einsatznummer: a.einsatznummer } });
  return { einsatznummer: a.einsatznummer };
}

export async function loescheProjekt(actor: Pick<User, "id" | "organizationId">, projektId: string): Promise<{ name: string; einsaetze: number }> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (p.rechnungsnummer) throw new BesetzungError("Für dieses Projekt ist eine Rechnung eingetragen – erst den Vermerk entfernen.", 409);
  // Die Einsätze bleiben, sie stehen danach wieder für sich
  await db.project.delete({ where: { id: p.id } });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "project.delete",
    entityType: "project",
    entityId: p.id,
    data: { name: p.name, einsaetze: p.assignments.map((a) => a.einsatznummer) },
  });
  return { name: p.name, einsaetze: p.assignments.length };
}

// ─── Angaben und Rechnung, einmal fürs ganze Projekt ────────────────────────

export type ProjektAngaben = { angebotsnummer: string | null; konditionen: string | null; abrechnungHinweis: string | null };

export async function speichereProjektAngaben(actor: Pick<User, "id" | "organizationId">, projektId: string, input: ProjektAngaben): Promise<void> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (p.rechnungsnummer) throw new BesetzungError("Die Rechnung ist geschrieben – Angaben lassen sich nicht mehr ändern.", 409);
  await db.project.update({ where: { id: p.id }, data: input });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.angaben", entityType: "project", entityId: p.id, data: { name: p.name, nachher: input } });
}

export async function gibProjektWeiter(actor: Pick<User, "id" | "organizationId" | "name">, projektId: string, input: ProjektAngaben): Promise<{ name: string }> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (p.rechnungsnummer) throw new BesetzungError("Die Rechnung ist bereits geschrieben.", 409);
  if (!input.angebotsnummer) throw new BesetzungError("Ohne Angebotsnummer kann die Buchhaltung nicht abrechnen.", 409);
  const offen = p.assignments.filter((a) => a.abrechnung === "OFFEN");
  if (p.assignments.length === 0) throw new BesetzungError("Das Projekt enthält keine Einsätze.", 409);
  if (offen.length > 0) throw new BesetzungError(`${offen.length} Einsatz/Einsätze im Projekt haben noch offene Stunden.`, 409);

  await db.project.update({ where: { id: p.id }, data: { ...input, angabenVon: actor.name ?? actor.id, angabenAm: new Date() } });
  // Die Angaben gelten für alle Einsätze der Mappe – so steht auf jedem
  // Einsatz dasselbe wie auf der Rechnung.
  await db.assignment.updateMany({ where: { projectId: p.id }, data: { ...input, abrechnung: "BEREIT", angabenVon: actor.name ?? actor.id, angabenAm: new Date() } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.angaben_fertig", entityType: "project", entityId: p.id, data: { name: p.name, ...input, einsaetze: p.assignments.map((a) => a.einsatznummer) } });
  return { name: p.name };
}

export async function nimmProjektAngabenZurueck(actor: Pick<User, "id" | "organizationId">, projektId: string): Promise<void> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (p.rechnungsnummer) throw new BesetzungError("Erst den Rechnungsvermerk entfernen.", 409);
  if (!p.angabenAm) throw new BesetzungError("Die Angaben sind nicht an die Buchhaltung gemeldet.", 409);
  await db.project.update({ where: { id: p.id }, data: { angabenVon: null, angabenAm: null } });
  await db.assignment.updateMany({ where: { projectId: p.id, abrechnung: "BEREIT" }, data: { abrechnung: "FREIGEGEBEN", angabenVon: null, angabenAm: null } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.angaben_zurueck", entityType: "project", entityId: p.id, data: { name: p.name } });
}

export async function setzeProjektRechnung(actor: Pick<User, "id" | "organizationId" | "name">, projektId: string, rechnungsnummer: string): Promise<{ name: string; einsaetze: number }> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (!p.angabenAm) throw new BesetzungError("Es fehlen noch die Angaben zur Abrechnung (Angebotsnummer).", 409);

  // Dieselbe Nummer darf es weder bei einem anderen Projekt noch bei einem
  // Einsatz außerhalb dieses Projekts geben.
  const doppeltesProjekt = await db.project.findFirst({
    where: { organizationId: actor.organizationId, rechnungsnummer: { equals: rechnungsnummer, mode: "insensitive" }, NOT: { id: p.id } },
    select: { name: true },
  });
  if (doppeltesProjekt) throw new BesetzungError(`Rechnungsnummer ${rechnungsnummer} ist schon beim Projekt „${doppeltesProjekt.name}“ eingetragen.`, 409);
  const doppelterEinsatz = await db.assignment.findFirst({
    where: { organizationId: actor.organizationId, rechnungsnummer: { equals: rechnungsnummer, mode: "insensitive" }, NOT: { projectId: p.id } },
    select: { einsatznummer: true },
  });
  if (doppelterEinsatz) throw new BesetzungError(`Rechnungsnummer ${rechnungsnummer} ist schon bei Einsatz ${doppelterEinsatz.einsatznummer} eingetragen.`, 409);

  const jetzt = new Date();
  const von = actor.name ?? actor.id;
  await db.project.update({ where: { id: p.id }, data: { rechnungsnummer, rechnungVon: von, rechnungAm: jetzt } });
  await db.assignment.updateMany({
    where: { projectId: p.id },
    data: { abrechnung: "BERECHNET", rechnungsnummer, rechnungVon: von, rechnungAm: jetzt, status: "ABGERECHNET" },
  });
  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "project.rechnung",
    entityType: "project",
    entityId: p.id,
    data: { name: p.name, rechnungsnummer, einsaetze: p.assignments.map((a) => a.einsatznummer) },
  });
  return { name: p.name, einsaetze: p.assignments.length };
}

export async function nimmProjektRechnungZurueck(actor: Pick<User, "id" | "organizationId">, projektId: string): Promise<void> {
  const p = await ladeProjekt(actor.organizationId, projektId);
  if (!p.rechnungsnummer) throw new BesetzungError("Für dieses Projekt ist keine Rechnung eingetragen.", 409);
  await db.project.update({ where: { id: p.id }, data: { rechnungsnummer: null, rechnungVon: null, rechnungAm: null } });
  await db.assignment.updateMany({
    where: { projectId: p.id },
    data: { abrechnung: "BEREIT", rechnungsnummer: null, rechnungVon: null, rechnungAm: null, status: "ABGESCHLOSSEN" },
  });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "project.rechnung_zurueck", entityType: "project", entityId: p.id, data: { name: p.name, alt: p.rechnungsnummer } });
}
