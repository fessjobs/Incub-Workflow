"use client";

import { useActionState } from "react";
import { register, type RegisterState } from "./actions";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(register, {});

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" required autoFocus defaultValue={state.values?.name ?? ""} className="input" placeholder="Vor- und Nachname" />
      </div>
      <div>
        <label htmlFor="email" className="label">E-Mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? ""} className="input" placeholder="name@firma.de" />
      </div>
      <div>
        <label htmlFor="password" className="label">Passwort (min. 8 Zeichen)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
      </div>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Wird erstellt …" : "Konto erstellen"}
      </button>
    </form>
  );
}
