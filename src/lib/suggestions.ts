import { db } from "@/lib/db";

// Mitlernen: Vorschläge aus früheren, bereits abgelegten Belegen desselben
// Ausstellers. Deine Korrekturen von gestern sind der Vorschlag von morgen –
// je öfter ein Aussteller derselben Firma/Kategorie zugeordnet wurde, desto
// sicherer wird die Vorbelegung. Historie schlägt den Claude-Vorschlag.
export type HistorySuggestion = {
  companyId: string | null;
  categoryId: string | null;
  kind: string | null;
  paymentMethod: string | null;
  purpose: string | null;
  matchCount: number;
};

function normalizeVendor(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|co|ohg|ug|e\.k\.|mbh|&)\b/g, "")
    .replace(/[^a-zäöüß0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function majority<T>(values: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export async function suggestFromHistory(
  organizationId: string,
  vendor: string | null
): Promise<HistorySuggestion | null> {
  if (!vendor || vendor.trim().length < 2) return null;
  const norm = normalizeVendor(vendor);
  if (!norm) return null;

  // Kandidaten: jüngste abgelegte Belege der Organisation mit ähnlichem Aussteller.
  // Erst exakter (normalisierter) Treffer, sonst Teilstring in beide Richtungen.
  const recent = await db.receipt.findMany({
    where: { organizationId, status: "ABGELEGT", vendor: { not: "" } },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      vendor: true,
      companyId: true,
      categoryId: true,
      kind: true,
      paymentMethod: true,
      purpose: true,
    },
  });

  const exact = recent.filter((r) => normalizeVendor(r.vendor) === norm);
  const fuzzy =
    exact.length > 0
      ? exact
      : recent.filter((r) => {
          const n = normalizeVendor(r.vendor);
          return n.length >= 3 && (n.includes(norm) || norm.includes(n));
        });

  const matches = fuzzy.slice(0, 25);
  if (matches.length === 0) return null;

  return {
    companyId: majority(matches.map((m) => m.companyId)),
    categoryId: majority(matches.map((m) => m.categoryId)),
    kind: majority(matches.map((m) => m.kind as string)),
    paymentMethod: majority(matches.map((m) => (m.paymentMethod === "UNBEKANNT" ? null : (m.paymentMethod as string)))),
    purpose: matches.find((m) => m.purpose)?.purpose ?? null,
    matchCount: matches.length,
  };
}
