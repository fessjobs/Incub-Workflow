"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function ReceiptFilters({
  companies,
  categories,
  users,
  cards,
  isAdmin,
}: {
  companies: { id: string; brandName: string }[];
  categories: { id: string; name: string }[];
  users: { id: string; name: string }[];
  cards: { id: string; label: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/belege?${next.toString()}`);
    },
    [params, router]
  );
  const setParam = useCallback((key: string, value: string) => setParams({ [key]: value }), [setParams]);

  const g = (k: string) => params.get(k) ?? "";
  const hasFilters = ["q", "company", "category", "kind", "reimb", "user", "from", "to", "pay", "card", "ma", "datev"].some((k) => g(k));

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
        <select className="input max-w-[11rem]" value={g("card") ? `card:${g("card")}` : g("pay")} onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("card:")) setParams({ pay: "", card: v.slice(5) });
          else setParams({ card: "", pay: v });
        }}>
          <option value="">Zahlungsart: alle</option>
          <option value="BAR">Bar</option>
          <option value="PRIVATE_KARTE">Private Karte</option>
          <option value="FIRMENKARTE">Firmenkarte (alle)</option>
          {cards.map((c) => (
            <option key={c.id} value={`card:${c.id}`}>↳ {c.label}</option>
          ))}
        </select>
        {isAdmin && (
          <select className="input max-w-[10rem]" value={g("user")} onChange={(e) => setParam("user", e.target.value)}>
            <option value="">Alle Einreicher</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        {isAdmin && (
          <select className="input max-w-[11rem]" value={g("datev")} onChange={(e) => setParam("datev", e.target.value)}>
            <option value="">DATEV: alle</option>
            <option value="offen">Noch nicht hochgeladen</option>
            <option value="hochgeladen">In DATEV hochgeladen</option>
          </select>
        )}
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-navy-500 dark:text-navy-300">
            <input
              type="checkbox"
              checked={g("ma") === "1"}
              onChange={(e) => setParam("ma", e.target.checked ? "1" : "")}
              className="h-4 w-4 rounded accent-navy-900"
            />
            nur Auslagen Mitarbeiter
          </label>
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
