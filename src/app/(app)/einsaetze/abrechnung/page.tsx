import type { Metadata } from "next";
import Link from "next/link";
import type { AbrechnungStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canInvoice, requireReviewer } from "@/lib/einsatz/access";
import { dateOnlyKey, formatKeyDE, keyToDateOnly, isValidDateKey } from "@/lib/einsatz/tz";
import { formatDateTime } from "@/lib/format";
import { RechnungZeile } from "./rechnung-zeile";

export const metadata: Metadata = { title: "Abrechnung" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const TABS: Array<{ stand: AbrechnungStatus; label: string; hinweis: string }> = [
  { stand: "OFFEN", label: "Offen", hinweis: "Warten auf die Freigabe der Dispo." },
  { stand: "FREIGEGEBEN", label: "Freigegeben", hinweis: "Bereit für die Rechnung der Buchhaltung." },
  { stand: "BERECHNET", label: "Berechnet", hinweis: "Rechnung geschrieben – erledigt." },
];

// Übersicht für den Weg zur Rechnung: offen → freigegeben → berechnet.
// Die Dispo gibt frei, die Buchhaltung trägt die Rechnungsnummer ein.
export default async function AbrechnungPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireReviewer();
  const sp = await searchParams;
  const stand = (TABS.some((t) => t.stand === s(sp.stand)) ? s(sp.stand) : "FREIGEGEBEN") as AbrechnungStatus;
  const aktiv = TABS.find((t) => t.stand === stand)!;

  const where: Prisma.AssignmentWhereInput = { organizationId: user.organizationId, abrechnung: stand };
  if (s(sp.customer)) where.customerId = s(sp.customer);
  if (isValidDateKey(s(sp.from))) where.datumBis = { gte: keyToDateOnly(s(sp.from)) };
  if (isValidDateKey(s(sp.to))) where.datumVon = { lte: keyToDateOnly(s(sp.to)) };
  const q = s(sp.q).trim();
  if (q) {
    where.OR = [
      { projekt: { contains: q, mode: "insensitive" } },
      { einsatznummer: { contains: q, mode: "insensitive" } },
      { angebotsnummer: { contains: q, mode: "insensitive" } },
      { rechnungsnummer: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [einsaetze, zaehler, customers] = await Promise.all([
    db.assignment.findMany({
      where,
      orderBy: [{ datumVon: "desc" }, { einsatznummer: "desc" }],
      take: 200,
      include: {
        customer: { select: { name: true } },
        shifts: { select: { assignments: { select: { status: true, timeEntries: { where: { aktuell: true }, select: { review: true, stundenGesamt: true } } } } } },
      },
    }),
    db.assignment.groupBy({ by: ["abrechnung"], where: { organizationId: user.organizationId }, _count: true }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const anzahl = (st: AbrechnungStatus) => zaehler.find((z) => z.abrechnung === st)?._count ?? 0;
  const darfRechnung = canInvoice(user);

  const zeilen = einsaetze.map((a) => {
    const entries = a.shifts.flatMap((sh) => sh.assignments.filter((sa) => sa.status !== "STORNIERT").flatMap((sa) => sa.timeEntries));
    const frei = entries.filter((t) => t.review === "FREIGEGEBEN");
    return {
      a,
      stunden: Math.round(frei.reduce((n, t) => n + Number(t.stundenGesamt), 0) * 100) / 100,
      offeneZeiten: entries.length - frei.length,
    };
  });
  const summe = Math.round(zeilen.reduce((n, z) => n + z.stunden, 0) * 100) / 100;

  const linkFor = (st: AbrechnungStatus) => {
    const p = new URLSearchParams();
    p.set("stand", st);
    for (const k of ["q", "customer", "from", "to"]) if (s(sp[k])) p.set(k, s(sp[k]));
    return `/einsaetze/abrechnung?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Rechnungsstellung</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Abrechnung</h1>
        <p className="mt-1 text-sm text-navy-400">Offen → die Dispo gibt den Stundennachweis frei → die Buchhaltung trägt die Rechnungsnummer ein.</p>
      </div>

      {/* Drei Körbe, jeder mit seiner Anzahl */}
      <div className="grid gap-2 sm:grid-cols-3">
        {TABS.map((t) => (
          <Link
            key={t.stand}
            href={linkFor(t.stand)}
            data-testid={`tab-${t.stand.toLowerCase()}`}
            className={`card px-4 py-3 transition hover:border-navy-300 ${t.stand === stand ? "border-navy-400 bg-navy-50 dark:border-navy-500 dark:bg-navy-800" : ""}`}
          >
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{t.label}</span>
              <span className="text-lg font-semibold tabular-nums" data-testid={`anzahl-${t.stand.toLowerCase()}`}>
                {anzahl(t.stand)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-navy-400">{t.hinweis}</p>
          </Link>
        ))}
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-4" method="get">
        <input type="hidden" name="stand" value={stand} />
        <input name="q" defaultValue={q} placeholder="Suche: Projekt, Kunde, Einsatz-, Angebots-, Rechnungsnr." className="input md:col-span-2" />
        <select name="customer" defaultValue={s(sp.customer)} className="input">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" name="from" defaultValue={s(sp.from)} className="input" aria-label="Von" />
          <input type="date" name="to" defaultValue={s(sp.to)} className="input" aria-label="Bis" />
        </div>
        <div className="flex gap-2 md:col-span-4">
          <button type="submit" className="btn-secondary">
            Filtern
          </button>
          <Link href={`/einsaetze/abrechnung?stand=${stand}`} className="btn-secondary">
            Zurücksetzen
          </Link>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3 text-sm dark:border-navy-800">
          <p className="font-medium">
            {aktiv.label} · {zeilen.length} Einsatz/Einsätze
          </p>
          <p className="text-navy-400">
            Summe freigegebene Stunden: <strong className="tabular-nums">{summe.toFixed(2).replace(".", ",")} h</strong>
          </p>
        </div>
        {zeilen.length === 0 ? (
          <p className="p-6 text-sm text-navy-400" data-testid="abrechnung-leer">
            Hier ist gerade nichts. {aktiv.hinweis}
          </p>
        ) : (
          <ul className="divide-y divide-navy-100 dark:divide-navy-800">
            {zeilen.map(({ a, stunden, offeneZeiten }) => (
              <li key={a.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.6fr_1fr_auto] md:items-center" data-testid={`abrechnung-zeile-${a.einsatznummer}`}>
                <div>
                  <p>
                    <Link href={`/einsaetze/${a.id}`} className="font-medium hover:underline">
                      {a.einsatznummer} · {a.projekt}
                    </Link>
                  </p>
                  <p className="text-xs text-navy-400">
                    {a.customer.name} · {a.einsatzort} · {formatKeyDE(dateOnlyKey(a.datumVon))}
                    {dateOnlyKey(a.datumVon) !== dateOnlyKey(a.datumBis) ? ` – ${formatKeyDE(dateOnlyKey(a.datumBis))}` : ""}
                  </p>
                  {a.abrechnungHinweis ? <p className="mt-0.5 text-xs text-navy-500">{a.abrechnungHinweis}</p> : null}
                </div>
                <div className="text-xs text-navy-500">
                  <p>
                    <strong className="tabular-nums">{stunden.toFixed(2).replace(".", ",")} h</strong> freigegeben
                    {offeneZeiten > 0 ? <span className="ml-1 text-amber-600">· {offeneZeiten} Zeit(en) offen</span> : null}
                  </p>
                  <p>
                    Angebot {a.angebotsnummer ?? "–"}
                    {a.konditionen ? ` · ${a.konditionen}` : ""}
                  </p>
                  {a.freigabeAm ? (
                    <p>
                      freigegeben von {a.freigabeVon ?? "–"} am {formatDateTime(a.freigabeAm)}
                    </p>
                  ) : null}
                  {a.rechnungAm ? (
                    <p>
                      Rechnung {a.rechnungsnummer} von {a.rechnungVon ?? "–"} am {formatDateTime(a.rechnungAm)}
                    </p>
                  ) : null}
                </div>
                <div className="md:justify-self-end">
                  {stand === "FREIGEGEBEN" && darfRechnung ? (
                    <RechnungZeile assignmentId={a.id} einsatznummer={a.einsatznummer} />
                  ) : (
                    <Link href={`/einsaetze/${a.id}`} className="btn-secondary text-xs">
                      Öffnen
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
