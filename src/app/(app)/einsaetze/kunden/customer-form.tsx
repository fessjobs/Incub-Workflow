"use client";

import { useActionState } from "react";
import type { Customer } from "@prisma/client";
import { saveCustomer, type FormState } from "./actions";

export function CustomerForm({ customer, bundeslaender }: { customer: Customer | null; bundeslaender: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCustomer.bind(null, customer?.id ?? null), {});
  return (
    <form action={action} className="card space-y-3 p-5">
      <p className="eyebrow">{customer ? "Kunde bearbeiten" : "Neuer Kunde"}</p>
      <div>
        <label className="label">Name *</label>
        <input name="name" className="input-accent" defaultValue={customer?.name ?? ""} required />
      </div>
      <div>
        <label className="label">Adresse</label>
        <input name="adresse" className="input-accent" defaultValue={customer?.adresse ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">USt-ID</label>
          <input name="ustid" className="input-accent" defaultValue={customer?.ustid ?? ""} />
        </div>
        <div>
          <label className="label">AÜ-Vertrag</label>
          <input name="aueVertragRef" className="input-accent" defaultValue={customer?.aueVertragRef ?? ""} />
        </div>
      </div>
      <div>
        <label className="label">Ansprechpartner</label>
        <input name="ansprechpartner" className="input-accent" defaultValue={customer?.ansprechpartner ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">E-Mail</label>
          <input name="ansprechpartnerEmail" type="email" className="input-accent" defaultValue={customer?.ansprechpartnerEmail ?? ""} />
        </div>
        <div>
          <label className="label">Telefon</label>
          <input name="ansprechpartnerTelefon" className="input-accent" defaultValue={customer?.ansprechpartnerTelefon ?? ""} />
        </div>
      </div>
      <div>
        <label className="label">Standard-Einsatzort</label>
        <input name="standardEinsatzort" className="input-accent" defaultValue={customer?.standardEinsatzort ?? ""} />
      </div>
      <div>
        <label className="label">Bundesland (Feiertage)</label>
        <select name="bundesland" className="input-accent" defaultValue={customer?.bundesland ?? ""}>
          <option value="">– aus Einsatzort ableiten –</option>
          {Object.entries(bundeslaender).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aktiv" defaultChecked={customer?.aktiv ?? true} /> aktiv
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Gespeichert.</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-accent" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </button>
        {customer ? (
          <a href="/einsaetze/kunden" className="btn-secondary">
            Neu
          </a>
        ) : null}
      </div>
    </form>
  );
}
