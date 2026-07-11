"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function AnalyticsControls({
  year,
  companyId,
  companies,
}: {
  year: number;
  companyId: string;
  companies: { id: string; brandName: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/auswertungen?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select className="input max-w-[8rem]" value={String(year)} onChange={(e) => set("year", e.target.value)}>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select className="input max-w-[12rem]" value={companyId} onChange={(e) => set("company", e.target.value)}>
        <option value="">Alle Firmen</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.brandName}</option>
        ))}
      </select>
    </div>
  );
}
