import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireModuleUser } from "@/lib/einsatz/access";
import { loadEntries, loadSums, loadWageRules, wageLinesForRow } from "@/lib/einsatz/analytics";
import { AnalyticsFilterSchema } from "@/lib/einsatz/schemas";
import { berlinTime, formatKeyDE, nowBerlinKey } from "@/lib/einsatz/tz";
import { StatusBadge } from "../einsaetze/status-badge";
import { ExportPanel } from "./export-panel";

export const metadata: Metadata = { title: "Stunden-Auswertung" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function monthRange(): { von: string; bis: string } {
  const today = nowBerlinKey();
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { von: `${today.slice(0, 7)}-01`, bis: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

export default async function AuswertungPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireModuleUser();
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, typeof v === "string" ? v : undefined]).filter(([, v]) => v));
  const parsed = AnalyticsFilterSchema.safeParse(flat);
  const defaults = monthRange();
  const f = parsed.success ? parsed.data : { page: 1, pageSize: 50 };
  const filter = { von: f.von ?? defaults.von, bis: f.bis ?? defaults.bis, employeeId: f.employeeId, customerId: f.customerId, assignmentId: f.assignmentId, taetigkeit: f.taetigkeit, review: f.review };
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 50;

  const [{ rows, total }, sums, rules, employees, customers, locks] = await Promise.all([
    loadEntries(user.organizationId, filter, { page, pageSize }),
    loadSums(user.organizationId, filter),
    loadWageRules(user.organizationId),
    db.employee.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ nachname: "asc" }], select: { id: true, vorname: true, nachname: true } }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.monthLock.findMany({ where: { organizationId: user.organizationId } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filter, page, pageSize, ...patch })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/auswertung?${p.toString()}`;
  };

  const kpis = [
    { label: "Gesamtstunden", value: sums.gesamtStunden.toLocaleString("de-DE", { minimumFractionDigits: 2 }) },
    { label: "Zeiteinträge", value: String(sums.eintraege) },
    { label: "Einsätze", value: String(sums.einsaetze) },
    { label: "Personen", value: String(sums.personen) },
    { label: "Fahrten privat / Firma", value: `${sums.fahrtenPrivat} / ${sums.fahrtenFirma}` },
    { label: "km privat / Firma", value: `${sums.kmPrivat} / ${sums.kmFirma}` },
    { label: "Spesenfälle", value: String(sums.spesenFaelle) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Einsatzmodul</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Stunden-Auswertung</h1>
        <p className="mt-1 text-sm text-navy-400">Nach Person, Kunde, Tätigkeit, Zeitraum, Einsatz und Status. Summen werden in der Datenbank berechnet.</p>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-7" method="get">
        <input type="date" name="von" defaultValue={filter.von} className="input" aria-label="Von" />
        <input type="date" name="bis" defaultValue={filter.bis} className="input" aria-label="Bis" />
        <select name="employeeId" defaultValue={filter.employeeId ?? ""} className="input">
          <option value="">Alle Personen</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nachname}, {e.vorname}
            </option>
          ))}
        </select>
        <select name="customerId" defaultValue={filter.customerId ?? ""} className="input">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="taetigkeit" defaultValue={filter.taetigkeit ?? ""} placeholder="Tätigkeit" className="input" />
        <select name="review" defaultValue={filter.review ?? ""} className="input">
          <option value="">Alle Status</option>
          <option value="ERFASST">Erfasst</option>
          <option value="GEPRUEFT">Geprüft</option>
          <option value="FREIGEGEBEN">Freigegeben</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn-secondary">
            Filtern
          </button>
          <Link href="/auswertung" className="btn-secondary">
            Reset
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xl font-semibold tabular-nums tracking-tight" data-testid={`kpi-${k.label}`}>
              {k.value}
            </p>
            <p className="mt-1 text-[11px] text-navy-400">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Stunden je Person", data: sums.jePerson },
          { title: "Stunden je Kunde", data: sums.jeKunde },
          { title: "Stunden je Tätigkeit", data: sums.jeTaetigkeit },
        ].map((b) => (
          <div key={b.title} className="card p-4">
            <p className="eyebrow mb-2">{b.title}</p>
            {b.data.length === 0 ? <p className="text-sm text-navy-400">–</p> : null}
            <ul className="space-y-1 text-sm">
              {b.data.slice(0, 12).map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{g.label}</span>
                  <span className="tabular-nums text-navy-500">
                    {g.stunden.toLocaleString("de-DE", { minimumFractionDigits: 2 })} h <span className="text-xs text-navy-300">({g.eintraege})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ExportPanel von={filter.von} bis={filter.bis} customers={customers} employees={employees.map((e) => ({ id: e.id, name: `${e.nachname}, ${e.vorname}` }))} customerId={filter.customerId} employeeId={filter.employeeId} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
            <tr>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Person</th>
              <th className="px-3 py-2">Kunde · Einsatz</th>
              <th className="px-3 py-2">Zeit</th>
              <th className="px-3 py-2 text-right">Std.</th>
              <th className="px-3 py-2">Tätigkeit</th>
              <th className="px-3 py-2">Lohnarten</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-navy-400">
                  Keine Zeiteinträge im Filter.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => {
              const lines = wageLinesForRow(r, rules);
              const [y, m] = r.datumKey.split("-").map(Number);
              const locked = locks.some((l) => l.jahr === y && l.monat === m);
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatKeyDE(r.datumKey)}</td>
                  <td className="px-3 py-2">
                    {r.employee.nachname}, {r.employee.vorname}
                    <span className="block text-xs text-navy-400">{r.employee.personalnummer ? `PN ${r.employee.personalnummer}` : "ohne PN"}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.customer.name}
                    <Link href={`/einsaetze/${r.assignment.id}`} className="block text-xs text-navy-400 hover:underline">
                      {r.assignment.einsatznummer} {r.assignment.projekt} · {r.shift.bezeichnung}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {berlinTime(r.istStart)}–{berlinTime(r.istEnde)}
                    <span className="block text-xs text-navy-400">Pause {r.pauseMinuten} min</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stunden.toFixed(2)}</td>
                  <td className="px-3 py-2">{r.taetigkeit}</td>
                  <td className="px-3 py-2 text-xs">
                    {lines.map((l, i) => (
                      <span key={i} className="mr-1 inline-block rounded bg-navy-50 px-1.5 py-0.5 dark:bg-navy-800" title={l.grundlage}>
                        {l.lohnart} {l.menge.toFixed(2)} {l.einheit === "Stunden" ? "h" : l.einheit}
                        {l.betrag !== null ? ` · ${l.betrag.toFixed(2)} €` : ""}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.review} />
                    {locked ? <span className="ml-1 badge bg-navy-900 text-white">gesperrt</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 px-3 py-2 text-xs text-navy-500 dark:border-navy-800">
          <span>
            {total} Einträge · Seite {page} von {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={qs({ page: page - 1 })} className="btn-secondary text-xs">
                Zurück
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={qs({ page: page + 1 })} className="btn-secondary text-xs">
                Weiter
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
