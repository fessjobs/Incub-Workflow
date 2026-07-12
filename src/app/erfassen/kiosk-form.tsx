"use client";

import { useRef, useState } from "react";

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

export function KioskForm({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [name, setName] = useState("");
  const [auftrag, setAuftrag] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  }

  async function submit() {
    setError(null);
    if (!file) return setError("Bitte einen Beleg fotografieren oder wählen.");
    if (!name.trim()) return setError("Bitte deinen Namen eingeben.");
    if (!auftrag.trim()) return setError("Bitte den Auftrag / Anlass eingeben.");
    setBusy(true);
    try {
      const prepared = await prepareFile(file);
      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("name", name.trim());
      fd.append("auftrag", auftrag.trim());
      const { kioskSubmit } = await import("./actions");
      const res = await kioskSubmit(companyId, fd);
      if (res.ok) {
        setDone(res.receiptNumber ?? "abgelegt");
        setFile(null);
        setPreview(null);
        setAuftrag("");
        // Name bleibt stehen – oft erfasst dieselbe Person mehrere Belege
      } else {
        setError(res.error ?? "Erfassen fehlgeschlagen.");
      }
    } catch {
      setError("Erfassen fehlgeschlagen.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="card space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold">Beleg abgelegt</p>
          <p className="mt-1 text-sm text-navy-400">Belegnummer {done} · danke, {name || "!"}</p>
        </div>
        <button type="button" className="btn-primary w-full" onClick={() => setDone(null)}>
          Nächsten Beleg erfassen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Beleg */}
      {preview ? (
        <div className="card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Beleg" className="max-h-72 w-full object-contain bg-navy-50 dark:bg-navy-800" />
          <button type="button" className="w-full border-t border-navy-100 py-2 text-sm text-navy-500 dark:border-navy-800" onClick={() => { setFile(null); setPreview(null); }}>
            Anderes Foto
          </button>
        </div>
      ) : file ? (
        <div className="card flex items-center justify-between p-4 text-sm">
          <span className="truncate">{file.name}</span>
          <button type="button" className="text-navy-500 underline" onClick={() => setFile(null)}>ändern</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-primary py-6" onClick={() => cameraRef.current?.click()}>
            <span className="flex flex-col items-center gap-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Foto machen
            </span>
          </button>
          <button type="button" className="btn-secondary py-6" onClick={() => fileRef.current?.click()}>
            <span className="flex flex-col items-center gap-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              Datei wählen
            </span>
          </button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {/* Name + Auftrag */}
      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Dein Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" />
        </div>
        <div>
          <label className="label">Auftrag / Anlass</label>
          <input className="input" value={auftrag} onChange={(e) => setAuftrag(e.target.value)} placeholder="z. B. Projekt Müller, Baustelle Mainz" />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <button type="button" disabled={busy} className="btn-primary w-full py-3 text-base" onClick={submit}>
        {busy ? "Wird abgelegt …" : `Beleg für ${companyName} ablegen`}
      </button>
    </div>
  );
}
