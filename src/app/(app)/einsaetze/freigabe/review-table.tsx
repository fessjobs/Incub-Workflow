"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reviewAction } from "../actions";
import { RatePerson } from "../[id]/rate-person";

export type ReviewRow = {
  id: string;
  datum: string;
  name: string;
  personalnummer: string | null;
  einsatz: string;
  assignmentId: string;
  kunde: string;
  schicht: string;
  zeit: string;
  pause: number;
  stunden: number;
  taetigkeit: string;
  pkw: string;
  spesen: boolean;
  unterschrieben: boolean;
  version: number;
  gesperrt: boolean;
  abweichung: boolean;
  // Interne Beurteilung: nur fürs Backend, nur für Rollen mit dem Recht dazu
  shiftAssignmentId: string;
  bewertung: "NEGATIV" | "NEUTRAL" | "POSITIV" | null;
  bewertungNotiz: string | null;
  erfahrung: string;
};

export function ReviewTable({ rows, review, darfBewerten }: { rows: ReviewRow[]; review: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN"; darfBewerten: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const selectable = rows.filter((r) => !r.gesperrt);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const act = (target: "ERFASST" | "GEPRUEFT" | "FREIGEGEBEN") =>
    start(async () => {
      const res = await reviewAction([...selected], target);
      setMsg(res.ok ? res.message ?? "Erledigt." : res.error);
      setSelected(new Set());
      router.refresh();
    });

  const next = review === "ERFASST" ? { label: "Als geprüft markieren", target: "GEPRUEFT" as const } : review === "GEPRUEFT" ? { label: "Freigeben", target: "FREIGEGEBEN" as const } : null;
  const back = review === "GEPRUEFT" ? { label: "Zurück auf erfasst", target: "ERFASST" as const } : review === "FREIGEGEBEN" ? { label: "Freigabe zurücknehmen", target: "GEPRUEFT" as const } : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-navy-500">
          {rows.length} Einträge · {selected.size} ausgewählt · Summe {rows.reduce((s, r) => s + r.stunden, 0).toFixed(2)} h
        </span>
        {next ? (
          <button type="button" className="btn-accent" disabled={pending || selected.size === 0} onClick={() => act(next.target)}>
            {next.label}
          </button>
        ) : null}
        {review === "ERFASST" ? (
          <button type="button" className="btn-secondary" disabled={pending || selected.size === 0} onClick={() => act("FREIGEGEBEN")}>
            Direkt freigeben
          </button>
        ) : null}
        {back ? (
          <button type="button" className="btn-secondary" disabled={pending || selected.size === 0} onClick={() => act(back.target)}>
            {back.label}
          </button>
        ) : null}
        {msg ? <span className="text-xs text-navy-400">{msg}</span> : null}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400 dark:bg-navy-800">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} aria-label="Alle" />
              </th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Person</th>
              <th className="px-3 py-2">Einsatz</th>
              <th className="px-3 py-2">Zeit</th>
              <th className="px-3 py-2 text-right">Std.</th>
              <th className="px-3 py-2">Tätigkeit</th>
              <th className="px-3 py-2">PKW / Spesen</th>
              <th className="px-3 py-2">Hinweise</th>
              {darfBewerten ? <th className="px-3 py-2">Beurteilung</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={darfBewerten ? 10 : 9} className="px-3 py-6 text-center text-navy-400">
                  Keine Einträge in diesem Status.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className={r.gesperrt ? "opacity-60" : ""}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    disabled={r.gesperrt}
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.datum}</td>
                <td className="px-3 py-2">
                  {r.name}
                  <span className="block text-xs text-navy-400">{r.personalnummer ? `PN ${r.personalnummer}` : "ohne PN"}</span>
                  {darfBewerten && r.erfahrung ? <span className="block text-xs text-navy-400">{r.erfahrung}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/einsaetze/${r.assignmentId}`} className="hover:underline">
                    {r.einsatz}
                  </Link>
                  <span className="block text-xs text-navy-400">
                    {r.kunde} · {r.schicht}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.zeit}
                  <span className="block text-xs text-navy-400">Pause {r.pause} min</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.stunden.toFixed(2)}</td>
                <td className="px-3 py-2">{r.taetigkeit}</td>
                <td className="px-3 py-2 text-xs">
                  {r.pkw || "–"}
                  {r.spesen ? " · Spesen" : ""}
                </td>
                <td className="px-3 py-2 text-xs">
                  {!r.unterschrieben ? <span className="badge bg-red-100 text-red-700">ohne Unterschrift</span> : null}
                  {r.abweichung ? <span className="badge bg-amber-100 text-amber-700">Plan/Ist &gt; 30 min</span> : null}
                  {r.version > 1 ? <span className="badge bg-navy-100 text-navy-600">v{r.version}</span> : null}
                  {r.gesperrt ? <span className="badge bg-navy-900 text-white">Monat gesperrt</span> : null}
                </td>
                {darfBewerten ? (
                  <td className="px-3 py-2">
                    {r.unterschrieben ? (
                      <RatePerson shiftAssignmentId={r.shiftAssignmentId} wert={r.bewertung} notiz={r.bewertungNotiz} name={r.name} />
                    ) : (
                      <span className="text-xs text-navy-400">erst nach Unterschrift</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
