"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadReceipt } from "../actions";

type Item = {
  key: string;
  name: string;
  status: "queued" | "uploading" | "done" | "error";
  vendor?: string | null;
  extracted?: boolean;
  learned?: number;
  extractionError?: string | null;
  error?: string;
  id?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

// Fotos vor dem Upload verkleinern: schnellerer Upload und sichere Größe für
// das automatische Auslesen (max. Kantenlänge 2576px, JPEG). PDFs unverändert.
const MAX_EDGE = 2576;
const RESIZE_THRESHOLD_BYTES = 2.5 * 1024 * 1024;

async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const needsResize = Math.max(width, height) > MAX_EDGE || file.size > RESIZE_THRESHOLD_BYTES;
    if (!needsResize) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name || "beleg.jpg", { type: "image/jpeg" });
  } catch {
    // z. B. nicht dekodierbares Format – Original hochladen, Server entscheidet
    return file;
  }
}

export function Uploader({ autoRead }: { autoRead: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const doneCount = items.filter((i) => i.status === "done").length;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const newItems: Item[] = list.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name || "Beleg",
        status: "queued",
      }));
      setItems((prev) => [...prev, ...newItems]);
      setBusy(true);

      // Sequenziell abarbeiten (Warteschlange) – schont die API und die Extraktion
      for (let i = 0; i < list.length; i++) {
        const key = newItems[i].key;
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, status: "uploading" } : it)));
        try {
          const prepared = await prepareFile(list[i]);
          const fd = new FormData();
          fd.append("file", prepared);
          const res = await uploadReceipt(fd);
          setItems((prev) =>
            prev.map((it) =>
              it.key === key
                ? res.ok
                  ? { ...it, status: "done", vendor: res.vendor, extracted: res.extracted, learned: res.learned, extractionError: res.extractionError, id: res.id }
                  : { ...it, status: "error", error: res.error }
                : it
            )
          );
        } catch {
          // Server-Aufruf geplatzt: meist wurde die App gerade aktualisiert
          // (Deploy) und der offene Tab ist veraltet – Neuladen behebt es.
          setItems((prev) =>
            prev.map((it) =>
              it.key === key
                ? { ...it, status: "error", error: "Verbindung unterbrochen – Seite neu laden (⌘R) und erneut versuchen" }
                : it
            )
          );
        }
      }
      setBusy(false);
      router.refresh();
    },
    [router]
  );

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        }}
        className={`card flex flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver ? "border-navy-500 bg-navy-50 dark:bg-navy-800" : "border-navy-200 dark:border-navy-700"
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-white dark:bg-white dark:text-navy-900">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
            <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
          </svg>
        </div>
        <div>
          <p className="text-base font-medium">Belege hierher ziehen</p>
          <p className="mt-1 text-sm text-navy-400">JPG, PNG, WebP oder PDF · mehrere gleichzeitig möglich</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()}>
            Fotos / Dateien wählen
          </button>
          <button type="button" className="btn-secondary" onClick={() => cameraInput.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Kamera / Scannen
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {/* capture öffnet auf dem Handy direkt die Kamera (Scanner-Ersatz) */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Warteschlange */}
      {items.length > 0 && (
        <div className="card divide-y divide-navy-100 dark:divide-navy-800">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium">
              {doneCount} / {items.length} verarbeitet
            </p>
            {busy && <span className="text-xs text-navy-400">läuft …</span>}
          </div>
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-3 px-4 py-3 text-sm">
              <StatusIcon status={it.status} />
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              {it.status === "done" && (
                <span className={`text-xs ${it.extracted ? "text-navy-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {it.extracted
                    ? `${it.vendor || "ausgelesen"}${it.learned ? ` · zugeordnet wie ${it.learned}× zuvor` : ""}`
                    : it.extractionError
                    ? `Auslesen fehlgeschlagen: ${it.extractionError}`
                    : autoRead
                    ? "nicht lesbar – bitte manuell prüfen"
                    : "hochgeladen (Auslesen inaktiv)"}
                </span>
              )}
              {it.status === "error" && <span className="text-xs text-red-600">{it.error}</span>}
            </div>
          ))}
        </div>
      )}

      {doneCount > 0 && !busy && (
        <div className="flex items-center gap-3">
          <Link href="/belege" className="btn-primary">
            Zur Zuordnung →
          </Link>
          <span className="text-sm text-navy-400">
            {doneCount} {doneCount === 1 ? "Beleg" : "Belege"} als Entwurf angelegt
          </span>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: Item["status"] }) {
  if (status === "done")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  if (status === "error")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </span>
    );
  if (status === "uploading")
    return (
      <span className="flex h-6 w-6 items-center justify-center">
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
        </svg>
      </span>
    );
  return <span className="h-6 w-6 rounded-full border border-navy-200 dark:border-navy-700" />;
}
