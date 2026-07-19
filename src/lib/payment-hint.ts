// Zahlungs-Hinweis für Entwurfsbelege: Gibt es zu einem Entwurf bereits eine
// passende Abbuchung auf einem hinterlegten Konto (Bankkonto/Firmenkarte)?
// Gleiche Match-Logik wie der Zahlungs-Check (Betrag ±0,005 €, Buchung 3 Tage
// vor bis 30 Tage nach Belegdatum), aber gesammelt in einer Abfrage.
import { db } from "@/lib/db";
import { formatEuro, formatDate } from "@/lib/format";

export type PaymentHint = {
  label: string; // "Amex Maik · −42,90 € · 03.07.2026"
  linked: boolean; // schon fest mit dem Beleg verknüpft?
};

type DraftInfo = { id: string; grossAmount: number; receiptDate: Date };

function window(receiptDate: Date): { from: Date; to: Date } {
  const from = new Date(receiptDate);
  from.setDate(from.getDate() - 3);
  const to = new Date(receiptDate);
  to.setDate(to.getDate() + 30);
  return { from, to };
}

export async function findPaymentHints(
  user: { id: string; role: string; organizationId: string },
  drafts: DraftInfo[]
): Promise<Map<string, PaymentHint>> {
  const hints = new Map<string, PaymentHint>();
  const candidates = drafts.filter((d) => d.grossAmount > 0).slice(0, 50);
  if (candidates.length === 0) return hints;

  // Nur Konten, die der Nutzer sehen darf (Mitglied: eigene; Admin: alle)
  const accountFilter = user.role === "ADMIN" ? {} : { userId: user.id };

  const txns = await db.bankTransaction.findMany({
    where: {
      organizationId: user.organizationId,
      bankAccount: accountFilter,
      ignored: false,
      OR: [
        // Bereits mit einem der Entwürfe verknüpft
        { matchedReceiptId: { in: candidates.map((d) => d.id) } },
        // Oder: noch frei und passt zu Betrag + Zeitfenster eines Entwurfs
        ...candidates.map((d) => {
          const { from, to } = window(d.receiptDate);
          return {
            matchedReceiptId: null,
            amount: { gte: -d.grossAmount - 0.005, lte: -d.grossAmount + 0.005 },
            bookingDate: { gte: from, lte: to },
          };
        }),
      ],
    },
    orderBy: { bookingDate: "asc" },
    include: { bankAccount: { select: { name: true } } },
  });
  if (txns.length === 0) return hints;

  for (const d of candidates) {
    const { from, to } = window(d.receiptDate);
    const linked = txns.find((t) => t.matchedReceiptId === d.id);
    const match =
      linked ??
      txns.find(
        (t) =>
          t.matchedReceiptId === null &&
          Math.abs(Number(t.amount) + d.grossAmount) <= 0.005 &&
          t.bookingDate >= from &&
          t.bookingDate <= to
      );
    if (!match) continue;
    hints.set(d.id, {
      label: `${match.bankAccount.name} · ${formatEuro(Number(match.amount))} · ${formatDate(match.bookingDate)}`,
      linked: Boolean(linked),
    });
  }
  return hints;
}
