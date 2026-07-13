"use client";

import { useActionState } from "react";
import { register, type RegisterState } from "./actions";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(register, {});

  if (state.pending) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Konto erstellt</p>
        <p className="text-sm text-navy-400">
          Dein Konto ({state.values?.email}) wartet jetzt auf die Freischaltung durch den
          Admin. Sobald es freigeschaltet ist, kannst du dich anmelden.
        </p>
      </div>
    );
  }

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
