import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireReviewer } from "@/lib/einsatz/access";
import { dateOnlyKey, formatKeyDE, nowBerlinKey } from "@/lib/einsatz/tz";
import { RuleForm, DeductionForm } from "./rule-form";
import { deleteDeduction, deleteWageRule, resetWageRules, toggleMonthLock } from "./actions";

export const metadata: Metadata = { title: "Lohnarten" };
export const dynamic = "force-dynamic";

const TYP_LABELS: Record<string, string> = {
  NORMAL: "Normalstunden",
  NACHT: "Nachtzuschlag",
  SONNTAG: "Sonntag",
  FEIERTAG: "Feiertag",
  GARANTIE: "Garantiestunden",
  FAHRT_PRIVAT: "Fahrt Privat-PKW",
  FAHRT_FIRMA: "Fahrt Firmenfahrzeug",
  ZULAGE: "Tätigkeitszulage",
  SPESEN: "Spesen",
  ABZUG: "Abzug",
};

export default async function LohnartenPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireReviewer();
  const { edit } = await searchParams;
  const [rules, deductions, locks, employees] = await Promise.all([
    db.wageRule.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.manualDeduction.findMany({ where: { organizationId: user.organizationId }, orderBy: { datum: "desc" }, take: 50, include: { employee: { select: { vorname: true, nachname: true } } } }),
    db.monthLock.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ jahr: "desc" }, { monat: "desc" }] }),
    db.employee.findMany({ where: { organizationId: user.organizationId, status: "AKTIV" }, orderBy: [{ nachname: "asc" }], select: { id: true, vorname: true, nachname: true } }),
  ]);
  const editing = edit ? rules.find((r) => r.id === edit) ?? null : null;

  // Monatsübersicht: aktueller + 11 vorherige Monate
  const [y, m] = nowBerlinKey().split("-").map(Number);
  const months: Array<{ jahr: number; monat: number }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({ jahr: d.getUTCFullYear(), monat: d.getUTCMonth() + 1 });
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Lohnvorbereitung</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Lohnarten &amp; Regeln</h1>
              <p className="mt-1 text-sm text-navy-400">Alle Sätze und Lohnarten sind hier pflegbar; nichts ist im Code fest verdrahtet.</p>
            </div>
            <form action={resetWageRules}>
              <button type="submit" className="btn-secondary">
                Fehlende Standardregeln ergänzen
              </button>
            </form>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
                <tr>
                  <th className="px-4 py-2">Regel</th>
                  <th className="px-4 py-2">Typ</th>
                  <th className="px-4 py-2">Lohnart</th>
                  <th className="px-4 py-2">Faktor</th>
                  <th className="px-4 py-2">Bedingung</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
                {rules.map((r) => (
                  <tr key={r.id} className={r.aktiv ? "" : "opacity-50"}>
                    <td className="px-4 py-2 font-medium">
                      {r.name}
                      {!r.aktiv ? <span className="ml-2 badge bg-navy-100 text-navy-500">inaktiv</span> : null}
                    </td>
                    <td className="px-4 py-2">{TYP_LABELS[r.typ] ?? r.typ}</td>
                    <td className="px-4 py-2 font-mono">{r.lohnart}</td>
                    <td className="px-4 py-2 tabular-nums">{Number(r.faktor).toLocaleString("de-DE")}</td>
                    <td className="px-4 py-2 font-mono text-xs text-navy-500">{JSON.stringify(r.bedingung)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <a href={`/einsaetze/lohnarten?edit=${r.id}`} className="text-xs hover:underline">
                        Bearbeiten
                      </a>
                      <form action={deleteWageRule.bind(null, r.id)} className="ml-3 inline">
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          Löschen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-navy-400">
            <p>Bedingungen je Typ: Nacht {"{\"fenster\":[{\"von\":\"23:00\",\"bis\":\"06:00\"}]}"} · Garantie {"{\"stunden\":4}"} · Fahrt {"{\"satzProKm\":0.30}"} · Zulage {"{\"taetigkeiten\":[\"stapler\"],\"proStunde\":1.5}"} · Spesen {"{\"pauschale\":14}"} · Sonntag {"{\"nichtWennFeiertag\":true}"}</p>
          </div>
        </div>
        <RuleForm key={editing?.id ?? "new"} rule={editing ? { ...editing, faktor: Number(editing.faktor), bedingung: JSON.stringify(editing.bedingung) } : null} typLabels={TYP_LABELS} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Manuelle Abzüge</h2>
          <div className="card divide-y divide-navy-100 dark:divide-navy-800">
            {deductions.length === 0 ? <p className="p-4 text-sm text-navy-400">Keine Abzüge erfasst.</p> : null}
            {deductions.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {d.employee.nachname}, {d.employee.vorname} · {formatKeyDE(dateOnlyKey(d.datum))}
                  </p>
                  <p className="text-xs text-navy-400">
                    Lohnart {d.lohnart} · {d.stunden ? `${Number(d.stunden)} h` : ""} {d.betrag ? `${Number(d.betrag).toFixed(2)} €` : ""} · {d.grund}
                  </p>
                </div>
                <form action={deleteDeduction.bind(null, d.id)}>
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Löschen
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
        <DeductionForm employees={employees.map((e) => ({ id: e.id, name: `${e.nachname}, ${e.vorname}` }))} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Monatssperren</h2>
        <p className="text-sm text-navy-400">Gesperrte Monate können nicht mehr geändert werden (keine Erfassung, Korrektur oder Freigabe-Änderung).</p>
        <div className="flex flex-wrap gap-2">
          {months.map((mo) => {
            const locked = locks.some((l) => l.jahr === mo.jahr && l.monat === mo.monat);
            return (
              <form key={`${mo.jahr}-${mo.monat}`} action={toggleMonthLock.bind(null, mo.jahr, mo.monat)}>
                <button type="submit" className={locked ? "btn-primary" : "btn-secondary"} title={locked ? "Sperre aufheben" : "Monat sperren"}>
                  {locked ? "🔒 " : ""}
                  {String(mo.monat).padStart(2, "0")}/{mo.jahr}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
