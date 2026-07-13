"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCard, toggleCard, type CardFormState } from "./actions";

type Card = {
  id: string;
  label: string;
  holderUserId: string | null;
  holderName: string | null;
  active: boolean;
  receiptCount: number;
};

type Holder = { id: string; name: string };

export function CardManager({ cards, holders }: { cards: Card[]; holders: Holder[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {cards.map((c) =>
          editing === c.id ? (
            <div key={c.id} className="p-4">
              <CardForm card={c} holders={holders} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={c.id} className={`flex flex-wrap items-center gap-3 p-4 ${c.active ? "" : "opacity-50"}`}>
              <span className="flex h-9 w-12 items-center justify-center rounded-md bg-navy-900 text-[10px] font-bold tracking-widest text-white dark:bg-white dark:text-navy-900">
                AMEX
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="truncate text-xs text-navy-400">
                  {c.holderName ? `Inhaber: ${c.holderName}` : "Kein Inhaber hinterlegt"} · {c.receiptCount} Belege
                </p>
              </div>
              <button type="button" className="btn-secondary !px-3 !py-1.5" onClick={() => setEditing(c.id)}>
                Bearbeiten
              </button>
              <ToggleButton id={c.id} active={c.active} />
            </div>
          )
        )}
        {cards.length === 0 && (
          <p className="p-4 text-sm text-navy-400">
            Noch keine Firmenkarten – lege für jeden Gesellschafter eine an (z. B. „Amex Maik“).
          </p>
        )}
      </div>

      {creating ? (
        <div className="card p-4">
          <CardForm card={null} holders={holders} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          + Neue Karte
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
        await toggleCard(id);
        router.refresh();
      }}
    >
      {active ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}

function CardForm({ card, holders, onDone }: { card: Card | null; holders: Holder[]; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CardFormState, FormData>(
    async (prev, fd) => {
      const res = await saveCard(card?.id ?? null, prev, fd);
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
          <label className="label">Bezeichnung *</label>
          <input name="label" required defaultValue={card?.label ?? ""} className="input" placeholder="z. B. Amex Maik" />
        </div>
        <div>
          <label className="label">Karteninhaber</label>
          <select name="holderUserId" defaultValue={card?.holderUserId ?? ""} className="input">
            <option value="">– nicht zugeordnet –</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
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
