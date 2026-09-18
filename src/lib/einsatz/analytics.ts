// Auswertung der Zeiteinträge: Filter, serverseitige Pagination und Summen
// aus SQL (nicht im Frontend). Lohnzeilen werden für die geladenen Zeilen
// über das Regelwerk berechnet (Excel/zvoove/Anzeige rechnen identisch).
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveBundesland } from "./bundesland";
import { addDaysToKey, berlinDateKey, fromBerlin, isValidDateKey } from "./tz";
import { computeWageLines, deductionLine, type WageLine, type WageRule } from "./wage";

export type EntryFilter = {
  von?: string;
  bis?: string;
  employeeId?: string;
  customerId?: string;
  assignmentId?: string;
  taetigkeit?: string;
  review?: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN";
};

export type EntryRow = {
  id: string;
  datumKey: string;
  istStart: Date;
  istEnde: Date;
  pauseMinuten: number;
  stunden: number;
  taetigkeit: string;
  notiz: string | null;
  pkw: boolean;
  pkwArt: "PRIVAT" | "FIRMA" | null;
  tripsKm: number;
  spesen: boolean;
  spesenBetrag: number | null;
  review: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN";
  version: number;
  unterschrieben: boolean;
  quelle: string;
  employee: { id: string; vorname: string; nachname: string; personalnummer: string | null; zulagen: string[] };
  customer: { id: string; name: string };
  assignment: { id: string; einsatznummer: string; projekt: string; bundesland: string | null; einsatzort: string };
  shift: { bezeichnung: string; taetigkeit: string; garantieStunden: number | null };
};

export function entryWhere(organizationId: string, f: EntryFilter): Prisma.TimeEntryWhereInput {
  const where: Prisma.TimeEntryWhereInput = { organizationId, aktuell: true };
  if (f.von && isValidDateKey(f.von)) where.istStart = { ...(where.istStart as object), gte: fromBerlin(f.von, "00:00") };
  if (f.bis && isValidDateKey(f.bis)) where.istStart = { ...(where.istStart as object), lt: fromBerlin(addDaysToKey(f.bis, 1), "00:00") };
  if (f.review) where.review = f.review;
  if (f.taetigkeit) where.OR = [{ taetigkeit: { contains: f.taetigkeit, mode: "insensitive" } }, { taetigkeit: null, shiftAssignment: { shift: { taetigkeit: { contains: f.taetigkeit, mode: "insensitive" } } } }];
  const sa: Prisma.ShiftAssignmentWhereInput = {};
  if (f.employeeId) sa.employeeId = f.employeeId;
  if (f.customerId || f.assignmentId) sa.shift = { assignment: { ...(f.customerId ? { customerId: f.customerId } : {}), ...(f.assignmentId ? { id: f.assignmentId } : {}) } };
  if (Object.keys(sa).length > 0) where.shiftAssignment = sa;
  return where;
}

const include = {
  trips: true,
  shiftAssignment: { include: { employee: true, shift: { include: { assignment: { include: { customer: true } } } } } },
} satisfies Prisma.TimeEntryInclude;

type Loaded = Prisma.TimeEntryGetPayload<{ include: typeof include }>;

function toRow(e: Loaded): EntryRow {
  const sa = e.shiftAssignment;
  const a = sa.shift.assignment;
  return {
    id: e.id,
    datumKey: berlinDateKey(e.istStart),
    istStart: e.istStart,
    istEnde: e.istEnde,
    pauseMinuten: e.pauseMinuten,
    stunden: Number(e.stundenGesamt),
    taetigkeit: e.taetigkeit || sa.shift.taetigkeit,
    notiz: e.notiz,
    pkw: e.pkw,
    pkwArt: e.pkwArt,
    tripsKm: e.trips.reduce((k, t) => k + Number(t.km), 0),
    spesen: e.spesen,
    spesenBetrag: e.spesenBetrag === null ? null : Number(e.spesenBetrag),
    review: e.review,
    version: e.version,
    unterschrieben: Boolean(e.unterschriftZeitpunkt),
    quelle: e.quelle,
    employee: {
      id: sa.employee.id,
      vorname: sa.employee.vorname,
      nachname: sa.employee.nachname,
      personalnummer: sa.employee.personalnummer,
      zulagen: ((sa.employee.lohnartDefaults as { zulagen?: string[] } | null)?.zulagen ?? []).map(String),
    },
    customer: { id: a.customer.id, name: a.customer.name },
    assignment: { id: a.id, einsatznummer: a.einsatznummer, projekt: a.projekt, bundesland: a.bundesland, einsatzort: a.einsatzort },
    shift: { bezeichnung: sa.shift.bezeichnung, taetigkeit: sa.shift.taetigkeit, garantieStunden: sa.shift.garantieStunden === null ? null : Number(sa.shift.garantieStunden) },
  };
}

export async function loadEntries(organizationId: string, f: EntryFilter, paging?: { page: number; pageSize: number }): Promise<{ rows: EntryRow[]; total: number }> {
  const where = entryWhere(organizationId, f);
  const [total, entries] = await Promise.all([
    db.timeEntry.count({ where }),
    db.timeEntry.findMany({
      where,
      include,
      orderBy: [{ istStart: "asc" }, { id: "asc" }],
      ...(paging ? { skip: (paging.page - 1) * paging.pageSize, take: paging.pageSize } : {}),
    }),
  ]);
  return { rows: entries.map(toRow), total };
}

export type GroupSum = { key: string; label: string; stunden: number; eintraege: number };

export type Sums = {
  gesamtStunden: number;
  eintraege: number;
  einsaetze: number;
  personen: number;
  fahrtenPrivat: number;
  fahrtenFirma: number;
  kmPrivat: number;
  kmFirma: number;
  spesenFaelle: number;
  jePerson: GroupSum[];
  jeKunde: GroupSum[];
  jeTaetigkeit: GroupSum[];
};

// Summen direkt in SQL (Postgres). Filter werden als WHERE-Fragmente gebaut.
export async function loadSums(organizationId: string, f: EntryFilter): Promise<Sums> {
  const conds: Prisma.Sql[] = [Prisma.sql`te."organizationId" = ${organizationId}`, Prisma.sql`te."aktuell" = true`];
  if (f.von && isValidDateKey(f.von)) conds.push(Prisma.sql`te."istStart" >= ${fromBerlin(f.von, "00:00")}`);
  if (f.bis && isValidDateKey(f.bis)) conds.push(Prisma.sql`te."istStart" < ${fromBerlin(addDaysToKey(f.bis, 1), "00:00")}`);
  if (f.review) conds.push(Prisma.sql`te."review" = ${f.review}::"TimeEntryReview"`);
  if (f.employeeId) conds.push(Prisma.sql`sa."employeeId" = ${f.employeeId}`);
  if (f.customerId) conds.push(Prisma.sql`a."customerId" = ${f.customerId}`);
  if (f.assignmentId) conds.push(Prisma.sql`a."id" = ${f.assignmentId}`);
  if (f.taetigkeit) conds.push(Prisma.sql`COALESCE(te."taetigkeit", s."taetigkeit") ILIKE ${"%" + f.taetigkeit + "%"}`);
  const whereSql = Prisma.join(conds, " AND ");
  const from = Prisma.sql`
    FROM "time_entries" te
    JOIN "shift_assignments" sa ON sa."id" = te."shiftAssignmentId"
    JOIN "shifts" s ON s."id" = sa."shiftId"
    JOIN "assignments" a ON a."id" = s."assignmentId"
    JOIN "employees" e ON e."id" = sa."employeeId"
    JOIN "customers" c ON c."id" = a."customerId"
    LEFT JOIN LATERAL (SELECT COALESCE(SUM(t."km"), 0) AS km FROM "trips" t WHERE t."timeEntryId" = te."id") tr ON true
    WHERE ${whereSql}`;

  const [totals, jePerson, jeKunde, jeTaetigkeit] = await Promise.all([
    db.$queryRaw<Array<{ stunden: number; eintraege: bigint; einsaetze: bigint; personen: bigint; fahrten_privat: bigint; fahrten_firma: bigint; km_privat: number; km_firma: number; spesen: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(te."stundenGesamt"), 0)::float AS stunden,
             COUNT(*) AS eintraege,
             COUNT(DISTINCT a."id") AS einsaetze,
             COUNT(DISTINCT e."id") AS personen,
             COUNT(*) FILTER (WHERE te."pkw" AND te."pkwArt" = 'PRIVAT') AS fahrten_privat,
             COUNT(*) FILTER (WHERE te."pkw" AND te."pkwArt" = 'FIRMA') AS fahrten_firma,
             COALESCE(SUM(tr.km) FILTER (WHERE te."pkw" AND te."pkwArt" = 'PRIVAT'), 0)::float AS km_privat,
             COALESCE(SUM(tr.km) FILTER (WHERE te."pkw" AND te."pkwArt" = 'FIRMA'), 0)::float AS km_firma,
             COUNT(*) FILTER (WHERE te."spesen") AS spesen
      ${from}`),
    db.$queryRaw<Array<{ key: string; label: string; stunden: number; eintraege: bigint }>>(Prisma.sql`
      SELECT e."id" AS key, e."nachname" || ', ' || e."vorname" AS label, COALESCE(SUM(te."stundenGesamt"), 0)::float AS stunden, COUNT(*) AS eintraege
      ${from} GROUP BY e."id", e."nachname", e."vorname" ORDER BY stunden DESC`),
    db.$queryRaw<Array<{ key: string; label: string; stunden: number; eintraege: bigint }>>(Prisma.sql`
      SELECT c."id" AS key, c."name" AS label, COALESCE(SUM(te."stundenGesamt"), 0)::float AS stunden, COUNT(*) AS eintraege
      ${from} GROUP BY c."id", c."name" ORDER BY stunden DESC`),
    db.$queryRaw<Array<{ key: string; label: string; stunden: number; eintraege: bigint }>>(Prisma.sql`
      SELECT COALESCE(NULLIF(te."taetigkeit", ''), s."taetigkeit") AS key, COALESCE(NULLIF(te."taetigkeit", ''), s."taetigkeit") AS label, COALESCE(SUM(te."stundenGesamt"), 0)::float AS stunden, COUNT(*) AS eintraege
      ${from} GROUP BY 1, 2 ORDER BY stunden DESC`),
  ]);
  const t = totals[0];
  const g = (rows: Array<{ key: string; label: string; stunden: number; eintraege: bigint }>): GroupSum[] =>
    rows.map((r) => ({ key: r.key ?? "", label: r.label || "–", stunden: Math.round(Number(r.stunden) * 100) / 100, eintraege: Number(r.eintraege) }));
  return {
    gesamtStunden: Math.round(Number(t?.stunden ?? 0) * 100) / 100,
    eintraege: Number(t?.eintraege ?? 0),
    einsaetze: Number(t?.einsaetze ?? 0),
    personen: Number(t?.personen ?? 0),
    fahrtenPrivat: Number(t?.fahrten_privat ?? 0),
    fahrtenFirma: Number(t?.fahrten_firma ?? 0),
    kmPrivat: Math.round(Number(t?.km_privat ?? 0) * 10) / 10,
    kmFirma: Math.round(Number(t?.km_firma ?? 0) * 10) / 10,
    spesenFaelle: Number(t?.spesen ?? 0),
    jePerson: g(jePerson),
    jeKunde: g(jeKunde),
    jeTaetigkeit: g(jeTaetigkeit),
  };
}

export async function loadWageRules(organizationId: string): Promise<WageRule[]> {
  const rules = await db.wageRule.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  return rules.map((r) => ({ id: r.id, name: r.name, typ: r.typ, bedingung: r.bedingung, lohnart: r.lohnart, faktor: Number(r.faktor), aktiv: r.aktiv, sortOrder: r.sortOrder }));
}

export function wageLinesForRow(row: EntryRow, rules: WageRule[], defaultBundesland?: string | null): WageLine[] {
  return computeWageLines(
    {
      entry: {
        id: row.id,
        istStart: row.istStart,
        istEnde: row.istEnde,
        pauseMinuten: row.pauseMinuten,
        stundenGesamt: row.stunden,
        taetigkeit: row.taetigkeit,
        pkw: row.pkw,
        pkwArt: row.pkwArt,
        spesen: row.spesen,
        spesenBetrag: row.spesenBetrag,
        tripsKm: row.tripsKm,
      },
      shift: { taetigkeit: row.shift.taetigkeit, garantieStunden: row.shift.garantieStunden },
      bundesland: resolveBundesland(row.assignment.bundesland, defaultBundesland),
      employeeZulagen: row.employee.zulagen,
    },
    rules
  );
}

export type DeductionRow = { id: string; datumKey: string; employee: { id: string; vorname: string; nachname: string; personalnummer: string | null }; line: WageLine };

export async function loadDeductions(organizationId: string, f: EntryFilter): Promise<DeductionRow[]> {
  const where: Prisma.ManualDeductionWhereInput = { organizationId };
  if (f.employeeId) where.employeeId = f.employeeId;
  if (f.von && isValidDateKey(f.von)) where.datum = { ...(where.datum as object), gte: new Date(`${f.von}T00:00:00Z`) };
  if (f.bis && isValidDateKey(f.bis)) where.datum = { ...(where.datum as object), lte: new Date(`${f.bis}T00:00:00Z`) };
  // Abzüge sind nicht kunden-/einsatzbezogen – bei Kundenfilter entfallen sie
  if (f.customerId || f.assignmentId) return [];
  const rows = await db.manualDeduction.findMany({ where, include: { employee: true }, orderBy: { datum: "asc" } });
  return rows.map((d) => ({
    id: d.id,
    datumKey: d.datum.toISOString().slice(0, 10),
    employee: { id: d.employee.id, vorname: d.employee.vorname, nachname: d.employee.nachname, personalnummer: d.employee.personalnummer },
    line: deductionLine({ id: d.id, lohnart: d.lohnart, stunden: d.stunden === null ? null : Number(d.stunden), betrag: d.betrag === null ? null : Number(d.betrag), grund: d.grund }),
  }));
}
