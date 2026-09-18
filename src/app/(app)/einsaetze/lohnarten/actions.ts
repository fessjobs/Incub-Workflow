"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireReviewer } from "@/lib/einsatz/access";
import { DeductionSchema, WageRuleSchema } from "@/lib/einsatz/schemas";
import { keyToDateOnly } from "@/lib/einsatz/tz";
import { DEFAULT_WAGE_RULES } from "@/lib/einsatz/wage";

export type FormState = { error?: string; ok?: boolean };

export async function saveWageRule(ruleId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireReviewer();
  const parsed = WageRuleSchema.safeParse({
    name: formData.get("name"),
    typ: formData.get("typ"),
    lohnart: formData.get("lohnart"),
    faktor: Number(String(formData.get("faktor") ?? "1").replace(",", ".")),
    aktiv: formData.get("aktiv") === "on",
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    bedingung: formData.get("bedingung") ?? "{}",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  let bedingung: object;
  try {
    bedingung = JSON.parse(parsed.data.bedingung || "{}");
    if (typeof bedingung !== "object" || bedingung === null || Array.isArray(bedingung)) throw new Error();
  } catch {
    return { error: "Bedingung muss ein JSON-Objekt sein, z. B. {\"stunden\": 4}." };
  }
  const data = { name: parsed.data.name, typ: parsed.data.typ, lohnart: parsed.data.lohnart, faktor: parsed.data.faktor, aktiv: parsed.data.aktiv, sortOrder: parsed.data.sortOrder, bedingung };
  if (ruleId) {
    const existing = await db.wageRule.findFirst({ where: { id: ruleId, organizationId: user.organizationId } });
    if (!existing) return { error: "Regel nicht gefunden." };
    await db.wageRule.update({ where: { id: ruleId }, data });
    await logAudit({ organizationId: user.organizationId, userId: user.id, action: "wage_rule.update", entityType: "wage_rule", entityId: ruleId, data: { alt: { ...existing, faktor: Number(existing.faktor) }, neu: data } });
  } else {
    const created = await db.wageRule.create({ data: { ...data, organizationId: user.organizationId } });
    await logAudit({ organizationId: user.organizationId, userId: user.id, action: "wage_rule.create", entityType: "wage_rule", entityId: created.id, data: { neu: data } });
  }
  revalidatePath("/einsaetze/lohnarten");
  return { ok: true };
}

export async function deleteWageRule(ruleId: string): Promise<void> {
  const user = await requireReviewer();
  const existing = await db.wageRule.findFirst({ where: { id: ruleId, organizationId: user.organizationId } });
  if (!existing) return;
  await db.wageRule.delete({ where: { id: ruleId } });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "wage_rule.delete", entityType: "wage_rule", entityId: ruleId, data: { alt: { name: existing.name, lohnart: existing.lohnart } } });
  revalidatePath("/einsaetze/lohnarten");
}

export async function resetWageRules(): Promise<void> {
  const user = await requireReviewer();
  const missing = DEFAULT_WAGE_RULES.filter(() => true);
  const existing = await db.wageRule.findMany({ where: { organizationId: user.organizationId }, select: { typ: true, name: true } });
  for (const r of missing) {
    if (existing.some((e) => e.typ === r.typ && e.name === r.name)) continue;
    await db.wageRule.create({ data: { organizationId: user.organizationId, name: r.name, typ: r.typ, bedingung: r.bedingung as object, lohnart: r.lohnart, faktor: r.faktor, aktiv: r.aktiv, sortOrder: r.sortOrder } });
  }
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "wage_rule.reset", entityType: "wage_rule" });
  revalidatePath("/einsaetze/lohnarten");
}

export async function addDeduction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireReviewer();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim().replace(",", ".");
    return v === "" ? null : Number(v);
  };
  const parsed = DeductionSchema.safeParse({
    employeeId: formData.get("employeeId"),
    datum: formData.get("datum"),
    lohnart: formData.get("lohnart"),
    stunden: num("stunden"),
    betrag: num("betrag"),
    grund: formData.get("grund"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  if (parsed.data.stunden === null && parsed.data.betrag === null) return { error: "Stunden oder Betrag angeben." };
  const emp = await db.employee.findFirst({ where: { id: parsed.data.employeeId, organizationId: user.organizationId } });
  if (!emp) return { error: "Mitarbeiter nicht gefunden." };
  const d = parsed.data;
  const created = await db.manualDeduction.create({
    data: { organizationId: user.organizationId, employeeId: d.employeeId, datum: keyToDateOnly(d.datum), lohnart: d.lohnart, stunden: d.stunden, betrag: d.betrag, grund: d.grund, createdById: user.id },
  });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "deduction.create", entityType: "manual_deduction", entityId: created.id, data: { ...d } });
  revalidatePath("/einsaetze/lohnarten");
  return { ok: true };
}

export async function deleteDeduction(id: string): Promise<void> {
  const user = await requireReviewer();
  const existing = await db.manualDeduction.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return;
  await db.manualDeduction.delete({ where: { id } });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "deduction.delete", entityType: "manual_deduction", entityId: id, data: { alt: { grund: existing.grund, stunden: existing.stunden ? Number(existing.stunden) : null, betrag: existing.betrag ? Number(existing.betrag) : null } } });
  revalidatePath("/einsaetze/lohnarten");
}

export async function toggleMonthLock(jahr: number, monat: number): Promise<void> {
  const user = await requireReviewer();
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || monat < 1 || monat > 12) return;
  const existing = await db.monthLock.findUnique({ where: { organizationId_jahr_monat: { organizationId: user.organizationId, jahr, monat } } });
  if (existing) await db.monthLock.delete({ where: { id: existing.id } });
  else await db.monthLock.create({ data: { organizationId: user.organizationId, jahr, monat, gesperrtVon: user.id } });
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: existing ? "month.unlock" : "month.lock", entityType: "month_lock", data: { jahr, monat } });
  revalidatePath("/einsaetze/lohnarten");
  revalidatePath("/auswertung");
}
