"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleDemoData } from "./actions";

export function DemoControls({ demoCount }: { demoCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(load: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await toggleDemoData(load);
    setBusy(false);
    if (res.ok) {
      setMsg(load ? `${res.count} Demo-Belege geladen.` : "Demo-Daten entfernt.");
      router.refresh();
    }
  }

  return (
    <div className="card space-y-3 p-6">
      <p className="eyebrow">Demo-Daten</p>
      <p className="text-sm text-navy-400">
        Beispielbelege, Auswertungen und ein Demo-Konto für Produktvorführungen. Klar als Demo
        markiert und jederzeit rückstandslos entfernbar.
        {demoCount > 0 && ` Aktuell ${demoCount} Demo-Belege aktiv.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="btn-primary" onClick={() => run(true)}>
          {busy ? "…" : demoCount > 0 ? "Demo-Daten neu laden" : "Demo-Daten laden"}
        </button>
        {demoCount > 0 && (
          <button type="button" disabled={busy} className="btn-secondary" onClick={() => run(false)}>
            Demo-Daten entfernen
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
    </div>
  );
}
