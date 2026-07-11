"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractReceipt, isExtractionAvailable, type VatLine } from "@/lib/claude";
import {
  receiptScope,
  assertCompanyAllowed,
  generateAndStorePdf,
  nextReceiptNumber,
  findDuplicates,
} from "@/lib/receipts";
import { extForMime } from "@/lib/storage";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type UploadResult =
  | { ok: true; id: string; vendor: string | null; extracted: boolean }
  | { ok: false; error: string };

// Ein Beleg-Foto/PDF hochladen: sofort als Entwurf anlegen, Original speichern,
// automatisch auslesen. Für Batch-Upload ruft der Client dies je Datei auf.
export async function uploadReceipt(formData: FormData): Promise<UploadResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Keine Datei erhalten." };
  if (file.size === 0) return { ok: false, error: "Datei ist leer." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };

  let mime = file.type;
  if (!ACCEPTED.includes(mime)) {
    // Manche Kameras liefern generische Typen – anhand Endung nachbessern
    const name = file.name.toLowerCase();
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mime = "image/jpeg";
    else if (name.endsWith(".png")) mime = "image/png";
    else if (name.endsWith(".pdf")) mime = "application/pdf";
    else return { ok: false, error: "Dateityp nicht unterstützt (JPG, PNG, WebP, PDF)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Entwurf anlegen
  const draft = await db.receipt.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      receiptDate: new Date(),
      status: "ENTWURF",
      kind: "AUSLAGE",
    },
  });

  // Original ablegen (Quelle = DB)
  await db.receiptFile.create({
    data: {
      receiptId: draft.id,
      kind: "ORIGINAL",
      filename: `original.${extForMime(mime)}`,
      mimeType: mime,
      bytes,
      size: bytes.length,
    },
  });

  // Automatisch auslesen (falls API-Key vorhanden)
  let extractedOk = false;
  let vendor: string | null = null;
  try {
    const categories = await db.category.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, isHospitality: true },
    });
    const extraction = await extractReceipt(bytes, mime, categories.map((c) => c.name));
    if (extraction.vendor || extraction.grossAmount) {
      extractedOk = true;
      vendor = extraction.vendor;
      // passende Kategorie finden
      let categoryId: string | null = null;
      if (extraction.categorySuggestion) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === extraction.categorySuggestion!.toLowerCase()
        );
        if (match) {
          const cat = await db.category.findFirst({
            where: { organizationId: user.organizationId, name: match.name },
          });
          categoryId = cat?.id ?? null;
        }
      }
      await db.receipt.update({
        where: { id: draft.id },
        data: {
          receiptDate: extraction.receiptDate ? new Date(extraction.receiptDate) : new Date(),
          vendor: extraction.vendor ?? "",
          grossAmount: extraction.grossAmount ?? 0,
          netAmount: extraction.netAmount ?? undefined,
          vatLines: extraction.vatLines as unknown as object,
          paymentMethod: extraction.paymentMethod,
          purpose: extraction.purposeSuggestion ?? undefined,
          categoryId,
        },
      });
    }
  } catch (err) {
    console.error("Auto-Extraktion fehlgeschlagen:", err);
  }

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.upload",
    entityType: "receipt",
    entityId: draft.id,
  });
  revalidatePath("/belege");
  return { ok: true, id: draft.id, vendor, extracted: extractedOk };
}

// Schnelle Zuordnung im Batch: Firma / Kategorie / Art per Ein-Tap setzen.
export async function quickAssign(
  receiptId: string,
  patch: { companyId?: string | null; categoryId?: string | null; kind?: string; approved?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, ...receiptScope(user) } });
  if (!receipt) return { ok: false, error: "Beleg nicht gefunden." };

  if (patch.companyId) {
    const allowed = await assertCompanyAllowed(user, patch.companyId);
    if (!allowed) return { ok: false, error: "Für diese Firma nicht freigegeben." };
  }

  await db.receipt.update({
    where: { id: receiptId },
    data: {
      companyId: patch.companyId === undefined ? undefined : patch.companyId,
      categoryId: patch.categoryId === undefined ? undefined : patch.categoryId,
      kind: patch.kind as never,
      approved: patch.approved,
    },
  });
  revalidatePath("/belege");
  return { ok: true };
}

const fullSchema = z.object({
  companyId: z.string().min(1, "Firma wählen."),
  categoryId: z.string().optional().nullable(),
  receiptDate: z.string().min(1, "Datum fehlt."),
  vendor: z.string().trim().min(1, "Aussteller fehlt."),
  grossAmount: z.coerce.number().min(0, "Betrag ungültig."),
  netAmount: z.coerce.number().optional().nullable(),
  kind: z.enum(["AUSLAGE", "FIRMENZAHLUNG", "PRIVAT"]),
  paymentMethod: z.enum(["BAR", "PRIVATE_KARTE", "FIRMENKARTE", "UNBEKANNT"]),
  purpose: z.string().trim().optional().nullable(),
  approved: z.boolean(),
  isSelfReceipt: z.boolean(),
  selfReceiptReason: z.string().trim().optional().nullable(),
  hospitalityGuests: z.string().trim().optional().nullable(),
  hospitalityOccasion: z.string().trim().optional().nullable(),
  hospitalityLocation: z.string().trim().optional().nullable(),
  vatLines: z.string().optional(), // JSON-String
});

function parseVatLines(raw: string | undefined): VatLine[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({ rate: Number(x.rate), net: Number(x.net), vat: Number(x.vat) }))
      .filter((x) => !Number.isNaN(x.rate));
  } catch {
    return [];
  }
}

export type SaveResult = { ok: boolean; error?: string; duplicateOf?: string };

// Eingabetyp fürs Speichern (Beträge kommen als String aus den Formularen)
export type ReceiptInput = {
  companyId: string;
  categoryId?: string | null;
  receiptDate: string;
  vendor: string;
  grossAmount: string | number;
  netAmount?: number | null;
  kind: "AUSLAGE" | "FIRMENZAHLUNG" | "PRIVAT";
  paymentMethod: "BAR" | "PRIVATE_KARTE" | "FIRMENKARTE" | "UNBEKANNT";
  purpose?: string | null;
  approved: boolean;
  isSelfReceipt: boolean;
  selfReceiptReason?: string | null;
  hospitalityGuests?: string | null;
  hospitalityOccasion?: string | null;
  hospitalityLocation?: string | null;
  vatLines?: string;
};

// Beleg speichern & ablegen (finalisieren): Belegnummer vergeben, PDF erzeugen,
// mit Beleg mergen, ablegen. Bei erneutem Speichern eines abgelegten Belegs:
// neue Version + neue PDF (Historie bleibt).
export async function saveReceipt(
  receiptId: string,
  data: ReceiptInput,
  opts?: { ignoreDuplicate?: boolean }
): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = fullSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const v = parsed.data;

  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, ...receiptScope(user) },
    include: { company: true },
  });
  if (!receipt) return { ok: false, error: "Beleg nicht gefunden." };

  const allowed = await assertCompanyAllowed(user, v.companyId);
  if (!allowed) return { ok: false, error: "Für diese Firma nicht freigegeben." };

  const receiptDate = new Date(v.receiptDate);

  // Dubletten-Check (nur beim ersten Ablegen)
  if (!opts?.ignoreDuplicate && receipt.status === "ENTWURF") {
    const dups = await findDuplicates(user, {
      grossAmount: v.grossAmount,
      receiptDate,
      vendor: v.vendor,
      excludeId: receiptId,
    });
    if (dups.length > 0) {
      return { ok: false, duplicateOf: dups[0].receiptNumber ?? dups[0].id };
    }
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: user.organizationId } });

  await db.$transaction(async (tx) => {
    // Belegnummer vergeben, falls noch keine (erstes Ablegen)
    let numberFields: { receiptNumber: string; numberYear: number; numberSeq: number } | null = null;
    if (!receipt.receiptNumber) {
      const company = await tx.company.findUniqueOrThrow({ where: { id: v.companyId } });
      numberFields = await nextReceiptNumber(tx, company, receiptDate.getFullYear());
    }

    const bumpVersion = receipt.status === "ABGELEGT";

    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        companyId: v.companyId,
        categoryId: v.categoryId || null,
        receiptDate,
        vendor: v.vendor,
        grossAmount: v.grossAmount,
        netAmount: v.netAmount ?? null,
        vatLines: parseVatLines(v.vatLines) as unknown as object,
        kind: v.kind,
        paymentMethod: v.paymentMethod,
        purpose: v.purpose || null,
        approved: v.approved,
        isSelfReceipt: v.isSelfReceipt,
        selfReceiptReason: v.isSelfReceipt ? v.selfReceiptReason || null : null,
        hospitalityGuests: v.hospitalityGuests || null,
        hospitalityOccasion: v.hospitalityOccasion || null,
        hospitalityLocation: v.hospitalityLocation || null,
        status: "ABGELEGT",
        ...(numberFields ?? {}),
        ...(bumpVersion ? { currentVersion: { increment: 1 } } : {}),
      },
    });
  });

  // PDF erzeugen (außerhalb der Transaktion – kann etwas dauern)
  const full = await db.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { company: true, category: true, user: true },
  });
  await generateAndStorePdf(full, org.brandName, user.id);

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: receipt.status === "ABGELEGT" ? "receipt.update" : "receipt.finalize",
    entityType: "receipt",
    entityId: receiptId,
    data: { receiptNumber: full.receiptNumber },
  });

  revalidatePath("/belege");
  revalidatePath(`/belege/${receiptId}`);
  return { ok: true };
}

export async function updateReimbursement(
  receiptId: string,
  status: "OFFEN" | "EINGEREICHT" | "ERSTATTET"
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, ...receiptScope(user) } });
  if (!receipt) return { ok: false };
  await db.receipt.update({
    where: { id: receiptId },
    data: { reimbursementStatus: status, reimbursedAt: status === "ERSTATTET" ? new Date() : null },
  });
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.reimbursement",
    entityType: "receipt",
    entityId: receiptId,
    data: { status },
  });
  revalidatePath("/belege");
  revalidatePath(`/belege/${receiptId}`);
  return { ok: true };
}

export async function deleteReceipt(receiptId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, ...receiptScope(user) } });
  if (!receipt) return { ok: false };
  // Entwürfe dürfen gelöscht werden; abgelegte Belege nur vom Admin (Historie!)
  if (receipt.status === "ABGELEGT" && user.role !== "ADMIN") return { ok: false };
  await db.receipt.delete({ where: { id: receiptId } });
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.delete",
    entityType: "receipt",
    entityId: receiptId,
  });
  revalidatePath("/belege");
  return { ok: true };
}

export async function extractionAvailable(): Promise<boolean> {
  return isExtractionAvailable();
}
