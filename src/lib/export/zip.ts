import JSZip from "jszip";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildExcel, type ExportReceipt } from "./excel";
import { slugForFile, monthFolder } from "@/lib/format";

// Monats-ZIP für den Steuerberater (Spec Abschnitt 7/9):
// alle Beleg-PDFs des Monats + eine Excel-Übersicht.
export async function buildMonthlyZip(params: {
  organizationId: string;
  companyId: string;
  year: number;
  month: number; // 0-basiert
  // Sichtbarkeits-Einschränkung des Abrufers (Admin: keine fremden Admin-Belege)
  restrict?: Prisma.ReceiptWhereInput;
}): Promise<{ filename: string; bytes: Buffer } | null> {
  const from = new Date(params.year, params.month, 1);
  const to = new Date(params.year, params.month + 1, 0, 23, 59, 59);

  const company = await db.company.findFirst({
    where: { id: params.companyId, organizationId: params.organizationId },
  });
  if (!company) return null;

  const receipts = await db.receipt.findMany({
    where: {
      organizationId: params.organizationId,
      companyId: params.companyId,
      status: "ABGELEGT",
      receiptDate: { gte: from, lte: to },
      // Mitarbeiter-Link-Belege erst nach Admin-Freigabe
      OR: [{ viaEmployeeLink: false }, { employeeReview: "FREIGEGEBEN" }],
      ...(params.restrict ? { AND: [params.restrict] } : {}),
    },
    orderBy: { receiptDate: "asc" },
    include: {
      category: true,
      company: true,
      user: true,
      files: { where: { kind: "PDF" }, select: { bytes: true, filename: true } },
    },
  });

  const zip = new JSZip();
  const monthName = monthFolder(from);
  const folder = `${slugForFile(company.brandName)}_${params.year}-${String(params.month + 1).padStart(2, "0")}`;

  // PDFs
  for (const r of receipts) {
    const pdf = r.files[0];
    if (pdf) {
      zip.file(`${folder}/${pdf.filename}`, Buffer.from(pdf.bytes));
    }
  }

  // Excel-Übersicht
  const exportRows: ExportReceipt[] = receipts.map((r) => ({
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
  const excel = await buildExcel(exportRows, `${company.brandName} ${monthName} ${params.year}`);
  zip.file(`${folder}/${folder}_Auswertung.xlsx`, excel);

  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  return { filename: `${folder}.zip`, bytes };
}
