"use client";

import { useActionState } from "react";
import type { Employee } from "@prisma/client";
import { dateOnlyKey } from "@/lib/einsatz/tz";
import { saveEmployee, type FormState } from "./actions";

export function EmployeeForm({ employee }: { employee: Employee | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEmployee.bind(null, employee?.id ?? null), {});
  const zulagen = ((employee?.lohnartDefaults as { zulagen?: string[] } | null)?.zulagen ?? []).join(", ");
  return (
    <form action={action} className="card space-y-3 p-5">
      <p className="eyebrow">{employee ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Vorname *</label>
          <input name="vorname" className="input-accent" defaultValue={employee?.vorname ?? ""} required />
        </div>
        <div>
          <label className="label">Nachname *</label>
          <input name="nachname" className="input-accent" defaultValue={employee?.nachname ?? ""} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">zvoove-Personalnummer</label>
          <input name="personalnummer" className="input-accent" defaultValue={employee?.personalnummer ?? ""} />
        </div>
        <div>
          <label className="label">zvoove-ID (optional)</label>
          <input name="zvooveId" className="input-accent" defaultValue={employee?.zvooveId ?? ""} />
        </div>
      </div>
      <div>
        <label className="label">E-Mail (für Link-Versand)</label>
        <input name="email" type="email" className="input-accent" defaultValue={employee?.email ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Mobil (WhatsApp)</label>
          <input name="mobil" className="input-accent" defaultValue={employee?.mobil ?? ""} />
        </div>
        <div>
          <label className="label">Geburtsdatum</label>
          <input name="geburtsdatum" type="date" className="input-accent" defaultValue={employee?.geburtsdatum ? dateOnlyKey(employee.geburtsdatum) : ""} />
        </div>
      </div>
      <div>
        <label className="label">Tätigkeitszulagen (kommagetrennt, z. B. stapler, rigger)</label>
        <input name="zulagen" className="input-accent" defaultValue={zulagen} placeholder="stapler, rigger" />
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" className="input-accent" defaultValue={employee?.status ?? "AKTIV"}>
          <option value="AKTIV">aktiv</option>
          <option value="INAKTIV">inaktiv</option>
        </select>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Gespeichert.</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-accent" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </button>
        {employee ? (
          <a href="/einsaetze/personal" className="btn-secondary">
            Neu
          </a>
        ) : null}
      </div>
    </form>
  );
}
