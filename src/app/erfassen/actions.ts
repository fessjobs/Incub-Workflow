"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractReceipt } from "@/lib/claude";
import { generateAndStorePdf, nextReceiptNumber, assertCompanyAllowed } from "@/lib/receipts";
import { extForMime } from "@/lib/storage";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024;

const schema = z.object({
  name: z.string().trim().min(1, "Bitte deinen Namen eingeben."),
  auftrag: z.string().trim().min(1, "Bitte den Auftrag / Anlass eingeben."),
});

export type KioskResult = { ok: boolean; receiptNumber?: string; error?: string };

// Vereinfachte Kiosk-Erfassung: Beleg + Name + Auftrag → fertig abgelegter Beleg
// für die (einzige erlaubte) Firma. Kein Draft-Umweg.
export async function kioskSubmit(companyId: string, formData: FormData): Promise<KioskResult> {
  const user = await requireUser();

  const allowed = await assertCompanyAllowed(user, companyId);
  if (!allowed) return { ok: false, error: "Für diese Firma nicht freigegeben." };

  const parsed = schema.safeParse({ name: formData.get("name"), auftrag: formData.get("auftrag") });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Bitte einen Beleg fotografieren oder hochladen." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };

  let mime = file.type;
  if (!ACCEPTED.includes(mime)) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mime = "image/jpeg";
    else if (name.endsWith(".png")) mime = "image/png";
    else if (name.endsWith(".pdf")) mime = "application/pdf";
    else return { ok: false, error: "Dateityp nicht unterstützt (JPG, PNG, PDF)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const org = await db.organization.findUniqueOrThrow({ where: { id: user.organizationId } });

  // Automatisch auslesen (falls möglich) – Kiosk-Nutzer prüft nichts
  let extractedDate = new Date();
  let vendor = "";
  let gross = 0;
  let net: number | null = null;
  let vatLines: unknown = [];
  try {
    const categories = await db.category.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: { name: true },
    });
    const ex = await extractReceipt(bytes, mime, categories.map((c) => c.name));
    if (ex.receiptDate) extractedDate = new Date(ex.receiptDate);
    if (ex.vendor) vendor = ex.vendor;
    if (ex.grossAmount !== null) gross = ex.grossAmount;
    if (ex.netAmount !== null) net = ex.netAmount;
    vatLines = ex.vatLines;
  } catch {
    // egal – Beleg wird trotzdem angelegt, Admin kann korrigieren
  }

  const receipt = await db.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const num = await nextReceiptNumber(tx, company, extractedDate.getFullYear());
    return tx.receipt.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        companyId,
        receiptDate: extractedDate,
        vendor,
        grossAmount: gross,
        netAmount: net,
        vatLines: vatLines as object,
        kind: "AUSLAGE",
        paymentMethod: "PRIVATE_KARTE",
        purpose: parsed.data.auftrag,
        submittedByName: parsed.data.name,
        status: "ABGELEGT",
        ...num,
      },
    });
  });

  // Original ablegen
  await db.receiptFile.create({
    data: {
      receiptId: receipt.id,
      kind: "ORIGINAL",
      filename: `original.${extForMime(mime)}`,
      mimeType: mime,
      bytes,
      size: bytes.length,
    },
  });

  // Beiblatt + PDF erzeugen
  const full = await db.receipt.findUniqueOrThrow({
    where: { id: receipt.id },
    include: { company: true, category: true, user: true, vehicle: true },
  });
  await generateAndStorePdf(full, org.brandName, user.id);

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.kiosk",
    entityType: "receipt",
    entityId: receipt.id,
    data: { receiptNumber: receipt.receiptNumber, submittedBy: parsed.data.name },
  });

  return { ok: true, receiptNumber: receipt.receiptNumber ?? undefined };
}
