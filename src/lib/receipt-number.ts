import type { Prisma } from "@prisma/client";

// Belegnummer {Kürzel}-{Jahr}-{laufende Nr. 4-stellig}, Nummernkreis pro
// Firma und Jahr. Transaktional hochgezählt, damit keine Nummer doppelt vergeben
// wird (Spec Abschnitt 6).
export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  company: { id: string; shortCode: string },
  year: number
): Promise<{ receiptNumber: string; numberYear: number; numberSeq: number }> {
  const counter = await tx.receiptNumberCounter.upsert({
    where: { companyId_year: { companyId: company.id, year } },
    create: { companyId: company.id, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const seq = counter.lastNumber;
  const receiptNumber = `${company.shortCode}-${year}-${String(seq).padStart(4, "0")}`;
  return { receiptNumber, numberYear: year, numberSeq: seq };
}
