"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseBankCsv } from "@/lib/bank/csv";
import { extractStatementPdf } from "@/lib/bank/pdf-extract";
import { normalizeText } from "@/lib/bank/match";

// ─── Bankkonten ──────────────────────────────────────────────────────────────

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  iban: z.string().trim().optional().nullable(),
  companyId: z.string().trim().optional().nullable(),
  isPrivate: z.boolean(),
});

export type AccountFormState = { error?: string; ok?: boolean };

export async function saveBankAccount(
  accountId: string | null,
  _prev: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const admin = await requireAdmin();
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    iban: (formData.get("iban") as string) || null,
    companyId: (formData.get("companyId") as string) || null,
    isPrivate: formData.get("isPrivate") === "on",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = {
    name: parsed.data.name,
    iban: parsed.data.iban,
    companyId: parsed.data.isPrivate ? null : parsed.data.companyId || null,
    isPrivate: parsed.data.isPrivate,
  };

  if (accountId) {
    const existing = await db.bankAccount.findFirst({ where: { id: accountId, organizationId: admin.organizationId } });
    if (!existing) return { error: "Konto nicht gefunden." };
    await db.bankAccount.update({ where: { id: accountId }, data });
  } else {
    await db.bankAccount.create({ data: { organizationId: admin.organizationId, ...data } });
  }
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: accountId ? "bankaccount.update" : "bankaccount.create",
    entityType: "bank_account",
    entityId: accountId ?? undefined,
    data: { name: data.name },
  });
  revalidatePath("/abgleich/konten");
  return { ok: true };
}

export async function toggleBankAccount(accountId: string) {
  const admin = await requireAdmin();
  const acc = await db.bankAccount.findFirst({ where: { id: accountId, organizationId: admin.organizationId } });
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
  const admin = await requireAdmin();
  const account = await db.bankAccount.findFirst({ where: { id: accountId, organizationId: admin.organizationId } });
  if (!account) return { ok: false, error: "Konto nicht gefunden." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei." };
  const bytes = Buffer.from(await file.arrayBuffer());

  // CSV oder PDF
  let parsed;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const res = await extractStatementPdf(bytes);
    if (res.error && res.transactions.length === 0) return { ok: false, error: res.error };
    parsed = { transactions: res.transactions, skipped: 0 };
  } else {
    // CSV: mehrere Encodings tolerant lesen
    let content = bytes.toString("utf8");
    if (content.includes("�")) content = bytes.toString("latin1");
    const res = parseBankCsv(content);
    if (res.error) return { ok: false, error: res.error };
    parsed = res;
  }

  // Dubletten gegen bereits importierte Buchungen dieses Kontos
  const existing = await db.bankTransaction.findMany({
    where: { bankAccountId: accountId },
    select: { bookingDate: true, amount: true, purpose: true, counterparty: true },
  });
  const existingKeys = new Set(
    existing.map((e) => dedupeKey({ ...e, amount: Number(e.amount) }))
  );

  const rules = await db.matchRule.findMany({ where: { organizationId: admin.organizationId, active: true } });

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

    // Merkregel? (z. B. Miete/Gehälter automatisch ignorieren)
    const hay = normalizeText(`${t.counterparty ?? ""} ${t.purpose ?? ""}`);
    const rule = rules.find((r) => hay.includes(normalizeText(r.pattern)));

    const created = await db.bankTransaction.create({
      data: {
        organizationId: admin.organizationId,
        bankAccountId: accountId,
        bookingDate: t.bookingDate,
        amount: t.amount,
        counterparty: t.counterparty,
        purpose: t.purpose,
        raw: t.raw as object,
        ignored: rule?.action === "IGNORE",
        matchRuleId: rule?.id ?? null,
      },
    });
    imported++;
    if (!rule && t.amount < 0) toMatch.push(created.id);
  }

  // Automatisches Matching für neue Ausgaben
  const matched = await autoMatch(admin.organizationId, toMatch);

  // Erstattungs-Automatik: Eingänge könnten Auslagen-Erstattungen sein
  await autoReimburse(admin.organizationId);

  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "statement.import",
    entityType: "bank_account",
    entityId: accountId,
    data: { imported, skipped, matched },
  });
  revalidatePath("/abgleich");
  return { ok: true, imported, skipped, matched };
}

// Automatisch sichere Matches setzen (Betrag exakt, Datum ±3, eindeutig)
async function autoMatch(organizationId: string, transactionIds: string[]): Promise<number> {
  if (transactionIds.length === 0) return 0;
  const { matchReceipts, isConfidentMatch } = await import("@/lib/bank/match");

  const txns = await db.bankTransaction.findMany({ where: { id: { in: transactionIds } } });
  // Kandidaten-Belege: abgelegt, noch nicht gematcht
  const receipts = await db.receipt.findMany({
    where: { organizationId, status: "ABGELEGT" },
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
    // Nur eindeutige, sichere Treffer automatisch setzen
    if (isConfidentMatch(best) && (cands.length === 1 || cands[0].score - (cands[1]?.score ?? 0) > 0.3)) {
      await db.bankTransaction.update({ where: { id: t.id }, data: { matchedReceiptId: best.receiptId } });
      used.add(best.receiptId);
      count++;
    }
  }
  return count;
}

// Erstattungs-Automatik: positive Buchung, die betragsmäßig einer offenen
// Auslage entspricht → Auslage auf ERSTATTET setzen
async function autoReimburse(organizationId: string): Promise<void> {
  const incoming = await db.bankTransaction.findMany({
    where: { organizationId, amount: { gt: 0 }, matchedReceiptId: null, ignored: false },
  });
  if (incoming.length === 0) return;
  const openExpenses = await db.receipt.findMany({
    where: {
      organizationId,
      kind: "AUSLAGE",
      reimbursementStatus: { in: ["OFFEN", "EINGEREICHT"] },
      status: "ABGELEGT",
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

// ─── Abhaken / Zuordnen / Ignorieren ─────────────────────────────────────────

export async function confirmMatch(transactionId: string, receiptId: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const txn = await db.bankTransaction.findFirst({ where: { id: transactionId, organizationId: admin.organizationId } });
  if (!txn) return { ok: false };
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: receiptId, ignored: false } });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function unmatch(transactionId: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const txn = await db.bankTransaction.findFirst({ where: { id: transactionId, organizationId: admin.organizationId } });
  if (!txn) return { ok: false };
  await db.bankTransaction.update({ where: { id: transactionId }, data: { matchedReceiptId: null } });
  revalidatePath("/abgleich");
  return { ok: true };
}

export async function setIgnored(transactionId: string, ignored: boolean, remember: boolean): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const txn = await db.bankTransaction.findFirst({ where: { id: transactionId, organizationId: admin.organizationId } });
  if (!txn) return { ok: false };

  let matchRuleId: string | null = txn.matchRuleId;
  if (ignored && remember) {
    // Merkregel für wiederkehrende Buchungen (z. B. Miete, Gehälter)
    const pattern = (txn.counterparty || txn.purpose || "").slice(0, 60);
    if (pattern) {
      const rule = await db.matchRule.create({
        data: { organizationId: admin.organizationId, pattern, action: "IGNORE", note: "Aus Abgleich gemerkt" },
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
  const admin = await requireAdmin();
  const rule = await db.matchRule.findFirst({ where: { id: ruleId, organizationId: admin.organizationId } });
  if (!rule) return;
  await db.matchRule.update({ where: { id: ruleId }, data: { active: false } });
  revalidatePath("/abgleich/regeln");
}
