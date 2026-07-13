"use client";

import { useState } from "react";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// DATEV-Monatsexport: Buchungsstapel-CSV je Firma + sortierte Beleg-PDFs
export function DatevExport({
  companies,
  defaultYear,
}: {
  companies: { id: string; brandName: string }[];
  defaultYear: number;
}) {
  const now = new Date();
  const [company, setCompany] = useState(""); // leer = alle Firmen
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const thisYear = new Date().getFullYear();

  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (company) params.set("company", company);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Firma</label>
        <select className="input max-w-[12rem]" value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">Alle Firmen</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.brandName}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Monat</label>
        <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Jahr</label>
        <select className="input max-w-[7rem]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <a href={`/auswertungen/datev?${params.toString()}`} className="btn-primary">
        ↓ DATEV-ZIP herunterladen
      </a>
    </div>
  );
}
