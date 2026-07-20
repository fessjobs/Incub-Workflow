"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractReceipt, isExtractionAvailable, type VatLine } from "@/lib/claude";
import { suggestFromHistory } from "@/lib/suggestions";
import {
  receiptScope,
  assertCompanyAllowed,
  generateAndStorePdf,
  nextReceiptNumber,
  findDuplicates,
} from "@/lib/receipts";
import { extForMime } from "@/lib/storage";
import { accountVisibility } from "@/lib/bank/scope";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// Datenbank-/Serverfehler in eine verständliche Meldung übersetzen.
// Wichtigster Fall: volles Postgres-Volume (Railway) – Uploads scheitern dann
// beim Speichern der Datei-Bytes.
function readableUploadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const pgMessage = raw.match(/message:\s*"([^"]+)"/)?.[1];
  const pgCode = raw.match(/code:\s*"?([0-9A-Z]{5})"?/)?.[1];
  if (
    pgCode === "53100" ||
    raw.includes("No space left") ||
    pgMessage?.includes("could not extend") ||
    pgMessage?.includes("disk full")
  ) {
    return "Datenbank-Speicher ist voll – in Railway das Postgres-Volume vergrößern (siehe Einstellungen → Speicher).";
  }
  const detail = pgMessage ? `${pgMessage}${pgCode ? ` (Code ${pgCode})` : ""}` : raw.slice(0, 300);
  return `Serverfehler beim Upload: ${detail}`;
}

export type UploadResult =
  | { ok: true; id: string; vendor: string | null; extracted: boolean; learned: number; extractionError: string | null }
  | { ok: false; error: string };

// Extraktion + Mitlern-Vorschläge auf einen Beleg anwenden.
// Historie (frühere Zuordnungen desselben Ausstellers) schlägt den
// Claude-Vorschlag; Claude füllt die reinen Belegdaten.
async function runExtraction(
  receiptId: string,
  organizationId: string,
  bytes: Buffer,
  mime: string
): Promise<{ extracted: boolean; vendor: string | null; learned: number; error: string | null }> {
  const categories = await db.category.findMany({
    where: { organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const extraction = await extractReceipt(bytes, mime, categories.map((c) => c.name));
  const vendor = extraction.vendor;
  const extracted = Boolean(extraction.vendor || extraction.grossAmount);

  // Kategorie-Vorschlag von Claude auf echte Kategorie mappen
  let categoryId: string | null = null;
  if (extraction.categorySuggestion) {
    const match = categories.find(
      (c) => c.name.toLowerCase() === extraction.categorySuggestion!.toLowerCase()
    );
    categoryId = match?.id ?? null;
  }

  // Mitlernen: Historie desselben Ausstellers hat Vorrang
  const history = vendor ? await suggestFromHistory(organizationId, vendor) : null;
  if (history) {
    if (history.categoryId) categoryId = history.categoryId;
  }

  if (extracted || history) {
    await db.receipt.update({
      where: { id: receiptId },
      data: {
        ...(extraction.receiptDate ? { receiptDate: new Date(extraction.receiptDate) } : {}),
        ...(vendor ? { vendor } : {}),
        ...(extraction.grossAmount !== null ? { grossAmount: extraction.grossAmount } : {}),
        ...(extraction.netAmount !== null ? { netAmount: extraction.netAmount } : {}),
        ...(extraction.vatLines.length > 0
          ? { vatLines: extraction.vatLines as unknown as object }
          : {}),
        paymentMethod: (history?.paymentMethod ??
          (extraction.paymentMethod !== "UNBEKANNT" ? extraction.paymentMethod : undefined)) as never,
        purpose: history?.purpose ?? extraction.purposeSuggestion ?? undefined,
        categoryId: categoryId ?? undefined,
        companyId: history?.companyId ?? undefined,
        kind: (history?.kind ?? undefined) as never,
      },
    });
  }

  return { extracted, vendor, learned: history?.matchCount ?? 0, error: extraction.error };
}

// Kern des Uploads: Entwurf anlegen, Original ablegen, automatisch auslesen.
// Wird vom Einzel-Upload und vom PDF-Batch-Split genutzt.
async function createDraftFromBytes(
  user: { id: string; organizationId: string },
  bytes: Buffer,
  mime: string
): Promise<{ id: string; vendor: string | null; extracted: boolean; learned: number; extractionError: string | null }> {
  const draft = await db.receipt.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      receiptDate: new Date(),
      status: "ENTWURF",
      kind: "AUSLAGE",
    },
  });

  await db.receiptFile.create({
    data: {
      receiptId: draft.id,
      kind: "ORIGINAL",
      filename: `original.${extForMime(mime)}`,
      mimeType: mime,
      bytes: new Uint8Array(bytes),
      size: bytes.length,
    },
  });

  let extractedOk = false;
  let vendor: string | null = null;
  let learned = 0;
  let extractionError: string | null = null;
  try {
    const result = await runExtraction(draft.id, user.organizationId, bytes, mime);
    extractedOk = result.extracted;
    vendor = result.vendor;
    learned = result.learned;
    extractionError = result.error;
  } catch (err) {
    console.error("Auto-Extraktion fehlgeschlagen:", err);
    extractionError = err instanceof Error ? err.message.slice(0, 200) : "Unbekannter Fehler";
  }

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.upload",
    entityType: "receipt",
    entityId: draft.id,
  });
  return { id: draft.id, vendor, extracted: extractedOk, learned, extractionError };
}

function resolveMime(file: File): string | null {
  let mime = file.type;
  if (ACCEPTED.includes(mime)) return mime;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".pdf")) return "application/pdf";
  return null;
}

// Ein Beleg-Foto/PDF hochladen: sofort als Entwurf anlegen, Original speichern,
// automatisch auslesen. Für Batch-Upload ruft der Client dies je Datei auf.
export async function uploadReceipt(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Keine Datei erhalten." };
    if (file.size === 0) return { ok: false, error: "Datei ist leer." };
    if (file.size > MAX_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };

    const mime = resolveMime(file);
    if (!mime) return { ok: false, error: "Dateityp nicht unterstützt (JPG, PNG, WebP, PDF)." };

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await createDraftFromBytes(user, bytes, mime);
    revalidatePath("/belege");
    return { ok: true, ...result };
  } catch (err) {
    // Immer eine lesbare Meldung zurückgeben statt eines anonymen Serverfehlers
    console.error("uploadReceipt fehlgeschlagen:", err);
    return { ok: false, error: readableUploadError(err) };
  }
}

// ─── Sammel-PDF: viele Belege in einer Datei → in Einzelbelege aufteilen ─────
// Die KI gruppiert die Seiten (mehrseitige Rechnungen bleiben zusammen);
// ohne API-Key gilt: eine Seite = ein Beleg. Jede Gruppe wird ein eigener
// Entwurf mit eigener Original-PDF und automatischem Auslesen.

export type PdfBatchResult =
  | {
      ok: true;
      pages: number;
      receipts: Array<{ id: string; vendor: string | null; pages: number[] }>;
    }
  | { ok: false; error: string };

export async function uploadReceiptPdfBatch(formData: FormData): Promise<PdfBatchResult> {
  try {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei erhalten." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };
  if (resolveMime(file) !== "application/pdf") return { ok: false, error: "Bitte eine PDF-Datei hochladen." };

  const bytes = Buffer.from(await file.arrayBuffer());

  const { pdfPageCount, detectReceiptGroups, buildSubPdf, MAX_SPLIT_PAGES } = await import("@/lib/pdf/split");
  let pageCount: number;
  try {
    pageCount = await pdfPageCount(bytes);
  } catch {
    return { ok: false, error: "PDF konnte nicht gelesen werden." };
  }
  if (pageCount > MAX_SPLIT_PAGES) {
    return { ok: false, error: `PDF hat ${pageCount} Seiten – bitte in Teile bis ${MAX_SPLIT_PAGES} Seiten aufteilen.` };
  }

  // Eine Seite = normaler Einzel-Upload
  if (pageCount <= 1) {
    const result = await createDraftFromBytes(user, bytes, "application/pdf");
    revalidatePath("/belege");
    return { ok: true, pages: 1, receipts: [{ id: result.id, vendor: result.vendor, pages: [1] }] };
  }

  const groups = await detectReceiptGroups(bytes, pageCount);

  // Je Gruppe: Teil-PDF bauen → Entwurf + Auslesen (begrenzte Parallelität)
  const receipts: Array<{ id: string; vendor: string | null; pages: number[] }> = new Array(groups.length);
  let next = 0;
  async function worker() {
    while (next < groups.length) {
      const i = next++;
      const pages = groups[i];
      const sub = await buildSubPdf(bytes, pages);
      const result = await createDraftFromBytes(user, sub, "application/pdf");
      receipts[i] = { id: result.id, vendor: result.vendor, pages };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, worker));

  revalidatePath("/belege");
  return { ok: true, pages: pageCount, receipts };
  } catch (err) {
    console.error("uploadReceiptPdfBatch fehlgeschlagen:", err);
    return { ok: false, error: readableUploadError(err) };
  }
}

// Erneut auslesen (z. B. nachdem der API-Schlüssel gesetzt wurde)
export async function reExtract(receiptId: string): Promise<{ ok: boolean; extracted?: boolean; error?: string }> {
  const user = await requireUser();
  if (!isExtractionAvailable()) {
    return { ok: false, error: "Automatisches Auslesen inaktiv – ANTHROPIC_API_KEY fehlt." };
  }
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, ...receiptScope(user), status: "ENTWURF" },
  });
  if (!receipt) return { ok: false, error: "Entwurf nicht gefunden." };
  const original = await db.receiptFile.findFirst({
    where: { receiptId, kind: "ORIGINAL" },
  });
  if (!original) return { ok: false, error: "Kein Original vorhanden." };

  try {
    const result = await runExtraction(
      receiptId,
      user.organizationId,
      Buffer.from(original.bytes),
      original.mimeType
    );
    revalidatePath("/belege");
    if (result.error) return { ok: false, error: `Auslesen fehlgeschlagen: ${result.error}` };
    return { ok: true, extracted: result.extracted };
  } catch (err) {
    console.error("Erneutes Auslesen fehlgeschlagen:", err);
    return { ok: false, error: "Auslesen fehlgeschlagen." };
  }
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
  corporateCardId: z.string().optional().nullable(),
  paidStatus: z.enum(["BEZAHLT", "ZU_ZAHLEN"]).optional(),
  purpose: z.string().trim().optional().nullable(),
  approved: z.boolean(),
  isSelfReceipt: z.boolean(),
  selfReceiptReason: z.string().trim().optional().nullable(),
  hospitalityGuests: z.string().trim().optional().nullable(),
  hospitalityOccasion: z.string().trim().optional().nullable(),
  hospitalityLocation: z.string().trim().optional().nullable(),
  vehicleName: z.string().trim().optional().nullable(),
  odometerKm: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
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
  // Konkrete Firmenkarte (Amex), wenn paymentMethod FIRMENKARTE
  corporateCardId?: string | null;
  // Rechnung schon bezahlt oder noch zu zahlen?
  paidStatus?: "BEZAHLT" | "ZU_ZAHLEN";
  purpose?: string | null;
  approved: boolean;
  isSelfReceipt: boolean;
  selfReceiptReason?: string | null;
  hospitalityGuests?: string | null;
  hospitalityOccasion?: string | null;
  hospitalityLocation?: string | null;
  vehicleName?: string | null;
  odometerKm?: string | number | null;
  notes?: string | null;
  // Nur Admin: Beleg einem anderen Mitarbeiter zuordnen (Einreicher/Name)
  submitterUserId?: string | null;
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

  // Firmenkarte nur mit passender Zahlungsart und aus der eigenen Organisation
  let corporateCardId: string | null = null;
  if (v.paymentMethod === "FIRMENKARTE" && v.corporateCardId) {
    const card = await db.corporateCard.findFirst({
      where: { id: v.corporateCardId, organizationId: user.organizationId, active: true },
    });
    if (!card) return { ok: false, error: "Firmenkarte nicht gefunden." };
    corporateCardId = card.id;
  }

  // Nur Admin darf den Einreicher ändern (Beleg für anderen Mitarbeiter erfassen)
  let submitterUserId: string | undefined;
  if (data.submitterUserId && user.role === "ADMIN") {
    const target = await db.user.findFirst({
      where: { id: data.submitterUserId, organizationId: user.organizationId },
    });
    if (!target) return { ok: false, error: "Mitarbeiter nicht gefunden." };
    submitterUserId = target.id;
  }

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

    // Fahrzeug auflösen: bestehendes wiederverwenden, neues automatisch anlegen
    let vehicleId: string | null = null;
    const vehicleName = v.vehicleName?.trim();
    if (vehicleName) {
      const vehicle = await tx.vehicle.upsert({
        where: {
          organizationId_name: { organizationId: user.organizationId, name: vehicleName },
        },
        create: { organizationId: user.organizationId, name: vehicleName },
        update: { active: true },
      });
      vehicleId = vehicle.id;
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
        corporateCardId,
        ...(v.paidStatus ? { paidStatus: v.paidStatus } : {}),
        purpose: v.purpose || null,
        approved: v.approved,
        isSelfReceipt: v.isSelfReceipt,
        selfReceiptReason: v.isSelfReceipt ? v.selfReceiptReason || null : null,
        hospitalityGuests: v.hospitalityGuests || null,
        hospitalityOccasion: v.hospitalityOccasion || null,
        hospitalityLocation: v.hospitalityLocation || null,
        vehicleId,
        odometerKm: v.odometerKm ?? null,
        notes: v.notes || null,
        ...(submitterUserId ? { userId: submitterUserId } : {}),
        status: "ABGELEGT",
        ...(numberFields ?? {}),
        ...(bumpVersion ? { currentVersion: { increment: 1 } } : {}),
      },
    });
  });

  // PDF erzeugen (außerhalb der Transaktion – kann etwas dauern)
  const full = await db.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { company: true, category: true, user: true, vehicle: true },
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

// ─── Freigabe von Mitarbeiter-Link-Belegen (nur Admin) ───────────────────────
// Erst nach Freigabe arbeitet die Buchhaltung damit (Listen + Exporte). Bei
// Ablehnung geht ein Kommentar an den Mitarbeiter (im Belegtool sichtbar).

export async function reviewEmployeeReceipt(
  receiptId: string,
  decision: "FREIGEGEBEN" | "ABGELEHNT",
  comment?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Nur Admins können freigeben." };
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, organizationId: user.organizationId, viaEmployeeLink: true },
  });
  if (!receipt) return { ok: false, error: "Beleg nicht gefunden." };

  await db.receipt.update({
    where: { id: receiptId },
    data: {
      employeeReview: decision,
      employeeReviewComment: decision === "ABGELEHNT" ? (comment?.trim() || null) : null,
    },
  });
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: decision === "FREIGEGEBEN" ? "receipt.employee_approve" : "receipt.employee_reject",
    entityType: "receipt",
    entityId: receiptId,
    data: { receiptNumber: receipt.receiptNumber, comment: comment?.trim() || undefined },
  });
  revalidatePath("/belege");
  revalidatePath(`/belege/${receiptId}`);
  return { ok: true };
}

// ─── Schnell-Upload (Gesellschafter): Entwurf mit einem Tap abschließen ──────
// Firma + Zahlungsart (+ Karte) + bezahlt/offen – Rest kommt aus der
// automatischen Extraktion. Danach sofortiger Zahlungs-Check.

export type QuickFinalizeResult = {
  ok: boolean;
  error?: string;
  duplicateOf?: string;
  receiptNumber?: string;
  matches?: PaymentMatch[];
};

export async function quickFinalize(
  receiptId: string,
  opts: {
    companyId: string;
    paymentMethod: "BAR" | "PRIVATE_KARTE" | "FIRMENKARTE" | "UNBEKANNT";
    corporateCardId?: string | null;
    paidStatus: "BEZAHLT" | "ZU_ZAHLEN";
    ignoreDuplicate?: boolean;
  }
): Promise<QuickFinalizeResult> {
  const user = await requireUser();
  const draft = await db.receipt.findFirst({ where: { id: receiptId, ...receiptScope(user) } });
  if (!draft) return { ok: false, error: "Beleg nicht gefunden." };

  const res = await saveReceipt(
    receiptId,
    {
      companyId: opts.companyId,
      categoryId: draft.categoryId,
      receiptDate: draft.receiptDate.toISOString().slice(0, 10),
      vendor: draft.vendor || "Beleg",
      grossAmount: Number(draft.grossAmount),
      netAmount: draft.netAmount !== null ? Number(draft.netAmount) : null,
      // Firmenkarte = Firmenzahlung; privat gezahlt = Auslage
      kind: opts.paymentMethod === "FIRMENKARTE" ? "FIRMENZAHLUNG" : "AUSLAGE",
      paymentMethod: opts.paymentMethod,
      corporateCardId: opts.corporateCardId ?? null,
      paidStatus: opts.paidStatus,
      purpose: draft.purpose,
      approved: false,
      isSelfReceipt: false,
      notes: draft.notes,
      vatLines: JSON.stringify(draft.vatLines ?? []),
    },
    { ignoreDuplicate: opts.ignoreDuplicate }
  );
  if (!res.ok) return { ok: false, error: res.error, duplicateOf: res.duplicateOf };

  const [full, check] = await Promise.all([
    db.receipt.findUnique({ where: { id: receiptId }, select: { receiptNumber: true } }),
    checkPaymentMatch(receiptId),
  ]);
  return { ok: true, receiptNumber: full?.receiptNumber ?? undefined, matches: check.matches };
}

// ─── "In DATEV hochgeladen" – Haken pro Beleg (Admin + Buchhaltung) ──────────

export async function setDatevUploaded(receiptId: string, uploaded: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "BUCHHALTUNG") return { ok: false };
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, ...receiptScope(user), status: "ABGELEGT" },
  });
  if (!receipt) return { ok: false };
  await db.receipt.update({
    where: { id: receiptId },
    data: { datevUploadedAt: uploaded ? new Date() : null },
  });
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: uploaded ? "receipt.datev_uploaded" : "receipt.datev_unmarked",
    entityType: "receipt",
    entityId: receiptId,
  });
  revalidatePath("/belege");
  return { ok: true };
}

// ─── Zahlungs-Check: passt eine Kontobewegung zu diesem Beleg? ───────────────
// Wird beim Schnell-Upload direkt und auf der Beleg-Detailseite jederzeit
// (auch im Nachhinein) ausgeführt.

export type PaymentMatch = {
  transactionId: string;
  label: string; // "−42,90 € · 03.07.2026 · REWE · Konto Sparkasse"
};

export async function checkPaymentMatch(receiptId: string): Promise<{ matches: PaymentMatch[] }> {
  const user = await requireUser();
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, ...receiptScope(user) },
    include: { transactions: { select: { id: true } } },
  });
  if (!receipt || receipt.transactions.length > 0) return { matches: [] };

  const gross = Number(receipt.grossAmount);
  if (!gross) return { matches: [] };

  // Zeitfenster: Buchung darf bis 3 Tage vor und 30 Tage nach dem Belegdatum liegen
  const from = new Date(receipt.receiptDate);
  from.setDate(from.getDate() - 3);
  const to = new Date(receipt.receiptDate);
  to.setDate(to.getDate() + 30);

  // Nur Konten, die der Nutzer sehen darf
  const accountFilter = accountVisibility(user);

  const candidates = await db.bankTransaction.findMany({
    where: {
      organizationId: user.organizationId,
      bankAccount: accountFilter,
      matchedReceiptId: null,
      ignored: false,
      amount: { gte: -gross - 0.005, lte: -gross + 0.005 },
      bookingDate: { gte: from, lte: to },
    },
    orderBy: { bookingDate: "asc" },
    take: 3,
    include: { bankAccount: { select: { name: true } } },
  });

  const { formatEuro, formatDate } = await import("@/lib/format");
  return {
    matches: candidates.map((t) => ({
      transactionId: t.id,
      label: `${formatEuro(Number(t.amount))} · ${formatDate(t.bookingDate)} · ${t.counterparty || t.purpose || "—"} · ${t.bankAccount.name}`,
    })),
  };
}

export async function linkPayment(receiptId: string, transactionId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, ...receiptScope(user) } });
  if (!receipt) return { ok: false };
  const accountFilter = accountVisibility(user);
  const txn = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      organizationId: user.organizationId,
      bankAccount: accountFilter,
      matchedReceiptId: null,
    },
  });
  if (!txn) return { ok: false };
  await db.bankTransaction.update({
    where: { id: transactionId },
    data: { matchedReceiptId: receiptId, ignored: false },
  });
  // Abgebuchte Zahlung gefunden → Beleg ist bezahlt
  await db.receipt.update({ where: { id: receiptId }, data: { paidStatus: "BEZAHLT" } });
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "receipt.payment_link",
    entityType: "receipt",
    entityId: receiptId,
    data: { transactionId },
  });
  revalidatePath("/belege");
  revalidatePath(`/belege/${receiptId}`);
  revalidatePath("/abgleich");
  return { ok: true };
}
