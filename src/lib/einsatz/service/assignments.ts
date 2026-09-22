// Einsatz-Service: Anlegen aus der Vorschau, Detailansicht, Fortschritt,
// Warnungen. organizationId immer aus dem übergebenen Nutzer.
import { randomUUID } from "crypto";
import { Prisma, type ShiftRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { deriveBundesland, resolveBundesland } from "../bundesland";
import { checkConflicts, detectConflicts, loadExistingSlots, type Conflict, type PlannedSlot } from "../conflicts";
import { nextEinsatznummer } from "../numbering";
import type { CreateAssignmentInput } from "../schemas";
import { dateOnlyKey, fromBerlin, keyToDateOnly } from "../tz";

export const TOKEN_DAYS = 30;

export type ModuleActor = { id: string; organizationId: string };

export class AssignmentError extends Error {
  constructor(message: string, public readonly konflikte: Conflict[] = []) {
    super(message);
  }
}

export function splitName(full: string): { vorname: string; nachname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { vorname: parts[0], nachname: "" };
  return { vorname: parts.slice(0, -1).join(" "), nachname: parts[parts.length - 1] };
}

export type CreateResult = { ok: true; id: string; einsatznummer: string } | { ok: false; error: string; konflikte: Conflict[] };

export async function createAssignment(actor: ModuleActor, input: CreateAssignmentInput): Promise<CreateResult> {
  const orgId = actor.organizationId;

  // Kunde bestimmen (bestehend oder neu anlegen)
  let customerId = input.customerId;
  if (customerId) {
    const c = await db.customer.findFirst({ where: { id: customerId, organizationId: orgId } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden.", konflikte: [] };
  } else if (input.kundeName) {
    const existing = await db.customer.findFirst({ where: { organizationId: orgId, name: { equals: input.kundeName, mode: "insensitive" } } });
    customerId = existing
      ? existing.id
      : (await db.customer.create({ data: { organizationId: orgId, name: input.kundeName, createdById: actor.id } })).id;
  } else {
    return { ok: false, error: "Bitte einen Kunden auswählen oder eingeben.", konflikte: [] };
  }
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });

  // Schichten und Zeiten aufbereiten
  const shifts = input.schichten.map((s, i) => {
    const planStart = fromBerlin(s.datum, s.start);
    const planEnde = fromBerlin(s.endeDatum, s.ende);
    if (planEnde <= planStart) throw new AssignmentError(`Schicht „${s.bezeichnung}“: Ende liegt vor dem Beginn.`);
    if (planEnde.getTime() - planStart.getTime() > 24 * 3600 * 1000) throw new AssignmentError(`Schicht „${s.bezeichnung}“: länger als 24 Stunden.`);
    return { ...s, planStart, planEnde, sortOrder: i };
  });

  // Personen auflösen (bestehend / neu), Dubletten je Schicht abfangen
  const employeeCache = new Map<string, { id: string; vorname: string; nachname: string }>();
  const resolved: Array<Array<{ employeeId: string; name: string; rolle: ShiftRole }>> = [];
  for (const s of shifts) {
    const list: Array<{ employeeId: string; name: string; rolle: ShiftRole }> = [];
    for (const p of s.personen) {
      let employeeId = p.employeeId;
      if (!employeeId && p.neuAnlegen) {
        const { vorname, nachname } = splitName(p.name);
        if (!nachname) throw new AssignmentError(`„${p.name}“: Für einen neuen Mitarbeiter werden Vor- und Nachname benötigt.`);
        const key = `${vorname} ${nachname}`.toLowerCase();
        const cached = employeeCache.get(key);
        if (cached) employeeId = cached.id;
        else {
          const created = await db.employee.create({
            data: { organizationId: orgId, vorname, nachname, createdById: actor.id },
            select: { id: true, vorname: true, nachname: true },
          });
          employeeCache.set(key, created);
          employeeId = created.id;
          await logAudit({ organizationId: orgId, userId: actor.id, action: "employee.create", entityType: "employee", entityId: created.id, data: { vorname, nachname, quelle: "einsatz-vorschau" } });
        }
      }
      if (!employeeId) throw new AssignmentError(`„${p.name}“ (Schicht „${s.bezeichnung}“) ist keinem Mitarbeiter zugeordnet.`);
      const emp = await db.employee.findFirst({ where: { id: employeeId, organizationId: orgId }, select: { id: true, vorname: true, nachname: true } });
      if (!emp) throw new AssignmentError(`Mitarbeiter für „${p.name}“ nicht gefunden.`);
      if (list.some((x) => x.employeeId === emp.id)) throw new AssignmentError(`Schicht „${s.bezeichnung}“: ${emp.vorname} ${emp.nachname} ist doppelt eingetragen.`);
      list.push({ employeeId: emp.id, name: `${emp.vorname} ${emp.nachname}`, rolle: p.rolle });
    }
    resolved.push(list);
  }

  // Arbeitszeitkonflikte (gegen alle Einsätze des Mandanten)
  const planned: PlannedSlot[] = shifts.flatMap((s, i) =>
    resolved[i].map((p) => ({ employeeId: p.employeeId, name: p.name, start: s.planStart, end: s.planEnde, label: s.bezeichnung, einsatz: input.projekt }))
  );
  const konflikte = await checkConflicts(orgId, planned);
  if (konflikte.length > 0 && !input.konflikteAkzeptiert) {
    return { ok: false, error: "Arbeitszeitkonflikte gefunden – bitte prüfen und ggf. bestätigen.", konflikte };
  }

  const datumVon = shifts.map((s) => s.datum).sort()[0];
  const datumBis = shifts.map((s) => s.endeDatum).sort().at(-1)!;
  const bundesland = resolveBundesland(input.bundesland, customer.bundesland, deriveBundesland(input.einsatzort));

  const created = await db.$transaction(async (tx) => {
    const einsatznummer = await nextEinsatznummer(orgId, datumVon, tx);
    const assignment = await tx.assignment.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        projekt: input.projekt,
        artist: input.artist ?? null,
        einsatzort: input.einsatzort,
        bundesland,
        datumVon: keyToDateOnly(datumVon),
        datumBis: keyToDateOnly(datumBis),
        einsatznummer,
        einsatzbereich: input.einsatzbereich ?? null,
        aueVertragRef: input.aueVertragRef ?? customer.aueVertragRef ?? null,
        notizen: input.notizen ?? null,
        rawInput: input.rawInput,
        parsedJson: (input.parsedJson as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        crewToken: randomUUID(),
        crewTokenExpiresAt: new Date(fromBerlin(datumBis, "23:59").getTime() + TOKEN_DAYS * 86400000),
        createdById: actor.id,
      },
    });
    for (const [i, s] of shifts.entries()) {
      const shift = await tx.shift.create({
        data: {
          organizationId: orgId,
          assignmentId: assignment.id,
          bezeichnung: s.bezeichnung,
          taetigkeit: s.taetigkeit,
          datum: keyToDateOnly(s.datum),
          planStart: s.planStart,
          planEnde: s.planEnde,
          treffpunkt: s.treffpunkt ?? null,
          anzahlSoll: s.anzahlSoll,
          garantieStunden: s.garantieStunden,
          sortOrder: s.sortOrder,
          createdById: actor.id,
        },
      });
      for (const p of resolved[i]) {
        await tx.shiftAssignment.create({
          data: {
            organizationId: orgId,
            shiftId: shift.id,
            employeeId: p.employeeId,
            rolle: p.rolle,
            planStart: s.planStart,
            planEnde: s.planEnde,
            tokenExpiresAt: new Date(s.planEnde.getTime() + TOKEN_DAYS * 86400000),
            createdById: actor.id,
          },
        });
      }
    }
    return assignment;
  });

  await logAudit({
    organizationId: orgId,
    userId: actor.id,
    action: "assignment.create",
    entityType: "assignment",
    entityId: created.id,
    data: { einsatznummer: created.einsatznummer, projekt: input.projekt, schichten: shifts.length, personen: planned.length, konflikteAkzeptiert: konflikte.length },
  });
  return { ok: true, id: created.id, einsatznummer: created.einsatznummer };
}

export const assignmentInclude = {
  customer: true,
  confirmations: { orderBy: { zeitpunkt: "desc" as const } },
  shifts: {
    orderBy: [{ planStart: "asc" as const }, { sortOrder: "asc" as const }],
    include: {
      assignments: {
        orderBy: { createdAt: "asc" as const },
        include: {
          employee: true,
          timeEntries: { where: { aktuell: true }, include: { trips: { orderBy: { reihenfolge: "asc" as const } } } },
          // Interne Beurteilung – wird nur im Backend angezeigt
          bewertung: true,
        },
      },
    },
  },
  documentLinks: { include: { document: { select: { id: true, category: true, filename: true, createdAt: true, size: true, sha256: true } } }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.AssignmentInclude;

export type AssignmentDetail = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

export async function loadAssignment(orgId: string, id: string): Promise<AssignmentDetail | null> {
  return db.assignment.findFirst({ where: { id, organizationId: orgId }, include: assignmentInclude });
}

export type Progress = { gesamt: number; erfasst: number; storniert: number; offen: number };

export function progressOf(a: AssignmentDetail): Progress {
  let gesamt = 0;
  let erfasst = 0;
  let storniert = 0;
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") {
        storniert++;
        continue;
      }
      gesamt++;
      if (sa.timeEntries.some((t) => t.unterschriftZeitpunkt)) erfasst++;
    }
  }
  return { gesamt, erfasst, storniert, offen: gesamt - erfasst };
}

export type Warning = { art: "konflikt" | "unterschrift" | "abweichung"; text: string };

export async function warningsFor(a: AssignmentDetail): Promise<Warning[]> {
  const out: Warning[] = [];
  const planned: PlannedSlot[] = a.shifts.flatMap((s) =>
    s.assignments
      .filter((sa) => sa.status !== "STORNIERT")
      .map((sa) => ({ employeeId: sa.employeeId, name: `${sa.employee.vorname} ${sa.employee.nachname}`, start: sa.planStart, end: sa.planEnde, label: s.bezeichnung, einsatz: a.einsatznummer }))
  );
  if (planned.length > 0) {
    const from = new Date(Math.min(...planned.map((p) => p.start.getTime())));
    const to = new Date(Math.max(...planned.map((p) => p.end.getTime())));
    const existing = await loadExistingSlots(a.organizationId, planned.map((p) => p.employeeId!), from, to, a.id);
    for (const c of detectConflicts([...planned, ...existing])) out.push({ art: "konflikt", text: c.message });
  }
  const now = Date.now();
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      const name = `${sa.employee.vorname} ${sa.employee.nachname}`;
      const entry = sa.timeEntries[0];
      if (!entry && sa.planEnde.getTime() < now) out.push({ art: "unterschrift", text: `${name}: Schicht „${s.bezeichnung}“ ist vorbei, aber noch nicht erfasst/unterschrieben.` });
      if (entry) {
        const dStart = Math.abs(entry.istStart.getTime() - sa.planStart.getTime()) / 60000;
        const dEnde = Math.abs(entry.istEnde.getTime() - sa.planEnde.getTime()) / 60000;
        if (dStart > 30 || dEnde > 30) {
          out.push({ art: "abweichung", text: `${name} („${s.bezeichnung}“): Ist weicht mehr als 30 Minuten vom Plan ab (Start ${Math.round(dStart)} min, Ende ${Math.round(dEnde)} min).` });
        }
      }
    }
  }
  return out;
}

export function assignmentDateKeys(a: { datumVon: Date; datumBis: Date }): { von: string; bis: string } {
  return { von: dateOnlyKey(a.datumVon), bis: dateOnlyKey(a.datumBis) };
}

export async function setAssignmentStatus(actor: ModuleActor, id: string, status: "ENTWURF" | "KONKRETISIERT" | "LAUFEND" | "ABGESCHLOSSEN" | "ABGERECHNET"): Promise<void> {
  const a = await db.assignment.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, status: true } });
  if (!a) throw new AssignmentError("Einsatz nicht gefunden.");
  await db.assignment.update({ where: { id }, data: { status } });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.status", entityType: "assignment", entityId: id, data: { alt: a.status, neu: status } });
}

// Token erneuern (z. B. abgelaufen) – setzt die Einmalnutzung nicht zurück
export async function renewTokens(actor: ModuleActor, assignmentId: string): Promise<number> {
  const a = await loadAssignment(actor.organizationId, assignmentId);
  if (!a) throw new AssignmentError("Einsatz nicht gefunden.");
  let n = 0;
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT" || sa.tokenUsedAt) continue;
      await db.shiftAssignment.update({
        where: { id: sa.id },
        data: { token: randomUUID(), tokenExpiresAt: new Date(Math.max(Date.now(), sa.planEnde.getTime()) + TOKEN_DAYS * 86400000) },
      });
      n++;
    }
  }
  if (!a.crewToken || (a.crewTokenExpiresAt && a.crewTokenExpiresAt < new Date())) {
    await db.assignment.update({ where: { id: a.id }, data: { crewToken: randomUUID(), crewTokenExpiresAt: new Date(Date.now() + TOKEN_DAYS * 86400000) } });
  }
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.tokens.renew", entityType: "assignment", entityId: assignmentId, data: { erneuert: n } });
  return n;
}
