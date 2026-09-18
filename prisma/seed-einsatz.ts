// Seed für das Modul "Einsätze & Stundennachweise": zwei Kunden, zehn
// Mitarbeiter, Standard-Lohnartenregeln und ein Beispieleinsatz (der
// Rohtext aus der Aufgabenstellung). Idempotent – legt nur Fehlendes an.
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_WAGE_RULES } from "../src/lib/einsatz/wage";
import { fromBerlin, keyToDateOnly } from "../src/lib/einsatz/tz";

const CUSTOMERS = [
  {
    name: "Mannheimer Power GmbH",
    adresse: "Hafenstraße 12, 68159 Mannheim",
    ansprechpartner: "Jonas Keller",
    standardEinsatzort: "Porsche Arena Stuttgart",
    bundesland: "BW",
    aueVertragRef: "AÜV-2026-014",
  },
  {
    name: "Rhein-Neckar Events AG",
    adresse: "Messeplatz 1, 69123 Heidelberg",
    ansprechpartner: "Lena Hartmann",
    standardEinsatzort: "SAP Arena Mannheim",
    bundesland: "BW",
    aueVertragRef: "AÜV-2026-021",
  },
];

const EMPLOYEES: Array<{ vorname: string; nachname: string; personalnummer: string; email?: string; zulagen?: string[] }> = [
  { vorname: "Mohammad", nachname: "Alhariri", personalnummer: "10001" },
  { vorname: "Saad Mohammad", nachname: "Hassan", personalnummer: "10002" },
  { vorname: "Mohammad Salama", nachname: "Alsmman", personalnummer: "10003" },
  { vorname: "Samira", nachname: "Gülhan", personalnummer: "10004" },
  { vorname: "Manitarun", nachname: "Sundaram", personalnummer: "10005" },
  { vorname: "Assurance", nachname: "Erhis", personalnummer: "10006" },
  { vorname: "Ibrahim", nachname: "Bouriahi", personalnummer: "10007" },
  { vorname: "Tobias", nachname: "Krämer", personalnummer: "10008", zulagen: ["stapler"] },
  { vorname: "Jana", nachname: "Weidner", personalnummer: "10009", zulagen: ["rigger"] },
  { vorname: "Deniz", nachname: "Yildirim", personalnummer: "10010" },
];

export const SAMPLE_RAW = `Artist: Reezy
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn 18.09.2026:
Call 2 | 08:00 Uhr | 2x Hands
Mohammad Alhariri
Saad Mohammad Hassan
Frühschicht | 08:00 Uhr | 2x Cateringhilfen
Mohammad Salama Alsmman
Samira Gülhan
Load-Out | 21:30 Uhr | 4x Hands
Manitarun Sundaram
Mohammad Alhariri
Assurance Erhis
Ibrahim Bouriahi
`;

export async function seedEinsatzModul(prisma: PrismaClient, organizationId: string, createdById: string | null): Promise<void> {
  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { organizationId_name: { organizationId, name: c.name } },
      update: {},
      create: { organizationId, ...c, createdById },
    });
  }

  const employees = new Map<string, string>();
  for (const e of EMPLOYEES) {
    const row = await prisma.employee.upsert({
      where: { organizationId_personalnummer: { organizationId, personalnummer: e.personalnummer } },
      update: {},
      create: {
        organizationId,
        vorname: e.vorname,
        nachname: e.nachname,
        personalnummer: e.personalnummer,
        email: e.email,
        lohnartDefaults: e.zulagen ? { zulagen: e.zulagen } : undefined,
        createdById,
      },
    });
    employees.set(`${e.vorname} ${e.nachname}`, row.id);
  }

  const ruleCount = await prisma.wageRule.count({ where: { organizationId } });
  if (ruleCount === 0) {
    for (const r of DEFAULT_WAGE_RULES) {
      await prisma.wageRule.create({
        data: { organizationId, name: r.name, typ: r.typ, bedingung: r.bedingung as object, lohnart: r.lohnart, faktor: r.faktor, aktiv: r.aktiv, sortOrder: r.sortOrder },
      });
    }
  }

  // Beispieleinsatz (nur, wenn noch keiner existiert)
  const existing = await prisma.assignment.findFirst({ where: { organizationId, einsatznummer: "2026-0918-01" } });
  if (existing) return;
  const customer = await prisma.customer.findUniqueOrThrow({ where: { organizationId_name: { organizationId, name: "Mannheimer Power GmbH" } } });
  const day = "2026-09-18";
  const shifts = [
    { bezeichnung: "Call 2", taetigkeit: "Hands", start: "08:00", endeDatum: day, ende: "16:00", anzahlSoll: 2, personen: ["Mohammad Alhariri", "Saad Mohammad Hassan"] },
    { bezeichnung: "Frühschicht", taetigkeit: "Cateringhilfen", start: "08:00", endeDatum: day, ende: "16:00", anzahlSoll: 2, personen: ["Mohammad Salama Alsmman", "Samira Gülhan"] },
    { bezeichnung: "Load-Out", taetigkeit: "Hands", start: "21:30", endeDatum: "2026-09-19", ende: "02:30", anzahlSoll: 4, personen: ["Manitarun Sundaram", "Mohammad Alhariri", "Assurance Erhis", "Ibrahim Bouriahi"] },
  ];
  await prisma.assignmentNumberCounter.upsert({
    where: { organizationId_day: { organizationId, day: "2026-0918" } },
    update: {},
    create: { organizationId, day: "2026-0918", lastNumber: 1 },
  });
  const assignment = await prisma.assignment.create({
    data: {
      organizationId,
      customerId: customer.id,
      projekt: "Reezy",
      artist: "Reezy",
      einsatzort: "Porsche Arena Stuttgart",
      bundesland: "BW",
      datumVon: keyToDateOnly(day),
      datumBis: keyToDateOnly("2026-09-19"),
      einsatznummer: "2026-0918-01",
      einsatzbereich: "Veranstaltungstechnik / Catering",
      aueVertragRef: customer.aueVertragRef,
      status: "KONKRETISIERT",
      rawInput: SAMPLE_RAW,
      crewTokenExpiresAt: new Date(fromBerlin("2026-09-19", "23:59").getTime() + 30 * 86400000),
      createdById,
    },
  });
  for (const [i, s] of shifts.entries()) {
    const planStart = fromBerlin(day, s.start);
    const planEnde = fromBerlin(s.endeDatum, s.ende);
    const shift = await prisma.shift.create({
      data: {
        organizationId,
        assignmentId: assignment.id,
        bezeichnung: s.bezeichnung,
        taetigkeit: s.taetigkeit,
        datum: keyToDateOnly(day),
        planStart,
        planEnde,
        anzahlSoll: s.anzahlSoll,
        sortOrder: i,
        createdById,
      },
    });
    for (const name of s.personen) {
      const employeeId = employees.get(name);
      if (!employeeId) continue;
      await prisma.shiftAssignment.create({
        data: { organizationId, shiftId: shift.id, employeeId, planStart, planEnde, tokenExpiresAt: new Date(planEnde.getTime() + 30 * 86400000), createdById },
      });
    }
  }
  console.log("Einsatzmodul: Beispieleinsatz 2026-0918-01 angelegt.");
}
