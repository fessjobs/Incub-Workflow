"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function ReceiptFilters({
  companies,
  categories,
  users,
  isAdmin,
}: {
  companies: { id: string; brandName: string }[];
  categories: { id: string; name: string }[];
  users: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`/belege?${next.toString()}`);
    },
    [params, router]
  );

  const g = (k: string) => params.get(k) ?? "";
  const hasFilters = ["q", "company", "category", "kind", "reimb", "user", "from", "to"].some((k) => g(k));

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          defaultValue={g("q")}
          placeholder="Suche: Aussteller, Anlass, Belegnummer …"
          className="input max-w-xs flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => setParam("q", e.target.value)}
        />
        <select className="input max-w-[10rem]" value={g("company")} onChange={(e) => setParam("company", e.target.value)}>
          <option value="">Alle Firmen</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.brandName}</option>
          ))}
        </select>
        <select className="input max-w-[10rem]" value={g("category")} onChange={(e) => setParam("category", e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input max-w-[9rem]" value={g("kind")} onChange={(e) => setParam("kind", e.target.value)}>
          <option value="">Alle Arten</option>
          <option value="AUSLAGE">Auslage</option>
          <option value="FIRMENZAHLUNG">Firmenzahlung</option>
          <option value="PRIVAT">Privat</option>
        </select>
        <select className="input max-w-[9rem]" value={g("reimb")} onChange={(e) => setParam("reimb", e.target.value)}>
          <option value="">Erstattung: alle</option>
          <option value="OFFEN">Offen</option>
          <option value="EINGEREICHT">Eingereicht</option>
          <option value="ERSTATTET">Erstattet</option>
        </select>
        {isAdmin && (
          <select className="input max-w-[10rem]" value={g("user")} onChange={(e) => setParam("user", e.target.value)}>
            <option value="">Alle Einreicher</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-navy-400">
          von
          <input type="date" className="input" value={g("from")} onChange={(e) => setParam("from", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-navy-400">
          bis
          <input type="date" className="input" value={g("to")} onChange={(e) => setParam("to", e.target.value)} />
        </label>
        {hasFilters && (
          <button type="button" className="text-navy-500 underline underline-offset-2" onClick={() => router.push("/belege")}>
            Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
