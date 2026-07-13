import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type Period = { from: Date; to: Date; label: string };

export function periodForYear(year: number): Period {
  return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59), label: String(year) };
}

export function currentYear(): number {
  return new Date().getFullYear();
}

type ScopeInput = { organizationId: string; id: string; role: "ADMIN" | "BUCHHALTUNG" | "MEMBER" | "EINREICHER" };

// Belegdaten-Scope: Org + (Member → nur eigene). Admin und Buchhaltung sehen
// alles. Optional weitere Filter.
export function scope(user: ScopeInput, extra?: Prisma.ReceiptWhereInput): Prisma.ReceiptWhereInput {
  const base: Prisma.ReceiptWhereInput = { organizationId: user.organizationId, status: "ABGELEGT" };
  if (user.role !== "ADMIN" && user.role !== "BUCHHALTUNG") base.userId = user.id;
  return { ...base, ...extra };
}

export function vatOf(receipt: { grossAmount: unknown; netAmount: unknown; vatLines: unknown }): number {
  const lines = receipt.vatLines as Array<{ vat: number }> | null;
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.reduce((s, l) => s + (Number(l.vat) || 0), 0);
  }
  const gross = Number(receipt.grossAmount) || 0;
  const net = receipt.netAmount !== null && receipt.netAmount !== undefined ? Number(receipt.netAmount) : null;
  return net !== null ? Math.max(0, gross - net) : 0;
}

export type Slice = { label: string; value: number; color?: string };

export async function analyticsData(
  user: ScopeInput,
  period: Period,
  companyId?: string
) {
  const where = scope(user, {
    receiptDate: { gte: period.from, lte: period.to },
    ...(companyId ? { companyId } : {}),
  });

  const receipts = await db.receipt.findMany({
    where,
    select: {
      grossAmount: true,
      netAmount: true,
      vatLines: true,
      receiptDate: true,
      kind: true,
      reimbursementStatus: true,
      company: { select: { id: true, brandName: true } },
      category: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  let total = 0;
  let vatTotal = 0;
  let openReimbursement = 0;
  const byCompany = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byMonth = new Array(12).fill(0) as number[];

  for (const r of receipts) {
    const gross = Number(r.grossAmount) || 0;
    total += gross;
    vatTotal += vatOf(r);
    if (r.kind === "AUSLAGE" && (r.reimbursementStatus === "OFFEN" || r.reimbursementStatus === "EINGEREICHT")) {
      openReimbursement += gross;
    }
    const comp = r.company?.brandName ?? "Ohne Firma";
    byCompany.set(comp, (byCompany.get(comp) ?? 0) + gross);
    const cat = r.category?.name ?? "Ohne Kategorie";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + gross);
    byUser.set(r.user.name, (byUser.get(r.user.name) ?? 0) + gross);
    byMonth[r.receiptDate.getMonth()] += gross;
  }

  const toSlices = (m: Map<string, number>): Slice[] =>
    [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    count: receipts.length,
    total,
    vatTotal,
    netTotal: total - vatTotal,
    openReimbursement,
    byCompany: toSlices(byCompany),
    byCategory: toSlices(byCategory),
    byUser: toSlices(byUser),
    byMonth,
  };
}
