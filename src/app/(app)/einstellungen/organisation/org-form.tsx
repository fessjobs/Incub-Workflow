"use client";

import { useActionState } from "react";
import { updateOrganization, type OrgFormState } from "./actions";

export function OrgForm({
  initial,
}: {
  initial: {
    name: string;
    brandName: string;
    tagline: string;
    primaryColor: string;
    storagePath: string;
  };
}) {
  const [state, formAction, pending] = useActionState<OrgFormState, FormData>(
    updateOrganization,
    {}
  );

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name der Organisation *
          </label>
          <input id="name" name="name" required defaultValue={initial.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="brandName">
            Produktname (Wortmarke) *
          </label>
          <input
            id="brandName"
            name="brandName"
            required
            defaultValue={initial.brandName}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="tagline">
            Tagline
          </label>
          <input id="tagline" name="tagline" defaultValue={initial.tagline} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="primaryColor">
            Primärfarbe
          </label>
          <input
            id="primaryColor"
            name="primaryColor"
            type="color"
            defaultValue={initial.primaryColor}
            className="h-9 w-14 cursor-pointer rounded-lg border border-navy-200 bg-white p-1 dark:border-navy-700 dark:bg-navy-800"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="storagePath">
            Ablagepfad (Wurzel der Beleg-Ordnerstruktur) *
          </label>
          <input
            id="storagePath"
            name="storagePath"
            required
            defaultValue={initial.storagePath}
            className="input font-mono text-xs"
          />
          <p className="mt-1 text-xs text-navy-400">
            Ab Sprint 2: {"{Firma}/{Jahr}/{MM-Monat}/{Belegnummer}_{Aussteller}_{Betrag}.pdf"}
          </p>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && !state.error && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Gespeichert.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Wird gespeichert …" : "Speichern"}
      </button>
    </form>
  );
}
