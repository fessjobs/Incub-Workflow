import { z } from "zod";
import { sicherungsAnfrage, type SicherungsAnfrage } from "@/lib/neu/sicherung-bereiche";

// ?monat=2026-09&bereiche=stundennachweis,auslagen&originale=1
const query = z.object({ monat: z.string(), bereiche: z.string(), originale: z.string().optional() });

export function leseAnfrage(url: string): { ok: true; anfrage: SicherungsAnfrage } | { ok: false } {
  const u = new URL(url);
  const q = query.safeParse({ monat: u.searchParams.get("monat") ?? "", bereiche: u.searchParams.get("bereiche") ?? "", originale: u.searchParams.get("originale") ?? undefined });
  if (!q.success) return { ok: false };
  const bereiche = [...new Set(q.data.bereiche.split(",").map((x) => x.trim()).filter(Boolean))];
  const r = sicherungsAnfrage.safeParse({ monat: q.data.monat, bereiche, originale: q.data.originale === "1" });
  return r.success ? { ok: true, anfrage: r.data } : { ok: false };
}

