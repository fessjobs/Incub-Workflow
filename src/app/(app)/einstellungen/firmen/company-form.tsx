"use client";

import { useActionState } from "react";
import type { CompanyFormState } from "./actions";

export type CompanyFormValues = {
  brandName?: string;
  shortCode?: string;
  legalName?: string | null;
  address?: string | null;
  location?: string | null;
  color?: string | null;
  isPrivate?: boolean;
};

export function CompanyForm({
  action,
  initial = {},
  submitLabel,
}: {
  action: (prev: CompanyFormState, formData: FormData) => Promise<CompanyFormState>;
  initial?: CompanyFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<CompanyFormState, FormData>(action, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <div>
        <p className="eyebrow">Marke</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="brandName">
              Markenname *
            </label>
            <input
              id="brandName"
              name="brandName"
              required
              defaultValue={initial.brandName ?? ""}
              className="input"
              placeholder="z. B. fess.jobs"
            />
          </div>
          <div>
            <label className="label" htmlFor="shortCode">
              Kürzel (Belegnummern) *
            </label>
            <input
              id="shortCode"
              name="shortCode"
              required
              maxLength={8}
              defaultValue={initial.shortCode ?? ""}
              className="input uppercase"
              placeholder="z. B. FJ"
            />
          </div>
          <div>
            <label className="label" htmlFor="location">
              Standort (Untertitel im Auswahl-Chip)
            </label>
            <input
              id="location"
              name="location"
              defaultValue={initial.location ?? ""}
              className="input"
              placeholder="z. B. Idar-Oberstein"
            />
          </div>
          <div>
            <label className="label" htmlFor="color">
              Farbe (Chip)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={initial.color ?? "#0B1220"}
                className="h-9 w-14 cursor-pointer rounded-lg border border-navy-200 bg-white p-1 dark:border-navy-700 dark:bg-navy-800"
              />
              <span className="text-xs text-navy-400">Für die Firmen-Auswahl im Erfassungs-Flow</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow">Rechtsträger (erscheint auf dem Beiblatt)</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="legalName">
              Juristischer Firmenname
            </label>
            <input
              id="legalName"
              name="legalName"
              defaultValue={initial.legalName ?? ""}
              className="input"
              placeholder="z. B. FESS Recruitment GmbH & Co. KG"
            />
          </div>
          <div>
            <label className="label" htmlFor="address">
              Anschrift
            </label>
            <input
              id="address"
              name="address"
              defaultValue={initial.address ?? ""}
              className="input"
              placeholder="Straße Nr., PLZ Ort"
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPrivate"
          defaultChecked={initial.isPrivate ?? false}
          className="h-4 w-4 rounded border-navy-300 accent-navy-900"
        />
        Pseudo-Firma für private Ausgaben („Privat“)
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Wird gespeichert …" : submitLabel}
      </button>
    </form>
  );
}
