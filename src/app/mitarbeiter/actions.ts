"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { extractReceipt } from "@/lib/claude";
import { generateAndStorePdf, nextReceiptNumber } from "@/lib/receipts";
import { extForMime } from "@/lib/storage";
import { formatEuro, formatDate } from "@/lib/format";

// Öffentlicher Mitarbeiter-Link: kein Konto nötig, nur das Link-Passwort
// (Einstellungen → Organisation, Standard "123"). Alle Belege laufen über das
// System-Konto "Mitarbeiter-Link" und landen im Ordner "Auslagen Mitarbeiter".

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024;

const SYSTEM_EMAIL = "mitarbeiter@link.intern";

async function checkPassword(password: string) {
  const org = await db.organization.findFirst();
  if (!org) return null;
  if ((password ?? "").trim() !== org.employeeLinkPassword) return null;
  return org;
}

export async function employeeGate(password: string): Promise<{ ok: boolean }> {
  return { ok: Boolean(await checkPassword(password)) };
}

export type EmployeeItem = {
  id: string;
  title: string;
  einsatz: string;
  date: string;
  amount: string;
  status: "pruefung" | "erstattet" | "abgelehnt";
  // Kommentar des Admins bei Ablehnung
  comment: string | null;
};

export type EmployeeOverview = {
  ok: boolean;
  openAmount?: string;
  openCount?: number;
  reimbursedAmount?: string;
  totalCount?: number;
  items?: EmployeeItem[];
};

// Übersicht für den Mitarbeiter: eigene eingereichte Belege (per Name),
// offener Erstattungsbetrag als Hero-Zahl, Status pro Beleg.
export async function employeeOverview(password: string, name: string): Promise<EmployeeOverview> {
  const org = await checkPassword(password);
  if (!org || !name.trim()) return { ok: false };

  const receipts = await db.receipt.findMany({
    where: {
      organizationId: org.id,
      viaEmployeeLink: true,
      status: "ABGELEGT",
      submittedByName: { equals: name.trim(), mode: "insensitive" },
    },
    orderBy: { receiptDate: "desc" },
    take: 50,
    select: {
      id: true,
      vendor: true,
      purpose: true,
      receiptDate: true,
      grossAmount: true,
      reimbursementStatus: true,
      employeeReview: true,
      employeeReviewComment: true,
    },
  });

  let open = 0;
  let reimbursed = 0;
  let openCount = 0;
  for (const r of receipts) {
    const gross = Number(r.grossAmount) || 0;
    if (r.employeeReview === "ABGELEHNT") continue; // zählt nicht als offen
    if (r.reimbursementStatus === "ERSTATTET") reimbursed += gross;
    else {
      open += gross;
      openCount++;
    }
  }

  return {
    ok: true,
    openAmount: formatEuro(open),
    openCount,
    reimbursedAmount: formatEuro(reimbursed),
    totalCount: receipts.length,
    items: receipts.map((r) => ({
      id: r.id,
      title: r.vendor || "Beleg",
      einsatz: r.purpose ?? "",
      date: formatDate(r.receiptDate),
      amount: formatEuro(Number(r.grossAmount)),
      status:
        r.employeeReview === "ABGELEHNT"
          ? ("abgelehnt" as const)
          : r.reimbursementStatus === "ERSTATTET"
            ? ("erstattet" as const)
            : ("pruefung" as const),
      comment: r.employeeReview === "ABGELEHNT" ? (r.employeeReviewComment ?? null) : null,
    })),
  };
}

const submitSchema = z.object({
  name: z.string().trim().min(1, "Bitte deinen vollen Namen eingeben."),
  auftrag: z.string().trim().min(1, "Bitte den Einsatz / Auftrag eingeben."),
  grund: z.string().trim().min(1, "Bitte kurz den Grund der Ausgabe eingeben."),
  zahlungsart: z.enum(["BAR", "PRIVATE_KARTE"]),
  erhalten: z.enum(["ERHALTEN", "AUSSTEHEND"]),
});

export type EmployeeSubmitResult = { ok: boolean; receiptNumber?: string; error?: string };

export async function employeeSubmit(password: string, formData: FormData): Promise<EmployeeSubmitResult> {
  const org = await checkPassword(password);
  if (!org) return { ok: false, error: "Falsches Passwort – bitte Seite neu laden." };

  const parsed = submitSchema.safeParse({
    name: formData.get("name"),
    auftrag: formData.get("auftrag"),
    grund: formData.get("grund"),
    zahlungsart: formData.get("zahlungsart"),
    erhalten: formData.get("erhalten"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Bitte einen Beleg fotografieren oder hochladen." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };

  let mime = file.type;
  if (!ACCEPTED.includes(mime)) {
    const fname = file.name.toLowerCase();
    if (fname.endsWith(".jpg") || fname.endsWith(".jpeg")) mime = "image/jpeg";
    else if (fname.endsWith(".png")) mime = "image/png";
    else if (fname.endsWith(".pdf")) mime = "application/pdf";
    else return { ok: false, error: "Dateityp nicht unterstützt (JPG, PNG, PDF)." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());

  // System-Konto, über das alle Mitarbeiter-Link-Belege laufen
  const systemUser = await db.user.findUnique({ where: { email: SYSTEM_EMAIL } });
  if (!systemUser) return { ok: false, error: "Mitarbeiter-Link ist nicht eingerichtet (Seed fehlt)." };

  // Ziel-Firma: fess.jobs, sonst erste aktive Firma
  const company =
    (await db.company.findFirst({ where: { organizationId: org.id, shortCode: "FJ", active: true } })) ??
    (await db.company.findFirst({ where: { organizationId: org.id, active: true }, orderBy: { sortOrder: "asc" } }));
  if (!company) return { ok: false, error: "Keine aktive Firma vorhanden." };

  // Automatisch auslesen (falls möglich) – Fehler sind hier nicht kritisch
  let extractedDate = new Date();
  let vendor = "";
  let gross = 0;
  let net: number | null = null;
  let vatLines: unknown = [];
  try {
    const categories = await db.category.findMany({
      where: { organizationId: org.id, active: true },
      select: { name: true },
    });
    const ex = await extractReceipt(bytes, mime, categories.map((c) => c.name));
    if (ex.receiptDate) extractedDate = new Date(ex.receiptDate);
    if (ex.vendor) vendor = ex.vendor;
    if (ex.grossAmount !== null) gross = ex.grossAmount;
    if (ex.netAmount !== null) net = ex.netAmount;
    vatLines = ex.vatLines;
  } catch {
    // Beleg wird trotzdem angelegt, Admin kann korrigieren
  }

  const receipt = await db.$transaction(async (tx) => {
    const num = await nextReceiptNumber(tx, company, extractedDate.getFullYear());
    return tx.receipt.create({
      data: {
        organizationId: org.id,
        userId: systemUser.id,
        companyId: company.id,
        receiptDate: extractedDate,
        vendor,
        grossAmount: gross,
        netAmount: net,
        vatLines: vatLines as object,
        kind: "AUSLAGE",
        paymentMethod: parsed.data.zahlungsart,
        purpose: parsed.data.auftrag,
        notes: `Grund: ${parsed.data.grund}`,
        submittedByName: parsed.data.name,
        viaEmployeeLink: true,
        employeeReview: "AUSSTEHEND",
        reimbursementStatus: parsed.data.erhalten === "ERHALTEN" ? "ERSTATTET" : "OFFEN",
        ...(parsed.data.erhalten === "ERHALTEN" ? { reimbursedAt: new Date() } : {}),
        status: "ABGELEGT",
        ...num,
      },
    });
  });

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

  const full = await db.receipt.findUniqueOrThrow({
    where: { id: receipt.id },
    include: { company: true, category: true, user: true, vehicle: true },
  });
  await generateAndStorePdf(full, org.brandName, systemUser.id);

  await logAudit({
    organizationId: org.id,
    userId: systemUser.id,
    action: "receipt.employee_link",
    entityType: "receipt",
    entityId: receipt.id,
    data: { receiptNumber: receipt.receiptNumber, submittedBy: parsed.data.name },
  });

  return { ok: true, receiptNumber: receipt.receiptNumber ?? undefined };
}
