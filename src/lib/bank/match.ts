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
