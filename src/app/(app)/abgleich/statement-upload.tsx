"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importStatement } from "./actions";

export function StatementUpload({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onFile(file: File) {
    if (!accountId) {
      setError("Bitte zuerst ein Konto wählen.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await importStatement(accountId, fd);
    setBusy(false);
    if (res.ok) {
      setResult(
        `${res.imported} importiert · ${res.matched} automatisch zugeordnet · ${res.skipped} übersprungen (Dubletten).`
      );
      router.refresh();
    } else {
      setError(res.error ?? "Import fehlgeschlagen.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  if (accounts.length === 0) return null;

  return (
    <div className="card space-y-3 p-4">
      <p className="eyebrow">Auszug importieren</p>
      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Wird importiert …" : "CSV / PDF wählen"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <span className="text-xs text-navy-400">CSV (empfohlen) oder PDF-Auszug</span>
      </div>
      {result && <p className="text-sm text-emerald-700 dark:text-emerald-400">{result}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
