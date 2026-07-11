"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateReimbursement } from "../actions";

export function ReimbursementControl({ receiptId, status }: { receiptId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    await updateReimbursement(receiptId, next as "OFFEN" | "EINGEREICHT" | "ERSTATTET");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <p className="eyebrow mb-3">Erstattung {saving && "…"}</p>
      <div className="space-y-1.5">
        {[
          { v: "OFFEN", l: "Offen" },
          { v: "EINGEREICHT", l: "Eingereicht" },
          { v: "ERSTATTET", l: "Erstattet" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => change(o.v)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
              value === o.v
                ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
