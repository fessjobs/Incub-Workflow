import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyticsData, periodForYear, currentYear } from "@/lib/analytics";
import { formatEuro } from "@/lib/format";
import { DonutChart, BarList, MonthlyBars } from "@/components/charts";
import { AnalyticsControls } from "./controls";
import { ZipExport } from "./zip-export";

export const metadata: Metadata = { title: "Auswertungen" };

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AuswertungenPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;

  const year = Number(s(sp.year)) || currentYear();
  const companyId = s(sp.company) || undefined;
  const period = periodForYear(year);

  const [data, companies] = await Promise.all([
    analyticsData(user, period, companyId),
    db.company.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, brandName: true },
    }),
  ]);

  const stats = [
    { label: `Ausgaben ${year}`, value: formatEuro(data.total) },
    { label: "USt gesamt", value: formatEuro(data.vatTotal) },
    { label: "Offene Auslagen", value: formatEuro(data.openReimbursement) },
    { label: "Belege", value: String(data.count) },
  ];

  // Excel-Link mit aktuellen Filtern
  const excelParams = new URLSearchParams();
  if (companyId) excelParams.set("company", companyId);
  excelParams.set("from", period.from.toISOString().slice(0, 10));
  excelParams.set("to", period.to.toISOString().slice(0, 10));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">03 / Auswertungen</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isAdmin ? "Auswertungen" : "Meine Auswertung"}
          </h1>
          <p className="mt-1 text-sm text-navy-400">
            {isAdmin
              ? "Ausgaben der Gruppe – nach Firma, Kategorie, Nutzer und Monat."
              : "Deine Ausgaben nach Firma, Kategorie und Monat."}
          </p>
        </div>
        <a href={`/auswertungen/excel?${excelParams.toString()}`} className="btn-secondary">
          ↓ Excel-Export
        </a>
      </div>

      <AnalyticsControls
        year={year}
        companyId={companyId ?? ""}
        companies={companies}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((st) => (
          <div key={st.label} className="card p-5">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{st.value}</p>
            <p className="mt-1 text-xs text-navy-400">{st.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow mb-4">Nach Kategorie</p>
          <DonutChart data={data.byCategory} />
        </div>
        <div className="card p-5">
          <p className="eyebrow mb-4">Monatsverlauf {year}</p>
          <MonthlyBars values={data.byMonth} />
        </div>
        {isAdmin && !companyId && (
          <div className="card p-5">
            <p className="eyebrow mb-4">Nach Firma</p>
            <BarList data={data.byCompany} />
          </div>
        )}
        {isAdmin && (
          <div className="card p-5">
            <p className="eyebrow mb-4">Nach Einreicher</p>
            <BarList data={data.byUser} />
          </div>
        )}
        {!isAdmin && (
          <div className="card p-5">
            <p className="eyebrow mb-4">Nach Firma</p>
            <BarList data={data.byCompany} />
          </div>
        )}
      </div>

      {isAdmin && (
        <section className="card p-5">
          <p className="eyebrow mb-1">Steuerberater-Export</p>
          <h2 className="text-lg font-semibold tracking-tight">Monats-ZIP pro Firma</h2>
          <p className="mt-1 mb-4 text-sm text-navy-400">
            Alle Beleg-PDFs eines Monats plus Excel-Übersicht in einem ZIP – fertig für die
            USt-Voranmeldung.
          </p>
          <ZipExport companies={companies} defaultYear={year} />
        </section>
      )}
    </div>
  );
}
