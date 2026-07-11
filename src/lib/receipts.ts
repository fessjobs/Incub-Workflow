import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { nextReceiptNumber } from "@/lib/receipt-number";
import { renderBeiblatt, type BeiblattData } from "@/lib/pdf/beiblatt";
import { mergeBeiblattWithReceipt } from "@/lib/pdf/merge";
import { buildPaths, mirrorToDisk, extForMime } from "@/lib/storage";
import { slugForFile, monthFolder } from "@/lib/format";
import type { VatLine } from "@/lib/claude";

// Query-Scope: immer nach organization_id; Mitglieder zusätzlich nach user_id
// (Spec Abschnitt 3/10).
export function receiptScope(user: Pick<User, "organizationId" | "id" | "role">): Prisma.ReceiptWhereInput {
  const base: Prisma.ReceiptWhereInput = { organizationId: user.organizationId };
  if (user.role !== "ADMIN") base.userId = user.id;
  return base;
}

// Darf der Nutzer für diese Firma einreichen? (optionale Einschränkung)
export async function assertCompanyAllowed(user: Pick<User, "id">, companyId: string): Promise<boolean> {
  const restrictions = await db.userCompanyAccess.findMany({ where: { userId: user.id } });
  if (restrictions.length === 0) return true; // keine Einschränkung = alle erlaubt
  return restrictions.some((r) => r.companyId === companyId);
}

function toNumber(d: Prisma.Decimal | number | null): number | null {
  if (d === null) return null;
  return typeof d === "number" ? d : Number(d);
}

// Belegdaten (aktueller Stand) als JSON-Snapshot für die Versionshistorie.
export function snapshot(receipt: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

type FullReceipt = Prisma.ReceiptGetPayload<{ include: { company: true; category: true; user: true } }>;

// Erzeugt Beiblatt + gemergte PDF und legt beide Dateien (DB + Dateisystem) ab.
export async function generateAndStorePdf(
  receipt: FullReceipt,
  orgBrand: string,
  createdById: string
): Promise<void> {
  if (!receipt.company || !receipt.receiptNumber) {
    throw new Error("Firma und Belegnummer müssen gesetzt sein, bevor die PDF erzeugt wird.");
  }

  const beiblattData: BeiblattData = {
    organizationBrand: orgBrand,
    company: {
      brandName: receipt.company.brandName,
      legalName: receipt.company.legalName,
      address: receipt.company.address,
      location: receipt.company.location,
      shortCode: receipt.company.shortCode,
      color: receipt.company.color,
    },
    receiptNumber: receipt.receiptNumber,
    submitterName: receipt.user.name,
    approved: receipt.approved,
    receiptDate: receipt.receiptDate,
    vendor: receipt.vendor,
    grossAmount: toNumber(receipt.grossAmount) ?? 0,
    netAmount: toNumber(receipt.netAmount),
    vatLines: (receipt.vatLines as unknown as VatLine[]) ?? [],
    categoryName: receipt.category?.name ?? null,
    kind: receipt.kind,
    purpose: receipt.purpose,
    paymentMethod: receipt.paymentMethod,
    reimbursementStatus: receipt.reimbursementStatus,
    reimbursedAt: receipt.reimbursedAt,
    isSelfReceipt: receipt.isSelfReceipt,
    selfReceiptReason: receipt.selfReceiptReason,
    hospitality: receipt.category?.isHospitality
      ? {
          guests: receipt.hospitalityGuests,
          occasion: receipt.hospitalityOccasion,
          location: receipt.hospitalityLocation,
        }
      : null,
    createdAt: new Date(),
  };

  const beiblattPdf = await renderBeiblatt(beiblattData);

  // Original für den Merge laden
  const original = await db.receiptFile.findFirst({
    where: { receiptId: receipt.id, kind: "ORIGINAL" },
  });
  const merged = await mergeBeiblattWithReceipt(
    beiblattPdf,
    original ? { bytes: Buffer.from(original.bytes), mimeType: original.mimeType } : null
  );

  // Pfade nach Ordnerschema (Abschnitt 7)
  const companyFolder = slugForFile(receipt.company.brandName);
  const paths = buildPaths({
    companyFolder,
    date: receipt.receiptDate,
    receiptNumber: receipt.receiptNumber,
    vendor: receipt.vendor || "Beleg",
    gross: toNumber(receipt.grossAmount) ?? 0,
    originalExt: original ? extForMime(original.mimeType) : "pdf",
  });
  const pdfFilename = paths.pdfPath.split("/").pop()!;

  // PDF-Datei in DB ablegen/aktualisieren
  await db.receiptFile.deleteMany({ where: { receiptId: receipt.id, kind: "PDF" } });
  await db.receiptFile.create({
    data: {
      receiptId: receipt.id,
      kind: "PDF",
      filename: pdfFilename,
      mimeType: "application/pdf",
      bytes: new Uint8Array(merged),
      size: merged.length,
    },
  });

  await db.receipt.update({
    where: { id: receipt.id },
    data: { pdfPath: paths.pdfPath, originalPath: original ? paths.originalPath : null },
  });

  // Best-effort Spiegelung ins Dateisystem
  const mirror: Array<{ relPath: string; bytes: Buffer }> = [{ relPath: paths.pdfPath, bytes: merged }];
  if (original) mirror.push({ relPath: paths.originalPath, bytes: Buffer.from(original.bytes) });
  await mirrorToDisk(mirror);

  // Versions-Snapshot (Audit / Historie)
  await db.receiptVersion.create({
    data: {
      receiptId: receipt.id,
      versionNo: receipt.currentVersion,
      data: snapshot({
        receiptNumber: receipt.receiptNumber,
        receiptDate: receipt.receiptDate,
        vendor: receipt.vendor,
        grossAmount: toNumber(receipt.grossAmount),
        netAmount: toNumber(receipt.netAmount),
        vatLines: receipt.vatLines,
        kind: receipt.kind,
        categoryId: receipt.categoryId,
        purpose: receipt.purpose,
        paymentMethod: receipt.paymentMethod,
        approved: receipt.approved,
        status: receipt.status,
      }),
      pdfPath: paths.pdfPath,
      createdById,
    },
  });
}

// Dubletten-Check: gleicher Betrag + Datum + Aussteller (Spec Abschnitt 5.7)
export async function findDuplicates(
  user: Pick<User, "organizationId" | "id" | "role">,
  params: { grossAmount: number; receiptDate: Date; vendor: string; excludeId?: string }
) {
  const start = new Date(params.receiptDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return db.receipt.findMany({
    where: {
      ...receiptScope(user),
      id: params.excludeId ? { not: params.excludeId } : undefined,
      status: "ABGELEGT",
      grossAmount: params.grossAmount,
      receiptDate: { gte: start, lt: end },
      vendor: { equals: params.vendor, mode: "insensitive" },
    },
    select: { id: true, receiptNumber: true, vendor: true },
  });
}

export { nextReceiptNumber, monthFolder };
