"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBankAccount, toggleBankAccount, type AccountFormState } from "../actions";

type Account = {
  id: string;
  name: string;
  iban: string | null;
  isPrivate: boolean;
  active: boolean;
  ownerName: string | null;
  txnCount: number;
};

export function AccountManager({
  accounts,
  showOwner,
}: {
  accounts: Account[];
  showOwner: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {accounts.map((a) =>
          editing === a.id ? (
            <div key={a.id} className="p-4">
              <AccountForm account={a} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={a.id} className={`flex flex-wrap items-center gap-3 p-4 ${a.active ? "" : "opacity-50"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-navy-400">
                  {a.isPrivate ? "Privat" : "Geschäftlich"}
                  {a.iban ? ` · ${a.iban}` : ""}
                  {showOwner && a.ownerName ? ` · ${a.ownerName}` : ""} · {a.txnCount} Buchungen
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
          <AccountForm account={null} onDone={() => setCreating(false)} />
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
  onDone,
}: {
  account: Account | null;
  onDone: () => void;
}) {
  const router = useRouter();
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
          <input name="name" required defaultValue={account?.name ?? ""} className="input" placeholder="z. B. Sparkasse privat" />
        </div>
        <div>
          <label className="label">IBAN</label>
          <input name="iban" defaultValue={account?.iban ?? ""} className="input" placeholder="DE.." />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isPrivate" defaultChecked={account?.isPrivate ?? true} className="h-4 w-4 rounded accent-navy-900" />
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
