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

// Konten-Scope: Mitglieder sehen/verwalten nur eigene Konten, Admin alle.
function accountScope(user: Pick<User, "organizationId" | "id" | "role">): Prisma.BankAccountWhereInput {
  const base: Prisma.BankAccountWhereInput = { organizationId: user.organizationId };
  if (user.role !== "ADMIN") base.userId = user.id;
  return base;
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
  const toMatch: string[] = [];

  for (const t of parsed.transactions) {
    const key = dedupeKey(t);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);

    const hay = normalizeText(`${t.counterparty ?? ""} ${t.purpose ?? ""}`);
    const rule = rules.find((r) => hay.includes(normalizeText(r.pattern)));

    const created = await db.bankTransaction.create({
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
    if (!rule && t.amount < 0) toMatch.push(created.id);
  }

  const matched = await autoMatch(user, account, toMatch);
  await autoReimburse(user, account);

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

// Belege, gegen die gematcht werden darf: bei persönlichem Konto die Belege des
// Konto-Eigentümers; sonst (Admin/Firmenkonto) org-weit.
function receiptMatchScope(user: Pick<User, "organizationId" | "role">, account: { userId: string | null }): Prisma.ReceiptWhereInput {
  const base: Prisma.ReceiptWhereInput = { organizationId: user.organizationId, status: "ABGELEGT" };
  if (account.userId) base.userId = account.userId;
  return base;
}

async function autoMatch(
  user: Pick<User, "organizationId" | "id" | "role">,
  account: { userId: string | null },
  transactionIds: string[]
): Promise<number> {
  if (transactionIds.length === 0) return 0;
  const { matchReceipts, isConfidentMatch } = await import("@/lib/bank/match");

  const txns = await db.bankTransaction.findMany({ where: { id: { in: transactionIds } } });
  const receipts = await db.receipt.findMany({
    where: receiptMatchScope(user, account),
    select: { id: true, grossAmount: true, receiptDate: true, vendor: true, transactions: { select: { id: true } } },
  });
  const available = receipts
    .filter((r) => r.transactions.length === 0)
    .map((r) => ({ id: r.id, grossAmount: Number(r.grossAmount), receiptDate: r.receiptDate, vendor: r.vendor }));

  let count = 0;
  const used = new Set<string>();
  for (const t of txns) {
    const cands = matchReceipts(
      { amount: Number(t.amount), bookingDate: t.bookingDate, counterparty: t.counterparty, purpose: t.purpose },
      available.filter((r) => !used.has(r.id))
    );
    const best = cands[0];
    if (isConfidentMatch(best) && (cands.length === 1 || cands[0].score - (cands[1]?.score ?? 0) > 0.3)) {
      await db.bankTransaction.update({ where: { id: t.id }, data: { matchedReceiptId: best.receiptId } });
      used.add(best.receiptId);
      count++;
    }
  }
  return count;
}

async function autoReimburse(
  user: Pick<User, "organizationId" | "role">,
  account: { userId: string | null }
): Promise<void> {
  const incoming = await db.bankTransaction.findMany({
    where: {
      organizationId: user.organizationId,
      // Erstattungen kommen auf ein Konto desselben Eigentümers zurück
      ...(account.userId ? { bankAccount: { userId: account.userId } } : {}),
      amount: { gt: 0 },
      matchedReceiptId: null,
      ignored: false,
    },
  });
  if (incoming.length === 0) return;
  const openExpenses = await db.receipt.findMany({
    where: {
      ...receiptMatchScope(user, account),
      kind: "AUSLAGE",
      reimbursementStatus: { in: ["OFFEN", "EINGEREICHT"] },
    },
    select: { id: true, grossAmount: true, receiptDate: true },
  });
  for (const inc of incoming) {
    const match = openExpenses.find(
      (e) => Math.abs(Number(e.grossAmount) - Number(inc.amount)) < 0.005 && inc.bookingDate >= e.receiptDate
    );
    if (match) {
      await db.receipt.update({
        where: { id: match.id },
        data: { reimbursementStatus: "ERSTATTET", reimbursedAt: inc.bookingDate },
      });
      await db.bankTransaction.update({ where: { id: inc.id }, data: { matchedReceiptId: match.id } });
      openExpenses.splice(openExpenses.indexOf(match), 1);
    }
  }
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
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: receiptId, ignored: false } });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function unmatch(transactionId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const txn = await findOwnTransaction(user, transactionId);
  if (!txn) return { ok: false };
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: null } });
  revalidatePath("/abgleich");
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
