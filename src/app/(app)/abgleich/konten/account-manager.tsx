"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBankAccount, toggleBankAccount, type AccountFormState } from "../actions";

type Account = {
  id: string;
  name: string;
  iban: string | null;
  companyId: string | null;
  companyName: string | null;
  isPrivate: boolean;
  active: boolean;
  txnCount: number;
};

export function AccountManager({
  accounts,
  companies,
}: {
  accounts: Account[];
  companies: { id: string; brandName: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {accounts.map((a) =>
          editing === a.id ? (
            <div key={a.id} className="p-4">
              <AccountForm account={a} companies={companies} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={a.id} className={`flex flex-wrap items-center gap-3 p-4 ${a.active ? "" : "opacity-50"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-navy-400">
                  {a.isPrivate ? "Privat" : a.companyName || "Firma nicht zugeordnet"}
                  {a.iban ? ` · ${a.iban}` : ""} · {a.txnCount} Buchungen
                </p>
              </div>
              <button type="button" className="btn-secondary !px-3 !py-1.5" onClick={() => setEditing(a.id)}>
                Bearbeiten
              </button>
              <ToggleButton id={a.id} active={a.active} />
            </div>
          )
        )}
        {accounts.length === 0 && <p className="p-4 text-sm text-navy-400">Noch keine Konten.</p>}
      </div>

      {creating ? (
        <div className="card p-4">
          <AccountForm account={null} companies={companies} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          + Neues Konto
        </button>
      )}
    </div>
  );
}

function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-secondary !px-3 !py-1.5"
      onClick={async () => {
        await toggleBankAccount(id);
        router.refresh();
      }}
    >
      {active ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}

function AccountForm({
  account,
  companies,
  onDone,
}: {
  account: Account | null;
  companies: { id: string; brandName: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPrivate, setIsPrivate] = useState(account?.isPrivate ?? false);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    async (prev, fd) => {
      const res = await saveBankAccount(account?.id ?? null, prev, fd);
      if (res.ok) {
        onDone();
        router.refresh();
      }
      return res;
    },
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Konto-Name *</label>
          <input name="name" required defaultValue={account?.name ?? ""} className="input" placeholder="z. B. Sparkasse Geschäft" />
        </div>
        <div>
          <label className="label">IBAN</label>
          <input name="iban" defaultValue={account?.iban ?? ""} className="input" placeholder="DE.." />
        </div>
        <div>
          <label className="label">Firma</label>
          <select name="companyId" defaultValue={account?.companyId ?? ""} disabled={isPrivate} className="input">
            <option value="">– keine –</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.brandName}</option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="isPrivate" defaultChecked={account?.isPrivate ?? false} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4 rounded accent-navy-900" />
          Privates Konto
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "…" : "Speichern"}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
