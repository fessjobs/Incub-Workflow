"use client";

import { useActionState } from "react";
import type { UserFormState } from "./actions";

export type UserFormValues = {
  name?: string;
  email?: string;
  role?: "ADMIN" | "BUCHHALTUNG" | "MEMBER" | "EINREICHER";
  companyIds?: string[];
};

export function UserForm({
  action,
  companies,
  initial = {},
  isSelf = false,
  isNew = false,
}: {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  companies: { id: string; brandName: string }[];
  initial?: UserFormValues;
  isSelf?: boolean;
  isNew?: boolean;
}) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name *
          </label>
          <input id="name" name="name" required defaultValue={initial.name ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            E-Mail *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={initial.email ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="role">
            Rolle *
          </label>
          <select
            id="role"
            name="role"
            defaultValue={initial.role ?? "MEMBER"}
            disabled={isSelf}
            className="input"
          >
            <option value="MEMBER">Mitglied – sieht nur eigene Belege</option>
            <option value="ADMIN">Admin / Gesellschafter – sieht und verwaltet alles</option>
            <option value="BUCHHALTUNG">Buchhaltung – alle Belege lesen + DATEV-Export</option>
            <option value="EINREICHER">Mitarbeiter-Link – nur Belege einreichen</option>
          </select>
          {isSelf && <input type="hidden" name="role" value="ADMIN" />}
        </div>
        <div>
          <label className="label" htmlFor="password">
            {isNew ? "Passwort * (min. 8 Zeichen)" : "Neues Passwort (leer = unverändert)"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required={isNew}
            minLength={isNew ? 8 : undefined}
            autoComplete="new-password"
            className="input"
          />
        </div>
      </div>

      <fieldset>
        <legend className="label">
          Firmen-Einschränkung (keine Auswahl = darf für alle Firmen einreichen)
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {companies.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="companyIds"
                value={c.id}
                defaultChecked={initial.companyIds?.includes(c.id) ?? false}
                className="h-4 w-4 rounded accent-navy-900"
              />
              {c.brandName}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Wird gespeichert …" : isNew ? "Nutzer anlegen" : "Änderungen speichern"}
      </button>
    </form>
  );
}
