"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseBankCsv } from "@/lib/bank/csv";
import { extractStatementPdf } from "@/lib/bank/pdf-extract";
import { normalizeText } from "@/lib/bank/match";
import { accountVisibility } from "@/lib/bank/scope";
import { receiptVisibility } from "@/lib/receipts";

// Konten-Scope: Mitglieder sehen/verwalten nur eigene Konten; Admins eigene
// und Mitarbeiter-Konten (nicht die anderer Admins).
function accountScope(user: Pick<User, "organizationId" | "id" | "role">): Prisma.BankAccountWhereInput {
  return { organizationId: user.organizationId, AND: [accountVisibility(user)] };
}

// ─── Bankkonten (gehören dem Benutzer) ───────────────────────────────────────

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  iban: z.string().trim().optional().nullable(),
  isPrivate: z.boolean(),
});

export type AccountFormState = { error?: string; ok?: boolean };

export async function saveBankAccount(
  accountId: string | null,
  _prev: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    iban: (formData.get("iban") as string) || null,
    isPrivate: formData.get("isPrivate") === "on",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = {
    name: parsed.data.name,
    iban: parsed.data.iban,
    isPrivate: parsed.data.isPrivate,
  };

  if (accountId) {
    const existing = await db.bankAccount.findFirst({ where: { id: accountId, ...accountScope(user) } });
    if (!existing) return { error: "Konto nicht gefunden." };
    await db.bankAccount.update({ where: { id: accountId }, data });
  } else {
    // Neues Konto gehört dem anlegenden Benutzer
    await db.bankAccount.create({
      data: { organizationId: user.organizationId, userId: user.id, ...data },
    });
  }
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: accountId ? "bankaccount.update" : "bankaccount.create",
    entityType: "bank_account",
    entityId: accountId ?? undefined,
    data: { name: data.name },
  });
  revalidatePath("/abgleich/konten");
  return { ok: true };
}

export async function toggleBankAccount(accountId: string) {
  const user = await requireUser();
  const acc = await db.bankAccount.findFirst({ where: { id: accountId, ...accountScope(user) } });
  if (!acc) return;
  await db.bankAccount.update({ where: { id: accountId }, data: { active: !acc.active } });
  revalidatePath("/abgleich/konten");
}

// ─── Auszug importieren ──────────────────────────────────────────────────────

function dedupeKey(t: { bookingDate: Date; amount: number; purpose: string | null; counterparty: string | null }) {
  return `${t.bookingDate.toISOString().slice(0, 10)}|${t.amount.toFixed(2)}|${normalizeText(t.purpose)}|${normalizeText(t.counterparty)}`;
}

export type ImportResult = { ok: boolean; imported?: number; skipped?: number; matched?: number; error?: string };

export async function importStatement(accountId: string, formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  const account = await db.bankAccount.findFirst({ where: { id: accountId, ...accountScope(user) } });
  if (!account) return { ok: false, error: "Konto nicht gefunden." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei." };
  const bytes = Buffer.from(await file.arrayBuffer());

  let parsed;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const res = await extractStatementPdf(bytes);
    if (res.error && res.transactions.length === 0) return { ok: false, error: res.error };
    parsed = { transactions: res.transactions, skipped: 0 };
  } else {
    let content = bytes.toString("utf8");
    if (content.includes("�")) content = bytes.toString("latin1");
    const res = parseBankCsv(content);
    if (res.error) return { ok: false, error: res.error };
    parsed = res;
  }

  const existing = await db.bankTransaction.findMany({
    where: { bankAccountId: accountId },
    select: { bookingDate: true, amount: true, purpose: true, counterparty: true },
  });
  const existingKeys = new Set(existing.map((e) => dedupeKey({ ...e, amount: Number(e.amount) })));

  // Merkregeln: für Mitglieder die eigenen, Admin org-weit
  const rules = await db.matchRule.findMany({
    where: { organizationId: user.organizationId, active: true },
  });

  let imported = 0;
  let skipped = parsed.skipped;

  for (const t of parsed.transactions) {
    const key = dedupeKey(t);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);

    const hay = normalizeText(`${t.counterparty ?? ""} ${t.purpose ?? ""}`);
    const rule = rules.find((r) => hay.includes(normalizeText(r.pattern)));

    await db.bankTransaction.create({
      data: {
        organizationId: user.organizationId,
        bankAccountId: accountId,
        bookingDate: t.bookingDate,
        amount: t.amount,
        counterparty: t.counterparty,
        purpose: t.purpose,
        raw: t.raw as object,
        ignored: rule?.action === "IGNORE",
        matchRuleId: rule?.id ?? null,
        // Wenn das Konto eine Standardfirma hat, vorbelegen
        companyId: account.companyId ?? null,
      },
    });
    imported++;
  }

  // Beleg-Treffer werden bewusst NICHT automatisch verknüpft – sie erscheinen
  // als Vorschläge in der Buchungen-Ansicht und werden per Klick bestätigt.
  const matched = 0;

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "statement.import",
    entityType: "bank_account",
    entityId: accountId,
    data: { imported, skipped, matched },
  });
  revalidatePath("/abgleich");
  return { ok: true, imported, skipped, matched };
}

// Buchung gehört einem Benutzer, wenn ihr Konto ihm gehört (oder Admin)
async function findOwnTransaction(user: Pick<User, "organizationId" | "id" | "role">, transactionId: string) {
  return db.bankTransaction.findFirst({
    where: { id: transactionId, organizationId: user.organizationId, bankAccount: accountScope(user) },
  });
}

// ─── Zuordnen / Firma pro Buchung / Ignorieren ───────────────────────────────

export async function confirmMatch(transactionId: string, receiptId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, organizationId: user.organizationId, AND: [receiptVisibility(user)] },
  });
  if (!receipt) return { ok: false };
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: receiptId, ignored: false } });
  // Status des Belegs nachziehen: Eingang auf Auslage = erstattet,
  // Abbuchung = Beleg ist bezahlt
  if (Number(txn.amount) > 0 && receipt.kind === "AUSLAGE") {
    await db.receipt.update({
      where: { id: receiptId },
      data: { reimbursementStatus: "ERSTATTET", reimbursedAt: txn.bookingDate },
    });
  } else if (Number(txn.amount) < 0) {
    await db.receipt.update({ where: { id: receiptId }, data: { paidStatus: "BEZAHLT" } });
  }
  revalidatePath("/abgleich");
  return { ok: true };
}

// Freigabe: Buchung ist geprüft und zugeordnet → abhaken (bzw. wieder öffnen)
export async function setTransactionReviewed(transactionId: string, reviewed: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };
  await db.bankTransaction.update({ where: { id: transactionId }, data: { reviewed } });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function unmatch(transactionId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };
  // Auch Sammel-Verknüpfungen (mehrere Belege pro Buchung) lösen
  await db.transactionReceiptLink.deleteMany({ where: { transactionId } });
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: null } });
  revalidatePath("/abgleich");
  return { ok: true };
}

// Sammel-Abbuchung mehreren Belegen zuordnen (z. B. Amazon: eine Abbuchung,
// mehrere Einzelrechnungen). Verknüpft alle Belege über die Link-Tabelle und
// setzt matchedReceiptId auf den ersten, damit die Buchung als zugeordnet gilt.
export async function confirmMatchGroup(transactionId: string, receiptIds: string[]): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const ids = [...new Set(receiptIds)].slice(0, 10);
  if (ids.length === 0) return { ok: false };
  if (ids.length === 1) return confirmMatch(transactionId, ids[0]);

  const txn = await findOwnTransaction(user, transactionId);
  if (!txn || txn.matchedReceiptId) return { ok: false };

  const receipts = await db.receipt.findMany({
    where: {
      id: { in: ids },
      organizationId: user.organizationId,
      status: "ABGELEGT",
      AND: [receiptVisibility(user)],
    },
  });
  if (receipts.length !== ids.length) return { ok: false };

  await db.$transaction([
    db.transactionReceiptLink.createMany({
      data: ids.map((receiptId) => ({ transactionId, receiptId })),
      skipDuplicates: true,
    }),
    db.bankTransaction.update({
      where: { id: transactionId },
      data: { matchedReceiptId: ids[0], ignored: false },
    }),
  ]);

  // Status aller Belege nachziehen (wie beim Einzel-Match)
  if (Number(txn.amount) < 0) {
    await db.receipt.updateMany({ where: { id: { in: ids } }, data: { paidStatus: "BEZAHLT" } });
  } else {
    await db.receipt.updateMany({
      where: { id: { in: ids }, kind: "AUSLAGE" },
      data: { reimbursementStatus: "ERSTATTET", reimbursedAt: txn.bookingDate },
    });
  }

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "transaction.match_group",
    entityType: "bank_transaction",
    entityId: transactionId,
    data: { receiptIds: ids },
  });
  revalidatePath("/abgleich");
  revalidatePath("/belege");
  return { ok: true };
}

// "Diese Ausgabe war für Firma X" (bzw. keine Firma)
export async function setTransactionCompany(transactionId: string, companyId: string | null): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };
  if (companyId) {
    const company = await db.company.findFirst({ where: { id: companyId, organizationId: user.organizationId } });
    if (!company) return { ok: false };
  }
  await db.bankTransaction.update({ where: { id: transactionId }, data: { companyId } });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function setIgnored(transactionId: string, ignored: boolean, remember: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };

  let matchRuleId: string | null = txn.matchRuleId;
  if (ignored && remember) {
    const pattern = (txn.counterparty || txn.purpose || "").slice(0, 60);
    if (pattern) {
      const rule = await db.matchRule.create({
        data: { organizationId: user.organizationId, pattern, action: "IGNORE", note: "Aus Abgleich gemerkt" },
      });
      matchRuleId = rule.id;
    }
  }
  await db.bankTransaction.update({
    where: { id: transactionId },
    data: { ignored, matchRuleId: ignored ? matchRuleId : null },
  });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function deleteMatchRule(ruleId: string) {
  const user = await requireUser();
  const rule = await db.matchRule.findFirst({ where: { id: ruleId, organizationId: user.organizationId } });
  if (!rule) return;
  await db.matchRule.update({ where: { id: ruleId }, data: { active: false } });
  revalidatePath("/abgleich/regeln");
}
