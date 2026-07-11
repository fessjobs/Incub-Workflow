"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveReceipt, deleteReceipt, reExtract, type SaveResult } from "./actions";

type Draft = {
  id: string;
  vendor: string;
  grossAmount: number;
  receiptDate: string;
  companyId: string | null;
  categoryId: string | null;
  kind: string;
  approved: boolean;
};

type Company = { id: string; brandName: string; color: string | null; location: string | null; isPrivate: boolean };

export function DraftQueue({
  drafts,
  companies,
  categories,
}: {
  drafts: Draft[];
  companies: Company[];
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} companies={companies} categories={categories} />
      ))}
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} .]/gu, "").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function DraftCard({ draft, companies, categories }: { draft: Draft; companies: Company[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendor, setVendor] = useState(draft.vendor);
  const [gross, setGross] = useState(draft.grossAmount ? String(draft.grossAmount) : "");
  const [date, setDate] = useState(draft.receiptDate);
  const [companyId, setCompanyId] = useState(draft.companyId ?? "");
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  const [kind, setKind] = useState(draft.kind);
  const [approved, setApproved] = useState(draft.approved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);

  async function file(ignoreDuplicate = false) {
    setError(null);
    setDup(null);
    if (!companyId) {
      setError("Bitte eine Firma wählen.");
      return;
    }
    setSaving(true);
    const res: SaveResult = await saveReceipt(
      draft.id,
      {
        companyId,
        categoryId: categoryId || null,
        receiptDate: date,
        vendor,
        grossAmount: gross,
        netAmount: null,
        kind: kind as "AUSLAGE" | "FIRMENZAHLUNG" | "PRIVAT",
        paymentMethod: "UNBEKANNT",
        purpose: null,
        approved,
        isSelfReceipt: false,
        selfReceiptReason: null,
        hospitalityGuests: null,
        hospitalityOccasion: null,
        hospitalityLocation: null,
        vehicleName: null,
        odometerKm: null,
        notes: null,
        vatLines: "",
      },
      { ignoreDuplicate }
    );
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else if (res.duplicateOf) {
      setDup(res.duplicateOf);
    } else {
      setError(res.error ?? "Speichern fehlgeschlagen.");
    }
  }

  async function remove() {
    if (!confirm("Diesen Entwurf verwerfen?")) return;
    setSaving(true);
    await deleteReceipt(draft.id);
    router.refresh();
  }

  async function rerun() {
    setSaving(true);
    setError(null);
    const res = await reExtract(draft.id);
    setSaving(false);
    if (!res.ok) setError(res.error ?? "Auslesen fehlgeschlagen.");
    else router.refresh();
  }

  const selectedCategoryName = categories.find((c) => c.id === categoryId)?.name.toLowerCase() ?? "";
  const hospitalitySelected = selectedCategoryName === "bewirtung";
  const fuelSelected = selectedCategoryName.includes("tank") || selectedCategoryName.includes("fahrt");

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Vorschau */}
        <a
          href={`/belege/${draft.id}/original`}
          target="_blank"
          rel="noreferrer"
          className="block h-40 w-full shrink-0 overflow-hidden rounded-lg border border-navy-100 bg-navy-50 dark:border-navy-800 dark:bg-navy-800 lg:h-32 lg:w-28"
          title="Original öffnen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/belege/${draft.id}/original`} alt="Beleg" className="h-full w-full object-cover" />
        </a>

        <div className="flex-1 space-y-3">
          {/* Ausgelesene Felder (editierbar) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Aussteller</label>
              <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="z. B. REWE" />
            </div>
            <div>
              <label className="label">Betrag brutto (€)</label>
              <input className="input tabular-nums" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value.replace(",", "."))} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Belegdatum</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Firma per Tap */}
          <div>
            <label className="label">Firma</label>
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => {
                const active = companyId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCompanyId(active ? "" : c.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border py-1.5 pl-1.5 pr-3 text-sm transition ${
                      active
                        ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                        : "border-navy-200 bg-white hover:border-navy-400 dark:border-navy-700 dark:bg-navy-900"
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-white"
                      style={{ backgroundColor: c.color || "#0B1220" }}
                    >
                      {initials(c.brandName)}
                    </span>
                    {c.brandName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kategorie + Art */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Kategorie</label>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">– wählen –</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Art</label>
              <div className="flex gap-1.5">
                {[
                  { v: "AUSLAGE", l: "Auslage" },
                  { v: "FIRMENZAHLUNG", l: "Firma" },
                  { v: "PRIVAT", l: "Privat" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setKind(o.v)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm transition ${
                      kind === o.v
                        ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                        : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hospitalitySelected && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Bewirtung gewählt – für die gesetzlichen Zusatzangaben (bewirtete Personen, Anlass, Ort) bitte „Details“ öffnen.
            </p>
          )}
          {fuelSelected && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Tank-/Fahrtkosten gewählt – Fahrzeug und Kilometerstand trägst du unter „Details“ ein.
            </p>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {dup && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Möglicher Doppelbeleg (gleicher Betrag, Datum, Aussteller wie {dup}).{" "}
              <button type="button" className="font-medium underline" onClick={() => file(true)}>
                Trotzdem ablegen
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" disabled={saving} className="btn-primary" onClick={() => file(false)}>
              {saving ? "Wird abgelegt …" : "Ablegen"}
            </button>
            <label className="flex items-center gap-2 text-sm text-navy-500 dark:text-navy-300">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="h-4 w-4 rounded accent-navy-900" />
              geprüft / freigegeben
            </label>
            <Link href={`/belege/${draft.id}`} className="text-sm text-navy-500 underline underline-offset-2">
              Details
            </Link>
            <button type="button" disabled={saving} className="text-sm text-navy-500 underline underline-offset-2" onClick={rerun} title="Beleg erneut automatisch auslesen">
              Neu auslesen
            </button>
            <button type="button" className="ml-auto text-sm text-red-600 hover:underline" onClick={remove}>
              Verwerfen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
