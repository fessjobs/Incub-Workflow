// Monatszettel: Links je Person und Kunde, Entwurf der Tage, Unterschrift der Person (daraus entstehen unter einem
// Einsatz „Monatszettel <Monat>“ Schichten, Einteilungen und Zeiteinträge wie bei jedem anderen Einsatz), Bestätigung
// des Kunden und das PDF in der Dokumentenablage (Kategorie „stundennachweis“).
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { decodeSignatureDataUrl, getBlob, putBlob } from "../blob";
import { safeFilename, storeDocument } from "../documents";
import { netHours } from "../hours";
import { appBaseUrl } from "../mail";
import { nextEinsatznummer } from "../numbering";
import { nameKey, teileEingabe } from "./besetzung";
import {
  TageSchema, datumAnzeige, eintragMinuten, eintragNotiz, endeDatum, formatStunden, kannAbschliessen, monatErsterTag, monatLetzterTag, monatsName, schichtBezeichnung, sortiert, stundenDezimal, summe, vollerName, zettelNamen, zettelStand,
  type KundeStatus, type MonatsEintrag, type ZettelStand,
} from "../monatszettel";
import { berlinDateKey, berlinTime, formatKeyDE, fromBerlin, keyToDateOnly, nowBerlinKey } from "../tz";
import { renderMonatsstundenzettel, type MonatsPdfZeile } from "../pdf/monatsstundenzettel";
import { assertMonthOpen, TimeEntryError, type RequestMeta } from "./time-entries";

// Wie lange ein Link nach Monatsende gültig bleibt
export const LINK_TAGE_NACH_MONATSENDE = 60;

export class MonatsError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

type Actor = { id: string; organizationId: string };

function ablauf(monat: string): Date {
  return new Date(fromBerlin(monatLetzterTag(monat), "23:59").getTime() + LINK_TAGE_NACH_MONATSENDE * 86400000);
}

export function leseTage(json: Prisma.JsonValue): MonatsEintrag[] {
  const r = TageSchema.safeParse(json);
  return r.success ? r.data : [];
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export type ZettelZeile = {
  id: string;
  token: string;
  // Leer bei Links ohne vorab gewählte Person, solange sich niemand eingetragen hat
  employeeId: string | null;
  // Die Person trägt ihren Namen selbst ein
  nameOffen: boolean;
  name: string;
  personalnummer: string | null;
  mobil: string | null;
  vorname: string;
  stand: ZettelStand;
  tage: number;
  stunden: number;
  km: number;
  linkSentAt: Date | null;
  personSignedAt: Date | null;
  kundeStatus: KundeStatus;
  kundeHinweis: string | null;
};

export type StapelAnsicht = {
  batch: { id: string; token: string; kontakt: string | null; assignmentId: string | null; einsatznummer: string | null; customerId: string; monat: string } | null;
  zettel: ZettelZeile[];
};

// Wurde der Monatseinsatz gelöscht (das geht nur über die Einsatzverwaltung, mit Bestätigung), sind auch seine Zeiten und
// PDFs weg. Die Zettel gelten dann wieder als nicht unterschrieben, damit sie sich neu ausfüllen und unterschreiben lassen.
async function heileVerwaiste(batchId: string): Promise<void> {
  await db.monthSheet.updateMany({
    where: { batchId, batch: { assignmentId: null }, OR: [{ personSignedAt: { not: null } }, { kundeStatus: { not: "OFFEN" } }] },
    data: { personSignedAt: null, personSignatureUrl: null, kundeStatus: "OFFEN", kundeAm: null, kundeName: null, kundeSignatureUrl: null, kundeHinweis: null },
  });
}

export async function ladeStapel(orgId: string, customerId: string, monat: string): Promise<StapelAnsicht> {
  const vorab = await db.monthBatch.findUnique({ where: { organizationId_customerId_monat: { organizationId: orgId, customerId, monat } }, select: { id: true, assignmentId: true } });
  if (vorab && !vorab.assignmentId) await heileVerwaiste(vorab.id);
  const batch = await db.monthBatch.findUnique({
    where: { organizationId_customerId_monat: { organizationId: orgId, customerId, monat } },
    include: { assignment: { select: { einsatznummer: true } }, sheets: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!batch) return { batch: null, zettel: [] };
  return {
    batch: { id: batch.id, token: batch.token, kontakt: batch.kontakt, assignmentId: batch.assignmentId, einsatznummer: batch.assignment?.einsatznummer ?? null, customerId, monat },
    zettel: batch.sheets.map((s) => {
      const tage = leseTage(s.tage);
      const su = summe(tage);
      const namen = zettelNamen(s);
      return {
        id: s.id,
        token: s.token,
        employeeId: s.employeeId,
        nameOffen: s.nameOffen,
        name: vollerName(namen),
        personalnummer: s.employee?.personalnummer ?? null,
        mobil: s.employee?.mobil ?? null,
        vorname: namen.vorname,
        stand: zettelStand({ anzahlTage: tage.length, personSigniert: s.personSignedAt !== null, kundeStatus: s.kundeStatus }),
        tage: su.tage,
        stunden: su.stunden,
        km: su.km,
        linkSentAt: s.linkSentAt,
        personSignedAt: s.personSignedAt,
        kundeStatus: s.kundeStatus,
        kundeHinweis: s.kundeHinweis,
      };
    }),
  };
}

// Legt (falls nötig) den Kundenlink für den Monat an und je Person einen eigenen Link. Mit `ohneNamen` entstehen Links, die
// keiner Person gehören: Wer so einen Link bekommt, trägt seinen Namen selbst ein.
export const MAX_LINKS_OHNE_NAMEN = 50;

export async function erstelleLinks(
  actor: Actor,
  input: { customerId: string; monat: string; employeeIds: string[]; ohneNamen?: number }
): Promise<{ neu: number; vorhanden: number; ohneNamen: number }> {
  const ohneNamen = Math.max(0, Math.min(MAX_LINKS_OHNE_NAMEN, Math.floor(input.ohneNamen ?? 0)));
  const customer = await db.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId }, select: { id: true } });
  if (!customer) throw new MonatsError("Kunde nicht gefunden.", 404);
  const employees = await db.employee.findMany({ where: { id: { in: input.employeeIds }, organizationId: actor.organizationId }, select: { id: true } });
  if (employees.length === 0 && ohneNamen === 0) throw new MonatsError("Bitte mindestens eine Person auswählen oder Links ohne Namen anlegen.");
  const batch =
    (await db.monthBatch.findUnique({ where: { organizationId_customerId_monat: { organizationId: actor.organizationId, customerId: customer.id, monat: input.monat } } })) ??
    (await db.monthBatch.create({ data: { organizationId: actor.organizationId, customerId: customer.id, monat: input.monat, tokenExpiresAt: ablauf(input.monat), createdById: actor.id } }));
  const schon = new Set((await db.monthSheet.findMany({ where: { batchId: batch.id }, select: { employeeId: true } })).map((s) => s.employeeId));
  const neu = employees.filter((e) => !schon.has(e.id));
  const daten = [
    ...neu.map((e) => ({ organizationId: actor.organizationId, batchId: batch.id, employeeId: e.id, tokenExpiresAt: ablauf(input.monat), createdById: actor.id })),
    ...Array.from({ length: ohneNamen }, () => ({ organizationId: actor.organizationId, batchId: batch.id, employeeId: null, nameOffen: true, tokenExpiresAt: ablauf(input.monat), createdById: actor.id })),
  ];
  if (daten.length > 0) await db.monthSheet.createMany({ data: daten });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "monatszettel.links", entityType: "month_batch", entityId: batch.id, data: { monat: input.monat, neu: neu.length, vorhanden: schon.size, ohneNamen } });
  return { neu: neu.length, vorhanden: employees.length - neu.length, ohneNamen };
}

export async function setzeKontakt(actor: Actor, batchId: string, kontakt: string): Promise<void> {
  const r = await db.monthBatch.updateMany({ where: { id: batchId, organizationId: actor.organizationId }, data: { kontakt: kontakt.trim().slice(0, 150) || null } });
  if (r.count === 0) throw new MonatsError("Nicht gefunden.", 404);
}

export async function markiereGesendet(actor: Actor, sheetId: string): Promise<void> {
  await db.monthSheet.updateMany({ where: { id: sheetId, organizationId: actor.organizationId, linkSentAt: null }, data: { linkSentAt: new Date() } });
}

// Ein Link ohne Einträge und ohne Unterschrift lässt sich wieder entfernen (z. B. falsche Person gewählt)
export async function entferneLeerenZettel(actor: Actor, sheetId: string): Promise<void> {
  const s = await db.monthSheet.findFirst({ where: { id: sheetId, organizationId: actor.organizationId } });
  if (!s) throw new MonatsError("Nicht gefunden.", 404);
  if (s.personSignedAt || leseTage(s.tage).length > 0) throw new MonatsError("Der Zettel enthält schon Einträge und lässt sich nicht mehr entfernen.", 409);
  await db.monthSheet.delete({ where: { id: s.id } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "monatszettel.entfernt", entityType: "month_sheet", entityId: s.id, data: { employeeId: s.employeeId } });
}

export async function ladeZettel(orgId: string, sheetId: string) {
  return db.monthSheet.findFirst({ where: { id: sheetId, organizationId: orgId }, include: { employee: true, batch: { include: { customer: true, assignment: { select: { id: true, einsatznummer: true } } } } } });
}

// ─── Sperren ────────────────────────────────────────────────────────────────

type SheetMitStapel = Prisma.MonthSheetGetPayload<{ include: { employee: true; batch: { include: { customer: true } } } }>;

async function freigegebeneZeiten(sheet: { tage: Prisma.JsonValue }): Promise<number> {
  const ids = leseTage(sheet.tage).map((t) => t.saId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return 0;
  return db.timeEntry.count({ where: { shiftAssignmentId: { in: ids }, aktuell: true, review: "FREIGEGEBEN" } });
}

// Warum lässt sich der Zettel nicht (mehr) ändern? null = änderbar
export async function sperrgrund(sheet: SheetMitStapel): Promise<string | null> {
  if (sheet.kundeStatus === "BESTAETIGT") return "Der Kunde hat bestätigt – Änderungen bitte über die Dispo.";
  if (sheet.tokenExpiresAt < new Date()) return "Dieser Link ist abgelaufen. Bitte melde dich bei der Dispo.";
  if ((await freigegebeneZeiten(sheet)) > 0) return "Diese Stunden sind schon freigegeben – Änderungen bitte über die Dispo.";
  return null;
}

// ─── Person ─────────────────────────────────────────────────────────────────

export async function ladeZettelPerToken(token: string): Promise<SheetMitStapel | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const abfrage = () => db.monthSheet.findUnique({ where: { token }, include: { employee: true, batch: { include: { customer: true } } } });
  const sheet = await abfrage();
  if (sheet && !sheet.batch.assignmentId && (sheet.personSignedAt || sheet.kundeStatus !== "OFFEN")) {
    await heileVerwaiste(sheet.batchId);
    return abfrage();
  }
  return sheet;
}

export type PersonAnsicht = {
  person: { vorname: string; nachname: string };
  // Die Person trägt ihren Namen selbst ein; ändern lässt er sich, solange sie nicht unterschrieben hat und der Kunde nicht bestätigt hat
  nameOffen: boolean;
  nameAenderbar: boolean;
  kunde: string;
  monat: string;
  monatLabel: string;
  heute: string;
  tage: MonatsEintrag[];
  stand: ZettelStand;
  personSigniert: boolean;
  kundeHinweis: string | null;
  kundeName: string | null;
  gesperrt: string | null;
  pdf: boolean;
};

export async function personAnsicht(sheet: SheetMitStapel): Promise<PersonAnsicht> {
  const tage = leseTage(sheet.tage);
  const gesperrt = await sperrgrund(sheet);
  return {
    person: zettelNamen(sheet),
    nameOffen: sheet.nameOffen,
    nameAenderbar: sheet.nameOffen && sheet.personSignedAt === null && gesperrt === null,
    kunde: sheet.batch.customer.name,
    monat: sheet.batch.monat,
    monatLabel: monatsName(sheet.batch.monat),
    heute: nowBerlinKey(),
    // Die Saat-IDs der Einteilungen gehören dem Server
    tage: tage.map((t) => ({ ...t, saId: undefined })),
    stand: zettelStand({ anzahlTage: tage.length, personSigniert: sheet.personSignedAt !== null, kundeStatus: sheet.kundeStatus }),
    personSigniert: sheet.personSignedAt !== null,
    kundeHinweis: sheet.kundeStatus === "ZURUECK" ? sheet.kundeHinweis : null,
    kundeName: sheet.kundeStatus === "BESTAETIGT" ? sheet.kundeName : null,
    gesperrt,
    pdf: sheet.kundeStatus === "BESTAETIGT",
  };
}

function pruefeTage(monat: string, roh: unknown): MonatsEintrag[] {
  const r = TageSchema.safeParse(roh);
  if (!r.success) throw new MonatsError(r.error.errors[0]?.message ?? "Ungültige Daten.");
  const heute = nowBerlinKey();
  for (const e of r.data) {
    if (!e.datum.startsWith(`${monat}-`)) throw new MonatsError("Ein Eintrag liegt nicht in diesem Monat.");
    if (e.datum > heute) throw new MonatsError("Tage in der Zukunft lassen sich nicht eintragen.");
  }
  if (new Set(r.data.map((e) => e.id)).size !== r.data.length) throw new MonatsError("Doppelte Einträge.");
  return r.data;
}

export async function speichereEntwurf(token: string, roh: unknown): Promise<void> {
  const sheet = await ladeZettelPerToken(token);
  if (!sheet) throw new MonatsError("Link ungültig.", 404);
  if (sheet.personSignedAt) throw new MonatsError("Du hast schon unterschrieben. Zum Ändern bitte erst „Doch noch etwas ändern“ wählen.", 409);
  const grund = await sperrgrund(sheet);
  if (grund) throw new MonatsError(grund, 409);
  const tage = pruefeTage(sheet.batch.monat, roh);
  // Die Zuordnung zu den Einteilungen bleibt erhalten
  const alt = new Map(leseTage(sheet.tage).map((t) => [t.id, t.saId]));
  const neu = tage.map((t) => ({ ...t, saId: alt.get(t.id) }));
  await db.monthSheet.update({ where: { id: sheet.id }, data: { tage: neu as unknown as Prisma.InputJsonValue } });
}

// Der Name, den die Person im Link einträgt (nur bei Links ohne vorab gewählte Person). Vor- und Nachname sind nötig, weil
// der Name später auf dem Zettel und im Mitarbeiterstamm steht.
const NamenSchema = z.object({
  vorname: z.string().trim().min(2, "Vorname fehlt.").max(80, "Der Vorname ist zu lang."),
  nachname: z.string().trim().min(2, "Nachname fehlt.").max(80, "Der Nachname ist zu lang."),
});

type NamensMeta = { ip: string | null };

// Gibt es im Stamm schon jemanden mit diesem Namen? (Schreibweise und Reihenfolge egal)
async function findePerson(client: Prisma.TransactionClient | typeof db, orgId: string, vorname: string, nachname: string): Promise<{ id: string } | null> {
  const exakt = await client.employee.findFirst({
    where: { organizationId: orgId, vorname: { equals: vorname, mode: "insensitive" }, nachname: { equals: nachname, mode: "insensitive" } },
    select: { id: true },
  });
  if (exakt) return exakt;
  const key = nameKey(vorname, nachname);
  const alle = await client.employee.findMany({ where: { organizationId: orgId, status: "AKTIV" }, select: { id: true, vorname: true, nachname: true } });
  return alle.find((e) => nameKey(e.vorname, e.nachname) === key) ?? null;
}

const DOPPELT = (name: string) => `Für ${name} gibt es in diesem Monat schon einen Zettel. Bitte melde dich bei der Dispo, wenn du das bist.`;

export async function speichereName(token: string, roh: unknown, meta: NamensMeta): Promise<void> {
  const sheet = await ladeZettelPerToken(token);
  if (!sheet) throw new MonatsError("Link ungültig.", 404);
  if (!sheet.nameOffen) throw new MonatsError("Dein Name ist bei der Dispo hinterlegt. Wenn er nicht stimmt, melde dich bitte dort.", 403);
  // Zuerst die harten Sperren (Kunde hat bestätigt, abgelaufen, freigegeben), dann der Hinweis, erst wieder zu öffnen
  const grund = await sperrgrund(sheet);
  if (grund) throw new MonatsError(grund, 409);
  if (sheet.personSignedAt) throw new MonatsError("Du hast schon unterschrieben. Zum Ändern bitte erst „Doch noch etwas ändern“ wählen.", 409);
  const p = NamenSchema.safeParse(roh);
  if (!p.success) throw new MonatsError(p.error.errors[0]?.message ?? "Bitte Vor- und Nachnamen eintragen.");
  const { vorname, nachname } = teileEingabe(p.data.vorname, p.data.nachname);
  const orgId = sheet.organizationId;

  // Zwei Zettel desselben Monats dürfen nicht dieselbe Person meinen
  const key = nameKey(vorname, nachname);
  const ziel = await findePerson(db, orgId, vorname, nachname);
  const andere = await db.monthSheet.findMany({ where: { batchId: sheet.batchId, NOT: { id: sheet.id } }, include: { employee: true } });
  const doppelt = andere.some((o) => {
    if (ziel && o.employeeId === ziel.id) return true;
    const n = zettelNamen(o);
    return Boolean(n.vorname) && nameKey(n.vorname, n.nachname) === key;
  });
  if (doppelt) throw new MonatsError(DOPPELT(`${vorname} ${nachname}`), 409);

  const alt = zettelNamen(sheet);
  // Entspricht der Name dem im Stamm, gibt es nichts Offenes zu übertragen
  const imStamm = sheet.employee && sheet.employee.vorname === vorname && sheet.employee.nachname === nachname;
  await db.monthSheet.update({ where: { id: sheet.id }, data: imStamm ? { vorname: null, nachname: null } : { vorname, nachname } });
  await logAudit({
    organizationId: orgId,
    action: "monatszettel.name_gesetzt",
    entityType: "month_sheet",
    entityId: sheet.id,
    data: { alt: vollerName(alt) || null, neu: `${vorname} ${nachname}`, ip: meta.ip, quelle: "monats-link" },
  });
}

// Die Person nimmt ihre Unterschrift zurück, solange der Kunde nicht bestätigt hat und nichts freigegeben ist
export async function oeffneWieder(token: string): Promise<void> {
  const sheet = await ladeZettelPerToken(token);
  if (!sheet) throw new MonatsError("Link ungültig.", 404);
  const grund = await sperrgrund(sheet);
  if (grund) throw new MonatsError(grund, 409);
  if (!sheet.personSignedAt) return;
  await db.monthSheet.update({ where: { id: sheet.id }, data: { personSignedAt: null } });
  await logAudit({ organizationId: sheet.organizationId, action: "monatszettel.wieder_geoeffnet", entityType: "month_sheet", entityId: sheet.id, data: { employeeId: sheet.employeeId } });
}

async function sperreStapel(tx: Prisma.TransactionClient, batchId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM month_batches WHERE id = ${batchId} FOR UPDATE`;
}

// Ein Datensatz, der nur durch diesen Zettel entstanden ist (keine Stammdaten, keine Einteilungen außerhalb des Monatseinsatzes,
// kein anderer Zettel), darf umbenannt werden. Sonst bekommt die Person mit dem neuen Namen einen eigenen Datensatz.
async function istNurFuerDiesenZettel(tx: Prisma.TransactionClient, employeeId: string, sheetId: string, assignmentId: string): Promise<boolean> {
  const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { personalnummer: true, email: true, mobil: true, geburtsdatum: true } });
  if (!e || e.personalnummer || e.email || e.mobil || e.geburtsdatum) return false;
  const fremde = await tx.shiftAssignment.count({ where: { employeeId, shift: { assignmentId: { not: assignmentId } } } });
  if (fremde > 0) return false;
  return (await tx.monthSheet.count({ where: { employeeId, NOT: { id: sheetId } } })) === 0;
}

type PersonErgebnis = { employeeId: string; verwaist: string | null };

async function bestimmePerson(tx: Prisma.TransactionClient, sheet: SheetMitStapel, gewuenscht: { vorname: string; nachname: string }, assignmentId: string): Promise<PersonErgebnis> {
  const orgId = sheet.organizationId;
  // Vorab gewählte Person: der Name ist Sache der Dispo
  if (!sheet.nameOffen) {
    if (!sheet.employeeId) throw new MonatsError("Diesem Zettel ist keine Person zugeordnet. Bitte melde dich bei der Dispo.", 409);
    return { employeeId: sheet.employeeId, verwaist: null };
  }
  const { vorname, nachname } = gewuenscht;
  const aktuell = sheet.employee;
  if (aktuell && aktuell.vorname === vorname && aktuell.nachname === nachname) return { employeeId: aktuell.id, verwaist: null };

  const ziel = await findePerson(tx, orgId, vorname, nachname);
  if (ziel && ziel.id !== aktuell?.id) {
    const belegt = await tx.monthSheet.findFirst({ where: { batchId: sheet.batchId, employeeId: ziel.id, NOT: { id: sheet.id } }, select: { id: true } });
    if (belegt) throw new MonatsError(DOPPELT(`${vorname} ${nachname}`), 409);
  }

  let employeeId: string;
  let verwaist: string | null = null;
  let weg: "angelegt" | "zugeordnet" | "umbenannt";
  if (!aktuell) {
    if (ziel) {
      employeeId = ziel.id;
      weg = "zugeordnet";
    } else {
      employeeId = (await tx.employee.create({ data: { organizationId: orgId, vorname, nachname } })).id;
      weg = "angelegt";
    }
  } else if (ziel && ziel.id === aktuell.id) {
    // Nur die Schreibweise (Groß-/Kleinschreibung) unterscheidet sich vom Stamm: dort bleibt es, wie die Dispo es führt
    return { employeeId: aktuell.id, verwaist: null };
  } else {
    const nurDieser = await istNurFuerDiesenZettel(tx, aktuell.id, sheet.id, assignmentId);
    if (!ziel && nurDieser) {
      await tx.employee.update({ where: { id: aktuell.id }, data: { vorname, nachname } });
      employeeId = aktuell.id;
      weg = "umbenannt";
    } else {
      employeeId = ziel ? ziel.id : (await tx.employee.create({ data: { organizationId: orgId, vorname, nachname } })).id;
      weg = ziel ? "zugeordnet" : "angelegt";
      // Die bereits entstandenen Einteilungen im Monatseinsatz wechseln mit
      await tx.shiftAssignment.updateMany({ where: { employeeId: aktuell.id, shift: { assignmentId } }, data: { employeeId } });
      if (nurDieser) verwaist = aktuell.id;
    }
  }
  await tx.auditLog.create({
    data: {
      organizationId: orgId,
      action: "monatszettel.person_bestimmt",
      entityType: "month_sheet",
      entityId: sheet.id,
      data: { alt: aktuell ? `${aktuell.vorname} ${aktuell.nachname}` : null, neu: `${vorname} ${nachname}`, weg, employeeId } as Prisma.InputJsonValue,
    },
  });
  return { employeeId, verwaist };
}

// Unterschrift der Person: erst jetzt entstehen die Zeiteinträge im Einsatzmodul
export async function unterschreibe(token: string, roh: unknown, unterschrift: string, meta: RequestMeta): Promise<{ einsatznummer: string }> {
  const sheet = await ladeZettelPerToken(token);
  if (!sheet) throw new MonatsError("Link ungültig.", 404);
  const grund = await sperrgrund(sheet);
  if (grund) throw new MonatsError(grund, 409);
  const orgId = sheet.organizationId;
  const monat = sheet.batch.monat;
  const gewuenscht = zettelNamen(sheet);
  if (sheet.nameOffen && (!gewuenscht.vorname || !gewuenscht.nachname)) throw new MonatsError("Bitte trage zuerst deinen Vor- und Nachnamen ein und speichere ihn.");
  const tage = sortiert(pruefeTage(monat, roh));
  const abschluss = kannAbschliessen(monat, tage);
  if (!abschluss.ok) throw new MonatsError(abschluss.gruende[0]);
  try {
    await assertMonthOpen(orgId, fromBerlin(monatErsterTag(monat), "12:00"));
  } catch (err) {
    if (err instanceof TimeEntryError) throw new MonatsError(err.message, err.status);
    throw err;
  }
  let png: Buffer;
  try {
    png = decodeSignatureDataUrl(unterschrift);
  } catch (err) {
    throw new MonatsError(err instanceof Error ? err.message : "Unterschrift ungültig.");
  }
  const blob = await putBlob(orgId, "unterschriften", png, "image/png");
  const jetzt = new Date();
  const alteIds = new Set(leseTage(sheet.tage).map((t) => t.saId).filter((x): x is string => Boolean(x)));
  const customer = sheet.batch.customer;

  const ergebnis = await db.$transaction(async (tx) => {
    await sperreStapel(tx, sheet.batch.id);
    const frisch = await tx.monthBatch.findUniqueOrThrow({ where: { id: sheet.batch.id }, include: { assignment: true } });
    let assignment = frisch.assignment;
    if (!assignment) {
      const nr = await nextEinsatznummer(orgId, monatErsterTag(monat), tx);
      assignment = await tx.assignment.create({
        data: {
          organizationId: orgId,
          customerId: customer.id,
          projekt: `Monatszettel ${monatsName(monat)}`,
          einsatzort: customer.standardEinsatzort ?? customer.adresse ?? customer.name,
          bundesland: customer.bundesland ?? null,
          datumVon: keyToDateOnly(monatErsterTag(monat)),
          datumBis: keyToDateOnly(monatLetzterTag(monat)),
          einsatznummer: nr,
          einsatzbereich: "Monatszettel",
          aueVertragRef: customer.aueVertragRef ?? null,
          status: "LAUFEND",
          notizen: "Automatisch angelegt: Hier laufen die Monatszettel dieses Kunden für diesen Monat.",
          createdById: sheet.createdById ?? null,
        },
      });
      await tx.monthBatch.update({ where: { id: frisch.id }, data: { assignmentId: assignment.id } });
    } else if (assignment.status === "ABGESCHLOSSEN") {
      // Kommt nach der Bestätigung noch ein Zettel dazu, läuft der Monatseinsatz weiter
      await tx.assignment.update({ where: { id: assignment.id }, data: { status: "LAUFEND" } });
    }

    // Wer ist die Person? Bei Links ohne vorab gewählte Person entscheidet der eingetragene Name: Er wird dem Stamm
    // zugeordnet, oder die Person wird neu angelegt. Hat sie ihren Namen nachträglich geändert, wird sie umbenannt bzw.
    // die Person gewechselt – solange der Kunde nicht bestätigt hat.
    const { employeeId, verwaist } = await bestimmePerson(tx, sheet, gewuenscht, assignment.id);

    const verwendet = new Set<string>();
    const lfdJeTag = new Map<string, number>();
    const neueTage: MonatsEintrag[] = [];
    for (const e of tage) {
      const lfd = (lfdJeTag.get(e.datum) ?? 0) + 1;
      lfdJeTag.set(e.datum, lfd);
      const istStart = fromBerlin(e.datum, e.start);
      const istEnde = fromBerlin(endeDatum(e.datum, e.start, e.ende), e.ende);
      const bezeichnung = schichtBezeichnung(e.datum, lfd);
      let shift = await tx.shift.findFirst({ where: { assignmentId: assignment.id, datum: keyToDateOnly(e.datum), bezeichnung } });
      if (!shift) {
        shift = await tx.shift.create({
          data: { organizationId: orgId, assignmentId: assignment.id, bezeichnung, taetigkeit: e.taetigkeit || "Monatszettel", datum: keyToDateOnly(e.datum), planStart: istStart, planEnde: istEnde, sortOrder: lfd },
        });
      }
      const vorhanden = await tx.shiftAssignment.findUnique({ where: { shiftId_employeeId: { shiftId: shift.id, employeeId } }, include: { timeEntries: { where: { aktuell: true }, include: { trips: true } } } });
      const sa = vorhanden
        ? await tx.shiftAssignment.update({ where: { id: vorhanden.id }, data: { planStart: istStart, planEnde: istEnde, status: "ERFASST", tokenUsedAt: jetzt } })
        : await tx.shiftAssignment.create({
            data: { organizationId: orgId, shiftId: shift.id, employeeId, planStart: istStart, planEnde: istEnde, tokenExpiresAt: sheet.tokenExpiresAt, status: "ERFASST", tokenUsedAt: jetzt },
          });
      verwendet.add(sa.id);
      const alt = vorhanden?.timeEntries[0] ?? null;
      const fahrten = e.fahrten.filter((f) => (f.km ?? 0) > 0);
      const pkw = fahrten.length > 0;
      const daten = {
        istStart,
        istEnde,
        pauseMinuten: e.pauseMin,
        taetigkeit: e.taetigkeit || shift.taetigkeit || null,
        notiz: eintragNotiz(e),
        pkw,
        pkwArt: pkw ? e.pkwArt : null,
        spesen: (e.spesen ?? 0) > 0,
        spesenBetrag: (e.spesen ?? 0) > 0 ? e.spesen : null,
      };
      const gleich =
        alt !== null &&
        alt.istStart.getTime() === istStart.getTime() &&
        alt.istEnde.getTime() === istEnde.getTime() &&
        alt.pauseMinuten === daten.pauseMinuten &&
        (alt.taetigkeit ?? null) === daten.taetigkeit &&
        (alt.notiz ?? null) === daten.notiz &&
        alt.pkw === daten.pkw &&
        (alt.pkwArt ?? null) === daten.pkwArt &&
        alt.spesen === daten.spesen &&
        Number(alt.spesenBetrag ?? 0) === Number(daten.spesenBetrag ?? 0) &&
        alt.trips.length === fahrten.length &&
        alt.trips.every((t, i) => t.von === fahrten[i].von && t.nach === fahrten[i].nach && Number(t.km) === (fahrten[i].km ?? 0)) &&
        alt.review !== "FREIGEGEBEN";
      if (!gleich) {
        if (alt) await tx.timeEntry.update({ where: { id: alt.id }, data: { aktuell: false } });
        await tx.timeEntry.create({
          data: {
            organizationId: orgId,
            shiftAssignmentId: sa.id,
            version: alt ? alt.version + 1 : 1,
            aktuell: true,
            korrigiertVonId: alt?.id ?? null,
            ...daten,
            stundenGesamt: netHours(istStart, istEnde, e.pauseMin),
            unterschriftMitarbeiterUrl: blob.url,
            unterschriftZeitpunkt: jetzt,
            unterweisungBestaetigt: false,
            ip: meta.ip,
            userAgent: meta.userAgent?.slice(0, 300) ?? null,
            geraet: "Monatszettel",
            quelle: "MITARBEITER",
            review: "ERFASST",
            trips: { create: fahrten.map((f, i) => ({ organizationId: orgId, von: f.von, nach: f.nach, km: f.km ?? 0, reihenfolge: i })) },
          },
        });
      } else if (alt) {
        // Unveränderte Zeiten gelten mit der neuen Unterschrift weiter
        await tx.timeEntry.update({ where: { id: alt.id }, data: { unterschriftMitarbeiterUrl: blob.url, unterschriftZeitpunkt: jetzt } });
      }
      neueTage.push({ ...e, saId: sa.id });
    }
    // Tage, die die Person gestrichen hat: Einteilung stornieren (die Zeiteinträge bleiben nachvollziehbar)
    const weg = [...alteIds].filter((id) => !verwendet.has(id));
    if (weg.length > 0) await tx.shiftAssignment.updateMany({ where: { id: { in: weg }, employeeId }, data: { status: "STORNIERT" } });

    await tx.monthSheet.update({
      where: { id: sheet.id },
      data: { employeeId, vorname: null, nachname: null, tage: neueTage as unknown as Prisma.InputJsonValue, personSignedAt: jetzt, personSignatureUrl: blob.url, personIp: meta.ip, personUserAgent: meta.userAgent?.slice(0, 300) ?? null, kundeStatus: "OFFEN", kundeHinweis: null },
    });
    return { ...assignment, employeeId, verwaist };
  }).catch((err: unknown) => {
    // Die Person hat im Monatseinsatz schon Zeiten (z. B. von der Dispo eingetragen): das entscheidet die Dispo
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      throw new MonatsError("Für diese Person gibt es im Monatseinsatz schon Zeiten. Bitte melde dich bei der Dispo.", 409);
    }
    throw err;
  });

  // Ein Datensatz, den der Namenswechsel überflüssig gemacht hat, wird aufgeräumt – scheitert das (weil doch etwas
  // darauf verweist), bleibt er einfach bestehen.
  if (ergebnis.verwaist) {
    await db.employee
      .delete({ where: { id: ergebnis.verwaist } })
      .then(() => logAudit({ organizationId: orgId, action: "employee.delete", entityType: "employee", entityId: ergebnis.verwaist ?? undefined, data: { quelle: "monatszettel", grund: "Name im Link geändert" } }))
      .catch(() => undefined);
  }
  await logAudit({
    organizationId: orgId,
    action: "monatszettel.person_signiert",
    entityType: "month_sheet",
    entityId: sheet.id,
    data: { employeeId: ergebnis.employeeId, monat, einsatznummer: ergebnis.einsatznummer, tage: tage.length, stunden: summe(tage).stunden, unterschrift: blob.url, ip: meta.ip },
  });
  return { einsatznummer: ergebnis.einsatznummer };
}

// ─── Kunde ──────────────────────────────────────────────────────────────────

export async function ladeStapelPerToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const abfrage = () => db.monthBatch.findUnique({ where: { token }, include: { customer: true, assignment: { select: { id: true, einsatznummer: true } }, sheets: { include: { employee: true }, orderBy: { createdAt: "asc" } } } });
  const batch = await abfrage();
  if (batch && !batch.assignmentId && batch.sheets.some((s) => s.personSignedAt || s.kundeStatus !== "OFFEN")) {
    await heileVerwaiste(batch.id);
    return abfrage();
  }
  return batch;
}

export type KundenAnsicht = {
  kunde: string;
  monat: string;
  monatLabel: string;
  kontakt: string | null;
  abgelaufen: boolean;
  zettel: Array<{
    id: string;
    name: string;
    stand: ZettelStand;
    tage: MonatsEintrag[];
    summe: { tage: number; stunden: number; km: number; spesen: number };
    personSigniert: boolean;
    personSignedAt: string | null;
    personUnterschrift: string | null;
    kundeStatus: KundeStatus;
    kundeHinweis: string | null;
    kundeAm: string | null;
    kundeName: string | null;
  }>;
};

async function alsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const b = await getBlob(url);
  return b ? `data:${b.mimeType};base64,${b.bytes.toString("base64")}` : null;
}

export async function kundenAnsicht(batch: NonNullable<Awaited<ReturnType<typeof ladeStapelPerToken>>>): Promise<KundenAnsicht> {
  const zettel: KundenAnsicht["zettel"] = [];
  for (const s of batch.sheets) {
    const tage = leseTage(s.tage).map((t) => ({ ...t, saId: undefined }));
    // Die Kunden sehen nur Zettel, die die Person schon abgeschlossen hat – sonst nur den Stand
    const sichtbar = s.personSignedAt !== null || s.kundeStatus === "BESTAETIGT";
    zettel.push({
      id: s.id,
      name: vollerName(zettelNamen(s)) || "Name noch nicht eingetragen",
      stand: zettelStand({ anzahlTage: tage.length, personSigniert: s.personSignedAt !== null, kundeStatus: s.kundeStatus }),
      tage: sichtbar ? tage : [],
      summe: summe(sichtbar ? tage : []),
      personSigniert: s.personSignedAt !== null,
      personSignedAt: s.personSignedAt?.toISOString() ?? null,
      personUnterschrift: sichtbar ? await alsDataUrl(s.personSignatureUrl) : null,
      kundeStatus: s.kundeStatus,
      kundeHinweis: s.kundeStatus === "ZURUECK" ? s.kundeHinweis : null,
      kundeAm: s.kundeAm?.toISOString() ?? null,
      kundeName: s.kundeName,
    });
  }
  return { kunde: batch.customer.name, monat: batch.monat, monatLabel: monatsName(batch.monat), kontakt: batch.kontakt, abgelaufen: batch.tokenExpiresAt < new Date(), zettel };
}

export async function gibZurueck(token: string, sheetId: string, hinweis: string): Promise<void> {
  const batch = await ladeStapelPerToken(token);
  if (!batch) throw new MonatsError("Link ungültig.", 404);
  if (batch.tokenExpiresAt < new Date()) throw new MonatsError("Dieser Link ist abgelaufen.", 409);
  const text = hinweis.trim();
  if (text.length < 3) throw new MonatsError("Bitte kurz erklären, was nicht stimmt.");
  if (text.length > 500) throw new MonatsError("Der Hinweis ist zu lang.");
  const s = batch.sheets.find((x) => x.id === sheetId);
  if (!s) throw new MonatsError("Zettel gehört nicht zu diesem Link.", 403);
  if (s.kundeStatus === "BESTAETIGT") throw new MonatsError("Dieser Zettel ist schon bestätigt.", 409);
  if (!s.personSignedAt) throw new MonatsError("Dieser Zettel ist noch nicht von der Person abgeschlossen.", 409);
  if ((await freigegebeneZeiten(s)) > 0) throw new MonatsError("Die Stunden sind bei FESS schon freigegeben. Bitte melden Sie sich dort.", 409);
  await db.monthSheet.update({ where: { id: s.id }, data: { kundeStatus: "ZURUECK", kundeHinweis: text, personSignedAt: null } });
  await logAudit({ organizationId: batch.organizationId, action: "monatszettel.zurueck", entityType: "month_sheet", entityId: s.id, data: { hinweis: text, employeeId: s.employeeId } });
}

// Bestätigung des Kunden für alle Zettel, die die Person abgeschlossen hat
export async function bestaetigeKunde(token: string, input: { kundeName: string; unterschrift: string }, meta: RequestMeta): Promise<{ bestaetigt: number }> {
  const batch = await ladeStapelPerToken(token);
  if (!batch) throw new MonatsError("Link ungültig.", 404);
  if (batch.tokenExpiresAt < new Date()) throw new MonatsError("Dieser Link ist abgelaufen.", 409);
  const name = input.kundeName.trim();
  if (name.length < 2) throw new MonatsError("Bitte Ihren Namen eintragen.");
  const bereit = batch.sheets.filter((s) => s.personSignedAt !== null && s.kundeStatus !== "BESTAETIGT");
  if (bereit.length === 0) throw new MonatsError("Es wartet kein Zettel auf Ihre Unterschrift.", 409);
  let png: Buffer;
  try {
    png = decodeSignatureDataUrl(input.unterschrift);
  } catch (err) {
    throw new MonatsError(err instanceof Error ? err.message : "Unterschrift ungültig.");
  }
  const orgId = batch.organizationId;
  const blob = await putBlob(orgId, "kundenbestaetigungen", png, "image/png");
  const jetzt = new Date();

  await db.$transaction(async (tx) => {
    for (const s of bereit) {
      await tx.monthSheet.update({ where: { id: s.id }, data: { kundeStatus: "BESTAETIGT", kundeAm: jetzt, kundeName: name, kundeSignatureUrl: blob.url, kundeHinweis: null } });
    }
    // Wie bei jedem Einsatz: die Bestätigung hängt an den Schichten (hier eine je Tag), damit Einsatzansicht und Sperren sie kennen
    if (batch.assignmentId) {
      const saIds = bereit.flatMap((s) => leseTage(s.tage).map((t) => t.saId)).filter((x): x is string => Boolean(x));
      const sas = await tx.shiftAssignment.findMany({ where: { id: { in: saIds } }, select: { shiftId: true } });
      const schichten = [...new Set(sas.map((x) => x.shiftId))];
      const vorhanden = new Set((await tx.assignmentConfirmation.findMany({ where: { assignmentId: batch.assignmentId, shiftId: { in: schichten } }, select: { shiftId: true } })).map((c) => c.shiftId));
      for (const shiftId of schichten) {
        if (vorhanden.has(shiftId)) continue;
        await tx.assignmentConfirmation.create({ data: { organizationId: orgId, assignmentId: batch.assignmentId, shiftId, kundeName: name, unterschriftUrl: blob.url, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
      }
    }
  });

  for (const s of bereit) await erzeugeMonatsPdf(orgId, s.id, { userId: null });
  // Haben alle Zettel dieses Monats bestätigt, ist der Monatseinsatz abgeschlossen (nicht benötigte Links entfernt die Dispo)
  const offen = await db.monthSheet.count({ where: { batchId: batch.id, kundeStatus: { not: "BESTAETIGT" } } });
  if (batch.assignmentId && offen === 0) await db.assignment.updateMany({ where: { id: batch.assignmentId, status: "LAUFEND" }, data: { status: "ABGESCHLOSSEN" } });
  await logAudit({ organizationId: orgId, action: "monatszettel.kunde_bestaetigt", entityType: "month_batch", entityId: batch.id, data: { kundeName: name, zettel: bereit.map((s) => s.id), unterschrift: blob.url, ip: meta.ip } });
  return { bestaetigt: bereit.length };
}

// ─── PDF ────────────────────────────────────────────────────────────────────

function stamp(d: Date): string {
  return `${formatKeyDE(berlinDateKey(d))} ${berlinTime(d)}`;
}

function pdfZeilen(tage: MonatsEintrag[]): MonatsPdfZeile[] {
  return sortiert(tage).map((e) => ({
    datum: datumAnzeige(e.datum),
    zeit: `${e.start}–${e.ende}`,
    pause: `${e.pauseMin} min`,
    stunden: formatStunden(stundenDezimal(eintragMinuten(e))),
    taetigkeit: e.taetigkeit,
    fahrten: e.fahrten.length > 0 ? `${e.pkwArt === "FIRMA" ? "Firmenfahrzeug" : "Privat-PKW"}: ${e.fahrten.map((f) => `${f.von} – ${f.nach}${f.km ? ` (${String(f.km).replace(".", ",")} km)` : ""}`).join("; ")}` : "",
    spesen: e.spesen ? `${e.spesen.toFixed(2).replace(".", ",")} €` : "",
    bemerkung: [e.sonderabsprache && `Absprache: ${e.sonderabsprache}`, e.getan && `Getan: ${e.getan}`, e.notiz].filter(Boolean).join(" · "),
  }));
}

// Rendert den Monatsstundenzettel; mit `ablegen` landet er in der Dokumentenablage (ersetzt die frühere Fassung dieses Zettels)
export async function erzeugeMonatsPdf(orgId: string, sheetId: string, opt: { userId: string | null; vorschau?: boolean }): Promise<{ bytes: Buffer; filename: string; documentId: string | null }> {
  const s = await db.monthSheet.findFirst({ where: { id: sheetId, organizationId: orgId }, include: { employee: true, batch: { include: { customer: true, assignment: { select: { id: true, einsatznummer: true } } } } } });
  if (!s) throw new MonatsError("Zettel nicht gefunden.", 404);
  const tage = leseTage(s.tage);
  const su = summe(tage);
  const personSig = s.personSignatureUrl ? (await getBlob(s.personSignatureUrl))?.bytes ?? null : null;
  const kundeSig = s.kundeSignatureUrl ? (await getBlob(s.kundeSignatureUrl))?.bytes ?? null : null;
  const namen = zettelNamen(s);
  const name = vollerName(namen) || "Name noch nicht eingetragen";
  const bestaetigt = s.kundeStatus === "BESTAETIGT" && s.kundeAm !== null;
  const bytes = await renderMonatsstundenzettel({
    einsatznummer: s.batch.assignment?.einsatznummer ?? "–",
    monatLabel: monatsName(s.batch.monat),
    person: name,
    personalnummer: s.employee?.personalnummer ?? null,
    kunde: { name: s.batch.customer.name, adresse: s.batch.customer.adresse },
    zeilen: pdfZeilen(tage),
    summe: { stunden: formatStunden(su.stunden), tage: su.tage, km: String(su.km).replace(".", ","), spesen: `${su.spesen.toFixed(2).replace(".", ",")} €` },
    erstelltAm: formatKeyDE(berlinDateKey(new Date())),
    person_unterschrift: { bytes: personSig, zeitpunkt: s.personSignedAt ? stamp(s.personSignedAt) : null },
    kunde_unterschrift: bestaetigt ? { name: s.kundeName ?? "", bytes: kundeSig, zeitpunkt: stamp(s.kundeAm as Date) } : null,
  });
  const filename = `${safeFilename(`Monatsstundenzettel_${s.batch.customer.name}_${namen.nachname || "ohne-Namen"}_${namen.vorname}_${s.batch.monat}`)}.pdf`;
  if (opt.vorschau || !bestaetigt) return { bytes, filename, documentId: null };

  // Frühere Fassung dieses Zettels ersetzen (nicht die anderer Personen im selben Einsatz)
  const frueher = await db.document.findMany({ where: { organizationId: orgId, category: "stundennachweis", meta: { path: ["monthSheetId"], equals: s.id } }, select: { id: true } });
  const doc = await storeDocument({
    organizationId: orgId,
    category: "stundennachweis",
    filename,
    mimeType: "application/pdf",
    bytes,
    meta: { monthSheetId: s.id, monat: s.batch.monat, einsatznummer: s.batch.assignment?.einsatznummer ?? null, stunden: su.stunden, tage: su.tage },
    createdById: opt.userId,
    links: [{ assignmentId: s.batch.assignmentId, customerId: s.batch.customerId, employeeId: s.employeeId ?? undefined, datum: monatErsterTag(s.batch.monat) }],
  });
  if (frueher.length > 0) await db.document.deleteMany({ where: { id: { in: frueher.map((d) => d.id) } } });
  return { bytes, filename, documentId: doc.id };
}

// Das abgelegte PDF eines bestätigten Zettels
export async function abgelegtesPdf(orgId: string, sheetId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const d = await db.document.findFirst({ where: { organizationId: orgId, category: "stundennachweis", meta: { path: ["monthSheetId"], equals: sheetId } }, orderBy: { createdAt: "desc" } });
  return d ? { bytes: Buffer.from(d.bytes), filename: d.filename } : null;
}

// ─── Links ──────────────────────────────────────────────────────────────────

export function personenLinkUrl(token: string, base?: string | null): string {
  return `${appBaseUrl(base)}/e/m/${token}`;
}

export function kundenLinkUrl(token: string, base?: string | null): string {
  return `${appBaseUrl(base)}/e/k/${token}`;
}
