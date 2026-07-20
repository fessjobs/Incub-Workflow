"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  uploadReceipt,
  uploadReceiptPdfBatch,
  quickFinalize,
  linkPayment,
  type PaymentMatch,
} from "../belege/actions";

type Company = { id: string; brandName: string; color: string | null };
type Card = { id: string; label: string; own: boolean };

// Fotos vor dem Upload verkleinern (schneller, sicher fürs Auslesen)
const MAX_EDGE = 2576;
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= MAX_EDGE && file.size < 2.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "beleg.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} .]/gu, "").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function QuickUpload({ companies, cards }: { companies: Company[]; cards: Card[] }) {
  const [phase, setPhase] = useState<"pick" | "assign" | "done" | "batch">("pick");
  // Ergebnis eines Sammel-Uploads (mehrere Dateien und/oder Sammel-PDF-Split)
  const [batch, setBatch] = useState<{
    pages: number;
    receipts: Array<{ id: string; vendor: string | null; pages: number[]; source?: string }>;
    errors?: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [payment, setPayment] = useState<"BAR" | "PRIVATE_KARTE" | "FIRMENKARTE">("FIRMENKARTE");
  const [cardId, setCardId] = useState(cards.find((c) => c.own)?.id ?? cards[0]?.id ?? "");
  const [paid, setPaid] = useState<"BEZAHLT" | "ZU_ZAHLEN">("BEZAHLT");
  const [dup, setDup] = useState<string | null>(null);

  const [doneNumber, setDoneNumber] = useState<string | null>(null);
  const [matches, setMatches] = useState<PaymentMatch[]>([]);
  const [linked, setLinked] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPdfFile = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

  async function pick(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setError(null);
    setBusy(true);

    // ── Eine einzelne Datei: gewohnter Direkt-Flow ──
    if (files.length === 1) {
      const f = files[0];
      if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
      // Größen-Check vor dem Senden: zu große Dateien lehnt der Server sonst
      // kommentarlos ab (Body-Limit)
      if (f.size > 20 * 1024 * 1024) {
        setError(`Datei zu groß (${(f.size / 1024 / 1024).toFixed(1)} MB, max. 20 MB) – bitte verkleinern/komprimieren.`);
        setPreview(null);
        setBusy(false);
        return;
      }
      try {
        if (isPdfFile(f)) {
          // Sammel-PDF: wird serverseitig in Einzelbelege aufgeteilt
          const fd = new FormData();
          fd.append("file", f);
          const res = await uploadReceiptPdfBatch(fd);
          if (!res.ok) {
            setError(res.error);
          } else if (res.receipts.length === 1) {
            // nur ein Beleg → normaler Zuordnen-Schritt
            setReceiptId(res.receipts[0].id);
            setVendor(res.receipts[0].vendor);
            setPhase("assign");
          } else {
            setBatch({ pages: res.pages, receipts: res.receipts });
            setPhase("batch");
          }
        } else {
          const prepared = await prepareFile(f);
          const fd = new FormData();
          fd.append("file", prepared);
          const res = await uploadReceipt(fd);
          if (res.ok) {
            setReceiptId(res.id);
            setVendor(res.vendor);
            setPhase("assign");
          } else {
            setError(res.error);
            setPreview(null);
          }
        }
      } catch (err) {
        // Server-Aufruf geplatzt – echten Grund mit anzeigen
        const reason = err instanceof Error && err.message ? ` (${err.message.slice(0, 120)})` : "";
        setError(`Nicht durchgekommen${reason} – Seite neu laden und erneut versuchen.`);
        setPreview(null);
      }
      setBusy(false);
      return;
    }

    // ── Mehrere Dateien: nacheinander verarbeiten, alles wird Entwurf ──
    // Jede PDF wird wie gewohnt in Einzelbelege gesplittet, Fotos einzeln.
    const receipts: Array<{ id: string; vendor: string | null; pages: number[]; source?: string }> = [];
    const errors: string[] = [];
    let totalPages = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress(`Datei ${i + 1} / ${files.length}: ${f.name || "Beleg"} …`);
      if (f.size > 20 * 1024 * 1024) {
        errors.push(`${f.name}: zu groß (${(f.size / 1024 / 1024).toFixed(1)} MB, max. 20 MB)`);
        continue;
      }
      try {
        if (isPdfFile(f)) {
          const fd = new FormData();
          fd.append("file", f);
          const res = await uploadReceiptPdfBatch(fd);
          if (!res.ok) {
            errors.push(`${f.name}: ${res.error}`);
          } else {
            totalPages += res.pages;
            for (const r of res.receipts) receipts.push({ ...r, source: f.name });
          }
        } else {
          const prepared = await prepareFile(f);
          const fd = new FormData();
          fd.append("file", prepared);
          const res = await uploadReceipt(fd);
          if (res.ok) receipts.push({ id: res.id, vendor: res.vendor, pages: [], source: f.name });
          else errors.push(`${f.name}: ${res.error}`);
        }
      } catch (err) {
        const reason = err instanceof Error && err.message ? ` (${err.message.slice(0, 100)})` : "";
        errors.push(`${f.name}: nicht durchgekommen${reason}`);
      }
    }

    setProgress(null);
    setBusy(false);
    if (receipts.length === 0) {
      setError(errors.join(" · ") || "Keine Datei konnte verarbeitet werden.");
      return;
    }
    setBatch({ pages: totalPages, receipts, errors: errors.length > 0 ? errors : undefined });
    setPhase("batch");
  }

  async function finalize(ignoreDuplicate = false) {
    if (!receiptId) return;
    setError(null);
    setDup(null);
    if (!companyId) return setError("Bitte eine Firma wählen.");
    setBusy(true);
    const res = await quickFinalize(receiptId, {
      companyId,
      paymentMethod: payment,
      corporateCardId: payment === "FIRMENKARTE" ? cardId || null : null,
      // Auslage (privat/bar): Rechnung ist privat bezahlt, die Erstattung
      // bleibt automatisch "Zahlung zu bekommen" (Erstattung offen)
      paidStatus: payment === "FIRMENKARTE" ? paid : "BEZAHLT",
      ignoreDuplicate,
    });
    setBusy(false);
    if (res.ok) {
      setDoneNumber(res.receiptNumber ?? null);
      setMatches(res.matches ?? []);
      setLinked(false);
      setPhase("done");
    } else if (res.duplicateOf) {
      setDup(res.duplicateOf);
    } else {
      setError(res.error ?? "Ablegen fehlgeschlagen.");
    }
  }

  async function link(transactionId: string) {
    if (!receiptId) return;
    setBusy(true);
    const res = await linkPayment(receiptId, transactionId);
    setBusy(false);
    if (res.ok) {
      setLinked(true);
      setMatches([]);
    }
  }

  function reset() {
    setPhase("pick");
    setBatch(null);
    setProgress(null);
    setPreview(null);
    setReceiptId(null);
    setVendor(null);
    setCompanyId("");
    setDoneNumber(null);
    setMatches([]);
    setLinked(false);
    setError(null);
    setDup(null);
  }

  // ── Phase 1: Beleg wählen ──
  if (phase === "pick") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} className="btn-primary py-8" onClick={() => cameraRef.current?.click()}>
            <span className="flex flex-col items-center gap-1.5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {busy ? "Lade …" : "Foto machen"}
            </span>
          </button>
          <button type="button" disabled={busy} className="btn-secondary py-8" onClick={() => fileRef.current?.click()}>
            <span className="flex flex-col items-center gap-1.5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              Dateien wählen
            </span>
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        {busy && (
          <p className="text-center text-sm text-navy-400">
            {progress ?? "Wird hochgeladen und ausgelesen … (Sammel-PDFs mit vielen Belegen können 1–2 Minuten dauern)"}
          </p>
        )}
        {!busy && (
          <p className="text-center text-xs text-navy-400">
            Tipp: Du kannst <b>mehrere Dateien auf einmal</b> wählen. Jede PDF mit mehreren
            Belegen (z. B. gesammelt gescannt) wird automatisch in Einzelbelege aufgeteilt.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </div>
    );
  }

  // ── Sammel-PDF: Ergebnis des Splits ──
  if (phase === "batch" && batch) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-lg font-semibold">
            {batch.receipts.length} {batch.receipts.length === 1 ? "Beleg" : "Belege"}
            {batch.pages > 0 ? ` aus ${batch.pages} Seiten` : ""} erstellt
          </p>
          <p className="text-sm text-navy-400">
            Alle liegen als Entwürfe in der Zuordnen-Warteschlange – dort Firma antippen,
            prüfen und ablegen.
          </p>
        </div>

        {batch.errors && batch.errors.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <p className="font-medium">Nicht verarbeitet:</p>
            {batch.errors.map((e, i) => (
              <p key={i} className="mt-0.5 text-xs">{e}</p>
            ))}
          </div>
        )}

        <div className="card divide-y divide-navy-100 text-sm dark:divide-navy-800">
          {batch.receipts.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono text-xs text-navy-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">
                {r.vendor || "Beleg (nicht erkannt)"}
                {r.source && <span className="text-xs text-navy-400"> · {r.source}</span>}
              </span>
              <span className="text-xs text-navy-400">
                {r.pages.length > 0 ? `Seite${r.pages.length > 1 ? "n" : ""} ${r.pages.join(", ")}` : "Foto"}
              </span>
              <Link href={`/belege/${r.id}`} className="text-xs text-navy-500 underline underline-offset-2">
                Details
              </Link>
            </div>
          ))}
        </div>

        <Link href="/belege" className="btn-primary w-full justify-center py-3">
          Jetzt zuordnen ({batch.receipts.length} Entwürfe)
        </Link>
        <button type="button" className="btn-secondary w-full justify-center" onClick={reset}>
          Weitere Belege hochladen
        </button>
      </div>
    );
  }

  // ── Phase 3: Fertig + Zahlungs-Check ──
  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-lg font-semibold">Abgelegt{doneNumber ? ` · ${doneNumber}` : ""}</p>
          {receiptId && (
            <>
              <Link href={`/belege/${receiptId}`} className="btn-secondary w-full justify-center">
                Details ergänzen
              </Link>
              <p className="text-xs text-navy-400">
                z. B. Bemerkungen, Kilometerstand &amp; Fahrzeug (Tankbeleg), Bewirtungsangaben,
                Kategorie oder USt-Sätze – die PDF wird danach automatisch neu erzeugt.
              </p>
            </>
          )}
        </div>

        {/* Zahlungs-Check-Ergebnis */}
        {linked ? (
          <div className="card p-4 text-sm text-emerald-700 dark:text-emerald-300">
            ✓ Mit der Kontobewegung verknüpft – Abgleich erledigt.
          </div>
        ) : matches.length > 0 ? (
          <div className="card space-y-2 p-4">
            <p className="text-sm font-medium">Passende Zahlung auf dem Konto gefunden:</p>
            {matches.map((m) => (
              <div key={m.transactionId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">{m.label}</span>
                <button type="button" disabled={busy} className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => link(m.transactionId)}>
                  Verknüpfen
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-xs text-navy-400">
            Noch keine passende Kontobewegung – der Zahlungs-Check läuft beim nächsten
            Auszug-Import automatisch mit, oder jederzeit auf der Beleg-Detailseite.
          </p>
        )}

        <button type="button" className="btn-primary w-full py-3" onClick={reset}>
          Nächster Beleg
        </button>
      </div>
    );
  }

  // ── Phase 2: Zuordnen ──
  return (
    <div className="space-y-4">
      {preview && (
        <div className="card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Beleg" className="max-h-56 w-full object-contain bg-navy-50 dark:bg-navy-800" />
        </div>
      )}
      {vendor && (
        <p className="text-center text-sm text-navy-400">
          Erkannt: <span className="font-medium text-navy-900 dark:text-white">{vendor}</span>
        </p>
      )}

      <div className="card space-y-4 p-5">
        <div>
          <p className="label">Firma *</p>
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
                  <span className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-white" style={{ backgroundColor: c.color || "#0B1220" }}>
                    {initials(c.brandName)}
                  </span>
                  {c.brandName}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="label">Zahlungsart</p>
          <div className="flex gap-2">
            {(
              [
                { v: "FIRMENKARTE", l: "Amex / Firmenkarte" },
                { v: "PRIVATE_KARTE", l: "Private Karte" },
                { v: "BAR", l: "Bar" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPayment(o.v)}
                className={`flex-1 rounded-lg border px-2 py-2 text-sm transition ${
                  payment === o.v
                    ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                    : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {payment === "FIRMENKARTE" && cards.length > 0 && (
          <div>
            <p className="label">Welche Karte?</p>
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    cardId === c.id
                      ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                      : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                  }`}
                >
                  {c.label}
                  {c.own ? " (deine)" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {payment === "FIRMENKARTE" ? (
          <div>
            <p className="label">Zahlungsstatus</p>
            <div className="flex gap-2">
              {(
                [
                  { v: "BEZAHLT", l: "Schon bezahlt" },
                  { v: "ZU_ZAHLEN", l: "Noch zu zahlen" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPaid(o.v)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    paid === o.v
                      ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                      : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Privat gezahlt = Auslage: automatisch "Zahlung zu bekommen", bis die
          // Erstattung eingeht – änderbar jederzeit über Details.
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-500 dark:bg-navy-800 dark:text-navy-300">
            Wird als <b>Auslage</b> erfasst – Status automatisch{" "}
            <b>„Zahlung zu bekommen“</b>, bis die Erstattung auf dem Konto eingeht.
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {dup && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Möglicher Doppelbeleg (wie {dup}).{" "}
          <button type="button" className="font-medium underline" onClick={() => finalize(true)}>
            Trotzdem ablegen
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={reset}>
          Abbrechen
        </button>
        <button type="button" disabled={busy || !companyId} className="btn-primary flex-1 py-3" onClick={() => finalize(false)}>
          {busy ? "Wird abgelegt …" : "Ablegen + Zahlungs-Check"}
        </button>
      </div>
      <p className="text-center text-xs text-navy-400">
        Nach dem Ablegen kannst du über „Details ergänzen“ jederzeit Bemerkungen,
        Kilometerstand oder Bewirtungsangaben nachtragen.
      </p>
    </div>
  );
}
