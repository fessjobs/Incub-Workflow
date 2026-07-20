// Matching-Logik Kontoauszug ↔ Belege (Spec Abschnitt 8).
// Betrag + Datum (±3 Tage) + Fuzzy auf Aussteller/Verwendungszweck.

export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[àáâä]/g, "a")
    .replace(/[éèê]/g, "e")
    .replace(/[öó]/g, "o")
    .replace(/[üú]/g, "u")
    .replace(/ß/g, "ss")
    .replace(/\b(gmbh|ag|kg|co|ohg|ug|mbh|e\.k\.|und|and|the|der|die|das)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Token-Überlappung (Jaccard) als einfacher, robuster Fuzzy-Score 0..1
export function textScore(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter((t) => t.length >= 3));
  const tb = new Set(normalizeText(b).split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

export type MatchCandidate = {
  receiptId: string;
  score: number; // höher = besser
  exactAmount: boolean;
  dateDiff: number;
};

type ReceiptLike = {
  id: string;
  grossAmount: number;
  receiptDate: Date;
  vendor: string;
};

// Findet passende Belege zu einer (Ausgaben-)Buchung. amount kommt negativ vom
// Konto; verglichen wird der Betrag betragsmäßig.
export function matchReceipts(
  txn: { amount: number; bookingDate: Date; counterparty: string | null; purpose: string | null },
  receipts: ReceiptLike[]
): MatchCandidate[] {
  const target = Math.abs(txn.amount);
  const haystack = `${txn.counterparty ?? ""} ${txn.purpose ?? ""}`;
  const out: MatchCandidate[] = [];

  for (const r of receipts) {
    const amountDiff = Math.abs(Number(r.grossAmount) - target);
    const exactAmount = amountDiff < 0.005;
    // Betrag muss (nahezu) exakt passen
    if (amountDiff > 0.02) continue;
    const dateDiff = daysBetween(r.receiptDate, txn.bookingDate);
    if (dateDiff > 3) continue;

    const tScore = textScore(haystack, r.vendor);
    // Score: Exaktbetrag + Datumsnähe + Textähnlichkeit
    const score = (exactAmount ? 1 : 0.6) + (3 - dateDiff) * 0.1 + tScore;
    out.push({ receiptId: r.id, score, exactAmount, dateDiff });
  }

  return out.sort((a, b) => b.score - a.score);
}

// Reicht die beste Übereinstimmung für einen automatischen Vorschlag?
export function isConfidentMatch(c: MatchCandidate | undefined): boolean {
  return Boolean(c && c.exactAmount && c.dateDiff <= 3);
}

// ── Kombinations-Matching: Sammel-Abbuchung = Summe mehrerer Einzelbelege ────
// Beispiel Amazon: mehrere Einzelrechnungen, eine gebündelte Abbuchung.
// Gesucht werden Beleg-Gruppen, die zusammen exakt den Abbuchungsbetrag
// ergeben – bevorzugt gleicher Tag + gleicher Lieferant, sonst gleicher Tag.

export type ComboCandidate = {
  receiptIds: string[];
  sameVendor: boolean; // alle Belege vom selben Lieferanten?
};

const COMBO_MAX_SIZE = 6; // max. Belege pro Kombination
const COMBO_MAX_GROUP = 20; // größere Gruppen kosten zu viel Rechenzeit
const COMBO_DATE_WINDOW = 14; // Belegdatum darf bis 14 Tage um die Buchung liegen
const TOLERANCE = 0.011;

// Teilmengen-Suche mit Pruning: Beträge absteigend, Abbruch wenn Restsumme
// nicht mehr reichen kann.
function findSubsets(items: ReceiptLike[], target: number, maxResults: number): string[][] {
  const sorted = [...items].sort((a, b) => b.grossAmount - a.grossAmount).slice(0, COMBO_MAX_GROUP);
  // Suffix-Summen für "kann der Rest überhaupt noch reichen?"
  const suffix: number[] = new Array(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + sorted[i].grossAmount;

  const results: string[][] = [];
  const pick: number[] = [];

  function dfs(start: number, remaining: number) {
    if (results.length >= maxResults) return;
    if (Math.abs(remaining) <= TOLERANCE && pick.length >= 2) {
      results.push(pick.map((i) => sorted[i].id));
      return;
    }
    if (remaining < -TOLERANCE || pick.length >= COMBO_MAX_SIZE) return;
    if (suffix[start] < remaining - TOLERANCE) return; // Rest reicht nicht mehr
    for (let i = start; i < sorted.length; i++) {
      if (sorted[i].grossAmount > remaining + TOLERANCE) continue;
      pick.push(i);
      dfs(i + 1, remaining - sorted[i].grossAmount);
      pick.pop();
      if (results.length >= maxResults) return;
    }
  }
  dfs(0, target);
  return results;
}

export function matchCombinations(
  txn: { amount: number; bookingDate: Date },
  receipts: ReceiptLike[],
  maxResults = 2
): ComboCandidate[] {
  const target = Math.abs(txn.amount);
  if (target < 0.02) return [];

  // Nur Belege, die einzeln kleiner als der Zielbetrag und zeitlich plausibel sind
  const pool = receipts.filter(
    (r) =>
      r.grossAmount > 0.005 &&
      r.grossAmount < target - 0.005 &&
      daysBetween(r.receiptDate, txn.bookingDate) <= COMBO_DATE_WINDOW
  );
  if (pool.length < 2) return [];

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const out: ComboCandidate[] = [];
  const seen = new Set<string>();
  const push = (ids: string[], sameVendor: boolean) => {
    const sig = [...ids].sort().join("|");
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ receiptIds: ids, sameVendor });
  };

  // 1) Gleicher Tag + gleicher Lieferant
  const byVendorDay = new Map<string, ReceiptLike[]>();
  for (const r of pool) {
    const v = normalizeText(r.vendor);
    if (!v) continue;
    const key = `${dayKey(r.receiptDate)}|${v}`;
    byVendorDay.set(key, [...(byVendorDay.get(key) ?? []), r]);
  }
  for (const group of byVendorDay.values()) {
    if (out.length >= maxResults) break;
    if (group.length < 2) continue;
    for (const ids of findSubsets(group, target, maxResults - out.length)) push(ids, true);
  }

  // 2) Nur gleicher Tag (verschiedene Lieferanten)
  if (out.length < maxResults) {
    const byDay = new Map<string, ReceiptLike[]>();
    for (const r of pool) {
      const key = dayKey(r.receiptDate);
      byDay.set(key, [...(byDay.get(key) ?? []), r]);
    }
    for (const group of byDay.values()) {
      if (out.length >= maxResults) break;
      if (group.length < 2) continue;
      for (const ids of findSubsets(group, target, maxResults - out.length)) push(ids, false);
    }
  }

  // Gleicher Lieferant zuerst – das ist der stärkere Hinweis
  return out.sort((a, b) => Number(b.sameVendor) - Number(a.sameVendor)).slice(0, maxResults);
}
