import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scope } from "@/lib/analytics";
import { buildExcel, type ExportReceipt } from "@/lib/export/excel";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";

  const extra: Prisma.ReceiptWhereInput = {};
  const q = g("q").trim();
  if (q) {
    extra.OR = [
      { vendor: { contains: q, mode: "insensitive" } },
      { purpose: { contains: q, mode: "insensitive" } },
      { receiptNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (g("company")) extra.companyId = g("company");
  if (g("category")) extra.categoryId = g("category");
  if (g("kind")) extra.kind = g("kind") as never;
  if (g("reimb")) extra.reimbursementStatus = g("reimb") as never;
  if (user.role === "ADMIN" && g("user")) extra.userId = g("user");
  if (g("from") || g("to")) {
    extra.receiptDate = {};
    if (g("from")) (extra.receiptDate as Prisma.DateTimeFilter).gte = new Date(g("from"));
    if (g("to")) {
      const to = new Date(g("to"));
      to.setHours(23, 59, 59, 999);
      (extra.receiptDate as Prisma.DateTimeFilter).lte = to;
    }
  }

  const receipts = await db.receipt.findMany({
    where: scope(user, extra),
    orderBy: [{ receiptDate: "asc" }],
    include: { category: true, company: true, user: true },
  });

  const rows: ExportReceipt[] = receipts.map((r) => ({
    receiptNumber: r.receiptNumber,
    receiptDate: r.receiptDate,
    vendor: r.vendor,
    category: r.category?.name ?? null,
    kind: r.kind,
    grossAmount: r.grossAmount,
    netAmount: r.netAmount,
    vatLines: r.vatLines,
    companyName: r.company?.brandName ?? null,
    userName: r.user.name,
    reimbursementStatus: r.reimbursementStatus,
    purpose: r.purpose,
  }));

  const excel = await buildExcel(rows, "Belege");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(excel as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="incubWorkflow_Belege_${stamp}.xlsx"`,
    },
  });
}
