import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canRate, requireReviewer } from "@/lib/einsatz/access";
import { erfahrungFuer, erfahrungOder } from "@/lib/einsatz/service/personal";
import { erfahrungKurz } from "../rating-badges";
import { berlinDateKey, berlinTime, formatKeyDE, isValidDateKey, fromBerlin, addDaysToKey } from "@/lib/einsatz/tz";
import { ReviewTable, type ReviewRow } from "./review-table";

export const metadata: Metadata = { title: "Freigabe" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Freigabe-Workflow: erfasst → geprüft → freigegeben. Nur freigegebene Zeiten
// gehen in Exporte.
export default async function FreigabePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireReviewer();
  const sp = await searchParams;
  const review = (["ERFASST", "GEPRUEFT", "FREIGEGEBEN"].includes(s(sp.review)) ? s(sp.review) : "ERFASST") as "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN";
  const where: Prisma.TimeEntryWhereInput = { organizationId: user.organizationId, aktuell: true, review };
  if (isValidDateKey(s(sp.from))) where.istStart = { gte: fromBerlin(s(sp.from), "00:00") };
  if (isValidDateKey(s(sp.to))) where.istStart = { ...(where.istStart as object), lt: fromBerlin(addDaysToKey(s(sp.to), 1), "00:00") };
  if (s(sp.customer)) where.shiftAssignment = { shift: { assignment: { customerId: s(sp.customer) } } };

  const [entries, customers, locks] = await Promise.all([
    db.timeEntry.findMany({
      where,
      orderBy: [{ istStart: "asc" }],
      take: 300,
      include: { shiftAssignment: { include: { employee: true, bewertung: true, shift: { include: { assignment: { include: { customer: true } } } } } }, trips: true },
    }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.monthLock.findMany({ where: { organizationId: user.organizationId } }),
  ]);

  // Erfahrung und Beurteilung nur für Rollen, die das dürfen
  const darfBewerten = canRate(user);
  const erfahrung = darfBewerten ? await erfahrungFuer(user.organizationId, [...new Set(entries.map((e) => e.shiftAssignment.employeeId))]) : new Map();

  const rows: ReviewRow[] = entries.map((e) => {
    const sa = e.shiftAssignment;
    const key = berlinDateKey(e.istStart);
    const [y, m] = key.split("-").map(Number);
    return {
      id: e.id,
      datum: formatKeyDE(key),
      name: `${sa.employee.vorname} ${sa.employee.nachname}`,
      personalnummer: sa.employee.personalnummer,
      einsatz: `${sa.shift.assignment.einsatznummer} ${sa.shift.assignment.projekt}`,
      assignmentId: sa.shift.assignmentId,
      kunde: sa.shift.assignment.customer.name,
      schicht: sa.shift.bezeichnung,
      zeit: `${berlinTime(e.istStart)}–${berlinTime(e.istEnde)}${berlinDateKey(e.istEnde) !== key ? " (+1)" : ""}`,
      pause: e.pauseMinuten,
      stunden: Number(e.stundenGesamt),
      taetigkeit: e.taetigkeit ?? sa.shift.taetigkeit,
      pkw: e.pkw ? `${e.pkwArt === "FIRMA" ? "Firma" : "privat"} ${e.trips.reduce((k, t) => k + Number(t.km), 0)} km` : "",
      spesen: e.spesen,
      unterschrieben: Boolean(e.unterschriftZeitpunkt),
      version: e.version,
      gesperrt: locks.some((l) => l.jahr === y && l.monat === m),
      abweichung: Math.abs(e.istStart.getTime() - sa.planStart.getTime()) / 60000 > 30 || Math.abs(e.istEnde.getTime() - sa.planEnde.getTime()) / 60000 > 30,
      shiftAssignmentId: sa.id,
      bewertung: sa.bewertung?.wert ?? null,
      bewertungNotiz: sa.bewertung?.notiz ?? null,
      erfahrung: darfBewerten ? erfahrungKurz(erfahrungOder(erfahrung, sa.employeeId), e.taetigkeit ?? sa.shift.taetigkeit) : "",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Lohnvorbereitung</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Freigabe der Zeiteinträge</h1>
        <p className="mt-1 text-sm text-navy-400">erfasst → geprüft → freigegeben. Nur freigegebene Zeiten gehen in Excel- und zvoove-Export.</p>
      </div>
      <form className="card grid gap-3 p-4 md:grid-cols-5" method="get">
        <select name="review" defaultValue={review} className="input">
          <option value="ERFASST">Erfasst (zu prüfen)</option>
          <option value="GEPRUEFT">Geprüft (freizugeben)</option>
          <option value="FREIGEGEBEN">Freigegeben</option>
        </select>
        <select name="customer" defaultValue={s(sp.customer)} className="input">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={s(sp.from)} className="input" />
        <input type="date" name="to" defaultValue={s(sp.to)} className="input" />
        <button type="submit" className="btn-secondary">
          Filtern
        </button>
      </form>
      <ReviewTable rows={rows} review={review} darfBewerten={darfBewerten} darfLoeschen />
    </div>
  );
}
