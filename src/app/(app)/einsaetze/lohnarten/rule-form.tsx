"use client";

import { useActionState } from "react";
import { addDeduction, saveWageRule, type FormState } from "./actions";

type RuleInput = { id: string; name: string; typ: string; lohnart: string; faktor: number; aktiv: boolean; sortOrder: number; bedingung: string } | null;

export function RuleForm({ rule, typLabels }: { rule: RuleInput; typLabels: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWageRule.bind(null, rule?.id ?? null), {});
  return (
    <form action={action} className="card space-y-3 p-5">
      <p className="eyebrow">{rule ? "Regel bearbeiten" : "Neue Regel"}</p>
      <div>
        <label className="label">Name *</label>
        <input name="name" className="input-accent" defaultValue={rule?.name ?? ""} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Typ</label>
          <select name="typ" className="input-accent" defaultValue={rule?.typ ?? "NORMAL"}>
            {Object.entries(typLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Lohnart (zvoove) *</label>
          <input name="lohnart" className="input-accent" defaultValue={rule?.lohnart ?? ""} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Faktor</label>
          <input name="faktor" className="input-accent" inputMode="decimal" defaultValue={rule ? String(rule.faktor) : "1"} />
        </div>
        <div>
          <label className="label">Reihenfolge</label>
          <input name="sortOrder" type="number" className="input-accent" defaultValue={rule?.sortOrder ?? 0} />
        </div>
      </div>
      <div>
        <label className="label">Bedingung (JSON)</label>
        <textarea name="bedingung" className="input-accent min-h-[80px] font-mono text-xs" defaultValue={rule?.bedingung ?? "{}"} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aktiv" defaultChecked={rule?.aktiv ?? true} /> aktiv
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Gespeichert.</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-accent" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </button>
        {rule ? (
          <a href="/einsaetze/lohnarten" className="btn-secondary">
            Neu
          </a>
        ) : null}
      </div>
    </form>
  );
}

export function DeductionForm({ employees }: { employees: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addDeduction, {});
  return (
    <form action={action} className="card space-y-3 p-5">
      <p className="eyebrow">Abzug erfassen</p>
      <div>
        <label className="label">Mitarbeiter *</label>
        <select name="employeeId" className="input-accent" required defaultValue="">
          <option value="" disabled>
            – wählen –
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Datum *</label>
          <input name="datum" type="date" className="input-accent" required />
        </div>
        <div>
          <label className="label">Lohnart</label>
          <input name="lohnart" className="input-accent" defaultValue="900" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Stunden</label>
          <input name="stunden" className="input-accent" inputMode="decimal" placeholder="z. B. 1,5" />
        </div>
        <div>
          <label className="label">Betrag €</label>
          <input name="betrag" className="input-accent" inputMode="decimal" placeholder="z. B. 25,00" />
        </div>
      </div>
      <div>
        <label className="label">Grund *</label>
        <input name="grund" className="input-accent" required />
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Gespeichert.</p> : null}
      <button type="submit" className="btn-accent" disabled={pending}>
        {pending ? "Speichern …" : "Abzug speichern"}
      </button>
    </form>
  );
}
