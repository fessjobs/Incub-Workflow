"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveReceipt, deleteReceipt, type SaveResult } from "../actions";

type VatLine = { rate: number; net: number; vat: number };

type ReceiptData = {
  id: string;
  companyId: string | null;
  categoryId: string | null;
  receiptDate: string;
  vendor: string;
  grossAmount: number | null;
  netAmount: number | null;
  vatLines: VatLine[];
  kind: string;
  paymentMethod: string;
  purpose: string | null;
  approved: boolean;
  isSelfReceipt: boolean;
  selfReceiptReason: string | null;
  hospitalityGuests: string | null;
  hospitalityOccasion: string | null;
  hospitalityLocation: string | null;
  vehicleName: string | null;
  odometerKm: number | null;
  notes: string | null;
  status: string;
};

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} .]/gu, "").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ReceiptEditor({
  receipt,
  companies,
  categories,
  vehicles,
  canDelete,
}: {
  receipt: ReceiptData;
  companies: { id: string; brandName: string; color: string | null }[];
  categories: { id: string; name: string; isHospitality: boolean; isFuel: boolean }[];
  vehicles: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    companyId: receipt.companyId ?? "",
    categoryId: receipt.categoryId ?? "",
    receiptDate: receipt.receiptDate,
    vendor: receipt.vendor,
    grossAmount: receipt.grossAmount !== null ? String(receipt.grossAmount) : "",
    netAmount: receipt.netAmount !== null ? String(receipt.netAmount) : "",
    kind: receipt.kind,
    paymentMethod: receipt.paymentMethod,
    purpose: receipt.purpose ?? "",
    approved: receipt.approved,
    isSelfReceipt: receipt.isSelfReceipt,
    selfReceiptReason: receipt.selfReceiptReason ?? "",
    hospitalityGuests: receipt.hospitalityGuests ?? "",
    hospitalityOccasion: receipt.hospitalityOccasion ?? "",
    hospitalityLocation: receipt.hospitalityLocation ?? "",
    vehicleName: receipt.vehicleName ?? "",
    odometerKm: receipt.odometerKm !== null ? String(receipt.odometerKm) : "",
    notes: receipt.notes ?? "",
  });
  const [vatLines, setVatLines] = useState<VatLine[]>(receipt.vatLines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const selectedCategory = categories.find((c) => c.id === f.categoryId);
  const isHospitality = selectedCategory?.isHospitality ?? false;
  const isFuel = selectedCategory?.isFuel ?? false;

  async function submit(ignoreDuplicate = false) {
    setError(null);
    setDup(null);
    setSaved(false);
    setSaving(true);
    const res: SaveResult = await saveReceipt(
      receipt.id,
      {
        companyId: f.companyId,
        categoryId: f.categoryId || null,
        receiptDate: f.receiptDate,
        vendor: f.vendor,
        grossAmount: f.grossAmount,
        netAmount: f.netAmount ? Number(f.netAmount) : null,
        kind: f.kind as "AUSLAGE" | "FIRMENZAHLUNG" | "PRIVAT",
        paymentMethod: f.paymentMethod as "BAR" | "PRIVATE_KARTE" | "FIRMENKARTE" | "UNBEKANNT",
        purpose: f.purpose || null,
        approved: f.approved,
        isSelfReceipt: f.isSelfReceipt,
        selfReceiptReason: f.selfReceiptReason || null,
        hospitalityGuests: f.hospitalityGuests || null,
        hospitalityOccasion: f.hospitalityOccasion || null,
        hospitalityLocation: f.hospitalityLocation || null,
        vehicleName: f.vehicleName || null,
        odometerKm: f.odometerKm ? Number(f.odometerKm) : null,
        notes: f.notes || null,
        vatLines: JSON.stringify(vatLines),
      },
      { ignoreDuplicate }
    );
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else if (res.duplicateOf) {
      setDup(res.duplicateOf);
    } else {
      setError(res.error ?? "Speichern fehlgeschlagen.");
    }
  }

  async function remove() {
    if (!confirm("Diesen Beleg löschen?")) return;
    setSaving(true);
    const res = await deleteReceipt(receipt.id);
    if (res.ok) router.push("/belege");
    else {
      setSaving(false);
      setError("Löschen nicht möglich.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Firma */}
      <section className="card space-y-3 p-5">
        <p className="eyebrow">Firma *</p>
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => {
            const active = f.companyId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => set({ companyId: active ? "" : c.id })}
                className={`inline-flex items-center gap-2 rounded-lg border py-1.5 pl-1.5 pr-3 text-sm transition ${
                  active
                    ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                    : "border-navy-200 bg-white hover:border-navy-400 dark:border-navy-700 dark:bg-navy-900"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-white" style={{ backgroundColor: c.color || "#0B1220" }}>
                  {initials(c.brandName)}
                </span>
                {c.brandName}
              </button>
            );
          })}
        </div>
      </section>

      {/* Belegdaten */}
      <section className="card space-y-4 p-5">
        <p className="eyebrow">Belegdaten</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Aussteller / Händler *</label>
            <input className="input" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} />
          </div>
          <div>
            <label className="label">Belegdatum *</label>
            <input type="date" className="input" value={f.receiptDate} onChange={(e) => set({ receiptDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Betrag brutto (€) *</label>
            <input className="input tabular-nums" inputMode="decimal" value={f.grossAmount} onChange={(e) => set({ grossAmount: e.target.value.replace(",", ".") })} />
          </div>
          <div>
            <label className="label">Betrag netto (€)</label>
            <input className="input tabular-nums" inputMode="decimal" value={f.netAmount} onChange={(e) => set({ netAmount: e.target.value.replace(",", ".") })} />
          </div>
        </div>

        {/* USt-Zeilen */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label !mb-0">USt-Sätze (auch gemischt)</label>
            <button type="button" className="text-xs text-navy-500 underline" onClick={() => setVatLines((v) => [...v, { rate: 19, net: 0, vat: 0 }])}>
              + Zeile
            </button>
          </div>
          {vatLines.length === 0 ? (
            <p className="text-xs text-navy-400">Keine USt-Zeilen erfasst.</p>
          ) : (
            <div className="space-y-2">
              {vatLines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input w-20 tabular-nums"
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(e) => setVatLines((v) => v.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))}
                    placeholder="%"
                  />
                  <span className="text-xs text-navy-400">% · Netto</span>
                  <input
                    className="input flex-1 tabular-nums"
                    inputMode="decimal"
                    value={line.net}
                    onChange={(e) => setVatLines((v) => v.map((x, j) => (j === i ? { ...x, net: Number(e.target.value.replace(",", ".")) } : x)))}
                  />
                  <span className="text-xs text-navy-400">USt</span>
                  <input
                    className="input flex-1 tabular-nums"
                    inputMode="decimal"
                    value={line.vat}
                    onChange={(e) => setVatLines((v) => v.map((x, j) => (j === i ? { ...x, vat: Number(e.target.value.replace(",", ".")) } : x)))}
                  />
                  <button type="button" className="text-red-500" onClick={() => setVatLines((v) => v.filter((_, j) => j !== i))} title="Zeile entfernen">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Einordnung */}
      <section className="card space-y-4 p-5">
        <p className="eyebrow">Einordnung</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Kategorie</label>
            <select className="input" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">– wählen –</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Zahlungsart</label>
            <select className="input" value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
              <option value="UNBEKANNT">Unbekannt</option>
              <option value="BAR">Bar</option>
              <option value="PRIVATE_KARTE">Private Karte</option>
              <option value="FIRMENKARTE">Firmenkarte</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Art</label>
          <div className="flex gap-2">
            {[
              { v: "AUSLAGE", l: "Auslage (Erstattung erwartet)" },
              { v: "FIRMENZAHLUNG", l: "Firmenzahlung" },
              { v: "PRIVAT", l: "Privat" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set({ kind: o.v })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                  f.kind === o.v ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900" : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Geschäftlicher Anlass / Zweck</label>
          <input className="input" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="z. B. Arbeitsmaterial für Projekt X" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.approved} onChange={(e) => set({ approved: e.target.checked })} className="h-4 w-4 rounded accent-navy-900" />
          Geprüft / freigegeben (erscheint als [X] hinter dem Namen auf dem Beiblatt)
        </label>
      </section>

      {/* Sonderfall Tank-/Fahrtkostenbeleg */}
      {isFuel && (
        <section className="card space-y-4 p-5">
          <p className="eyebrow">Fahrzeug &amp; Kilometerstand</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fahrzeug</label>
              <input
                className="input"
                list="vehicle-list"
                value={f.vehicleName}
                onChange={(e) => set({ vehicleName: e.target.value })}
                placeholder="wählen oder neu eintippen, z. B. VW Passat · MZ-AB 123"
              />
              <datalist id="vehicle-list">
                {vehicles.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-navy-400">Neue Fahrzeuge werden automatisch gemerkt.</p>
            </div>
            <div>
              <label className="label">Kilometerstand</label>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                value={f.odometerKm}
                onChange={(e) => set({ odometerKm: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="z. B. 84210"
              />
            </div>
          </div>
        </section>
      )}

      {/* Sonderfall Bewirtung */}
      {isHospitality && (
        <section className="card space-y-4 p-5">
          <p className="eyebrow">Bewirtung – gesetzliche Zusatzangaben</p>
          <div>
            <label className="label">Bewirtete Personen</label>
            <input className="input" value={f.hospitalityGuests} onChange={(e) => set({ hospitalityGuests: e.target.value })} placeholder="Namen der Teilnehmer" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Anlass der Bewirtung</label>
              <input className="input" value={f.hospitalityOccasion} onChange={(e) => set({ hospitalityOccasion: e.target.value })} />
            </div>
            <div>
              <label className="label">Ort</label>
              <input className="input" value={f.hospitalityLocation} onChange={(e) => set({ hospitalityLocation: e.target.value })} />
            </div>
          </div>
        </section>
      )}

      {/* Freitext / Bemerkungen */}
      <section className="card space-y-3 p-5">
        <p className="eyebrow">Bemerkungen</p>
        <textarea
          className="input min-h-20"
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Freitext – erscheint auf dem Belegbeiblatt (z. B. Projekt, Kostenstelle, Hinweise für die Buchhaltung)"
        />
      </section>

      {/* Sonderfall Eigenbeleg */}
      <section className="card space-y-3 p-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isSelfReceipt} onChange={(e) => set({ isSelfReceipt: e.target.checked })} className="h-4 w-4 rounded accent-navy-900" />
          Eigenbeleg (kein Originalbeleg vorhanden, z. B. Automat / verlorener Bon)
        </label>
        {f.isSelfReceipt && (
          <div>
            <label className="label">Begründung</label>
            <input className="input" value={f.selfReceiptReason} onChange={(e) => set({ selfReceiptReason: e.target.value })} placeholder="Warum liegt kein Original vor?" />
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {saved && !error && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Gespeichert – PDF wurde neu erzeugt.</p>}
      {dup && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Möglicher Doppelbeleg (wie {dup}).{" "}
          <button type="button" className="font-medium underline" onClick={() => submit(true)}>
            Trotzdem ablegen
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={saving} className="btn-primary" onClick={() => submit(false)}>
          {saving ? "Wird gespeichert …" : receipt.status === "ENTWURF" ? "Ablegen & PDF erzeugen" : "Speichern & PDF neu erzeugen"}
        </button>
        {canDelete && (
          <button type="button" className="btn-danger ml-auto" onClick={remove}>
            Löschen
          </button>
        )}
      </div>
    </div>
  );
}
