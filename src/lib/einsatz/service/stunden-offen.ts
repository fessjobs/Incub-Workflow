// Einsätze, in denen Stunden eingetragen (unterschrieben) und noch nicht freigegeben sind – das, was die Dispo als
// Nächstes prüfen und freigeben muss. Dazu zählt auch, was nach einer Freigabe noch einmal geändert wurde.
import { db } from "@/lib/db";
import { dateOnlyKey } from "../tz";

export type OffeneStunden = {
  assignmentId: string;
  einsatznummer: string;
  projekt: string;
  kunde: string;
  // Beginn des Einsatzes (JJJJ-MM-TT)
  datum: string;
  personen: number;
  stunden: number;
  // Einträge, deren frühere Fassung schon freigegeben war
  nachFreigabe: number;
};

export async function ladeOffeneStunden(organizationId: string, nurEinsatz?: string): Promise<OffeneStunden[]> {
  const eintraege = await db.timeEntry.findMany({
    where: {
      organizationId,
      aktuell: true,
      review: { in: ["ERFASST", "GEPRUEFT"] },
      unterschriftZeitpunkt: { not: null },
      shiftAssignment: { status: { not: "STORNIERT" }, ...(nurEinsatz ? { shift: { assignmentId: nurEinsatz } } : {}) },
    },
    select: {
      stundenGesamt: true,
      korrigiertVonId: true,
      shiftAssignment: {
        select: {
          employeeId: true,
          shift: { select: { assignment: { select: { id: true, einsatznummer: true, projekt: true, datumVon: true, customer: { select: { name: true } } } } } },
        },
      },
    },
    take: 5000,
  });
  if (eintraege.length === 0) return [];

  const vorgaenger = await db.timeEntry.findMany({
    where: { id: { in: eintraege.map((e) => e.korrigiertVonId).filter((x): x is string => Boolean(x)) }, review: "FREIGEGEBEN" },
    select: { id: true },
  });
  const warFreigegeben = new Set(vorgaenger.map((v) => v.id));

  const jeEinsatz = new Map<string, OffeneStunden & { leute: Set<string> }>();
  for (const e of eintraege) {
    const a = e.shiftAssignment.shift.assignment;
    const eintrag =
      jeEinsatz.get(a.id) ??
      { assignmentId: a.id, einsatznummer: a.einsatznummer, projekt: a.projekt, kunde: a.customer.name, datum: dateOnlyKey(a.datumVon), personen: 0, stunden: 0, nachFreigabe: 0, leute: new Set<string>() };
    eintrag.leute.add(e.shiftAssignment.employeeId);
    eintrag.stunden += Number(e.stundenGesamt);
    if (e.korrigiertVonId && warFreigegeben.has(e.korrigiertVonId)) eintrag.nachFreigabe++;
    jeEinsatz.set(a.id, eintrag);
  }
  return [...jeEinsatz.values()]
    .map(({ leute, ...rest }) => ({ ...rest, personen: leute.size, stunden: Math.round(rest.stunden * 100) / 100 }))
    // Zuerst, was nach der Freigabe noch geändert wurde, dann was am längsten wartet
    .sort((x, y) => Number(y.nachFreigabe > 0) - Number(x.nachFreigabe > 0) || x.datum.localeCompare(y.datum) || x.einsatznummer.localeCompare(y.einsatznummer));
}
