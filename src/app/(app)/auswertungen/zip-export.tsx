"use client";

import { useState } from "react";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function ZipExport({
  companies,
  defaultYear,
}: {
  companies: { id: string; brandName: string }[];
  defaultYear: number;
}) {
  const now = new Date();
  const [company, setCompany] = useState(companies[0]?.id ?? "");
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const thisYear = new Date().getFullYear();

  const href = `/auswertungen/zip?company=${company}&year=${year}&month=${month}`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Firma</label>
        <select className="input max-w-[12rem]" value={company} onChange={(e) => setCompany(e.target.value)}>
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
      <a href={company ? href : undefined} className={`btn-primary ${company ? "" : "pointer-events-none opacity-50"}`}>
        ↓ ZIP herunterladen
      </a>
    </div>
  );
}
