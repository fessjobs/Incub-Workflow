"use client";

import { useActionState, useState } from "react";
import {
  createCategory,
  renameCategory,
  toggleCategoryActive,
  deleteCategory,
  type CategoryFormState,
} from "./actions";

type Category = {
  id: string;
  name: string;
  isHospitality: boolean;
  active: boolean;
  receiptCount: number;
};

export function CategoryList({ categories }: { categories: Category[] }) {
  const [createState, createAction, creating] = useActionState<CategoryFormState, FormData>(
    createCategory,
    {}
  );

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
        {categories.length === 0 && (
          <p className="p-4 text-sm text-navy-400">Noch keine Kategorien angelegt.</p>
        )}
      </div>

      <form action={createAction} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="new-category">
            Neue Kategorie
          </label>
          <input id="new-category" name="name" required className="input" placeholder="z. B. Fortbildung" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-navy-500 dark:text-navy-300">
          <input type="checkbox" name="isHospitality" className="h-4 w-4 rounded accent-navy-900" />
          Bewirtungs-Zusatzfelder
        </label>
        <button type="submit" disabled={creating} className="btn-primary">
          {creating ? "…" : "Hinzufügen"}
        </button>
        {createState.error && (
          <p className="w-full text-sm text-red-700 dark:text-red-300">{createState.error}</p>
        )}
      </form>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [state, renameAction, renaming] = useActionState<CategoryFormState, FormData>(
    async (prev, formData) => {
      const result = await renameCategory(category.id, prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    {}
  );

  return (
    <div className={`flex flex-wrap items-center gap-3 p-4 ${category.active ? "" : "opacity-50"}`}>
      {editing ? (
        <form action={renameAction} className="flex flex-1 items-center gap-2">
          <input name="name" defaultValue={category.name} required autoFocus className="input max-w-60" />
          <button type="submit" disabled={renaming} className="btn-primary !px-3 !py-1.5">
            Speichern
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary !px-3 !py-1.5">
            Abbrechen
          </button>
          {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium">
            {category.name}
            {category.isHospitality && (
              <span className="badge ml-2 bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
                Bewirtung
              </span>
            )}
            {!category.active && (
              <span className="badge ml-2 bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
                inaktiv
              </span>
            )}
          </span>
          <span className="text-xs text-navy-400">{category.receiptCount} Belege</span>
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary !px-3 !py-1.5">
            Umbenennen
          </button>
          <form action={toggleCategoryActive.bind(null, category.id)}>
            <button type="submit" className="btn-secondary !px-3 !py-1.5">
              {category.active ? "Deaktivieren" : "Aktivieren"}
            </button>
          </form>
          <form action={deleteCategory.bind(null, category.id)}>
            <button
              type="submit"
              className="btn-danger"
              title={
                category.receiptCount > 0
                  ? "Hat Belege – wird stattdessen deaktiviert"
                  : "Endgültig löschen"
              }
            >
              Löschen
            </button>
          </form>
        </>
      )}
    </div>
  );
}
