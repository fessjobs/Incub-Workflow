"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatEuro, formatDate } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { EmployeeReview } from "./employee-review";
import { DatevToggle } from "./datev-toggle";

export type ReceiptRow = {
  id: string;
  receiptNumber: string | null;
  receiptDate: string; // ISO
  vendor: string;
  companyName: string | null;
  categoryName: string | null;
  submitter: string;
  cardLabel: string | null;
  gross: number;
  kind: string;
  approved: boolean;
  reimbursementStatus: string;
  viaEmployeeLink: boolean;
  employeeReview: "AUSSTEHEND" | "FREIGEGEBEN" | "ABGELEHNT" | null;
  employeeReviewComment: string | null;
  datevUploadedAt: string | null;
};

const SORT_COLUMNS: Array<{ key: string; label: string; align?: "right" }> = [
  { key: "nr", label: "Belegnr." },
  { key: "datum", label: "Datum" },
  { key: "aussteller", label: "Aussteller" },
  { key: "firma", label: "Firma" },
  { key: "kategorie", label: "Kategorie" },
];

export function ReceiptTable({ rows, seesAll, isAdmin }: { rows: ReceiptRow[]; seesAll: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sortKey = params.get("sort") ?? "";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  function sortBy(key: string) {
    const next = new URLSearchParams(params.toString());
    if (sortKey === key) {
      next.set("dir", dir === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", key);
      // Text aufsteigend, Datum/Betrag absteigend als sinnvoller Start
      next.set("dir", key === "datum" || key === "betrag" ? "desc" : "asc");
    }
    router.push(`/belege?${next.toString()}`);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  const arrow = (key: string) => (sortKey === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  const HeaderButton = ({ col }: { col: { key: string; label: string; align?: "right" } }) => (
    <button
      type="button"
      onClick={() => sortBy(col.key)}
      className={`font-medium hover:text-navy-700 dark:hover:text-navy-200 ${sortKey === col.key ? "text-navy-700 dark:text-navy-200" : ""}`}
      title="Sortieren"
    >
      {col.label}
      {arrow(col.key)}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Auswahl-Leiste */}
      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-l-4 border-l-navy-900 px-4 py-3 dark:border-l-white">
          <p className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "Beleg" : "Belege"} ausgewählt
          </p>
          <a href={`/belege/zip?ids=${[...selected].join(",")}`} className="btn-primary !px-3 !py-1.5 text-sm">
            ↓ PDFs als ZIP herunterladen
          </a>
          <button
            type="button"
            className="text-sm text-navy-500 underline underline-offset-2"
            onClick={() => setSelected(new Set())}
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400 dark:border-navy-800">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded accent-navy-900"
                    title="Alle aus-/abwählen"
                  />
                </th>
                {SORT_COLUMNS.map((col) => (
                  <th key={col.key} className="px-4 py-3">
                    <HeaderButton col={col} />
                  </th>
                ))}
                {seesAll && <th className="px-4 py-3 font-medium">Einreicher</th>}
                <th className="px-4 py-3 text-right">
                  <HeaderButton col={{ key: "betrag", label: "Brutto" }} />
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                {seesAll && <th className="px-4 py-3 font-medium">DATEV</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-navy-50 last:border-0 dark:border-navy-800/60 ${
                    selected.has(r.id) ? "bg-navy-50/70 dark:bg-navy-800/50" : "hover:bg-navy-50/50 dark:hover:bg-navy-800/40"
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded accent-navy-900"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.receiptNumber}</td>
                  <td className="px-4 py-3">{formatDate(r.receiptDate)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/belege/${r.id}`} className="font-medium hover:underline">
                      {r.vendor || "–"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.companyName ?? "–"}</td>
                  <td className="px-4 py-3 text-navy-500 dark:text-navy-300">{r.categoryName ?? "–"}</td>
                  {seesAll && (
                    <td className="px-4 py-3 text-navy-500 dark:text-navy-300">
                      {r.submitter}
                      {r.cardLabel && <span className="ml-1 text-xs text-navy-400">· {r.cardLabel}</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuro(r.gross)}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1.5">
                      <StatusBadge kind={r.kind} approved={r.approved} reimbursement={r.reimbursementStatus} />
                      {r.viaEmployeeLink && (
                        <EmployeeReview
                          receiptId={r.id}
                          status={r.employeeReview}
                          comment={r.employeeReviewComment}
                          isAdmin={isAdmin}
                          compact
                        />
                      )}
                    </div>
                  </td>
                  {seesAll && (
                    <td className="px-4 py-3">
                      <DatevToggle receiptId={r.id} uploadedAt={r.datevUploadedAt} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <a href={`/belege/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs text-navy-500 underline-offset-2 hover:underline" title="PDF öffnen">
                        PDF
                      </a>
                      <Link href={`/belege/${r.id}`} className="text-xs text-navy-500 underline-offset-2 hover:underline">
                        Details
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
