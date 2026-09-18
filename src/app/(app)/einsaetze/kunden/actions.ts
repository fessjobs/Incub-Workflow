"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireDispo } from "@/lib/einsatz/access";
import { CustomerSchema } from "@/lib/einsatz/schemas";

export type FormState = { error?: string; ok?: boolean };

export async function saveCustomer(customerId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDispo();
  const parsed = CustomerSchema.safeParse({
    name: formData.get("name"),
    adresse: formData.get("adresse"),
    ustid: formData.get("ustid"),
    ansprechpartner: formData.get("ansprechpartner"),
    ansprechpartnerEmail: formData.get("ansprechpartnerEmail"),
    ansprechpartnerTelefon: formData.get("ansprechpartnerTelefon"),
    standardEinsatzort: formData.get("standardEinsatzort"),
    bundesland: formData.get("bundesland"),
    aueVertragRef: formData.get("aueVertragRef"),
    aktiv: formData.get("aktiv") === "on",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = { ...parsed.data, ansprechpartnerEmail: parsed.data.ansprechpartnerEmail ?? null, bundesland: parsed.data.bundesland ?? null };
  const conflict = await db.customer.findFirst({ where: { organizationId: user.organizationId, name: data.name, ...(customerId ? { NOT: { id: customerId } } : {}) } });
  if (conflict) return { error: "Ein Kunde mit diesem Namen existiert bereits." };
  if (customerId) {
    const existing = await db.customer.findFirst({ where: { id: customerId, organizationId: user.organizationId } });
    if (!existing) return { error: "Kunde nicht gefunden." };
    await db.customer.update({ where: { id: customerId }, data });
  } else {
    await db.customer.create({ data: { ...data, organizationId: user.organizationId, createdById: user.id } });
  }
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: customerId ? "customer.update" : "customer.create", entityType: "customer", entityId: customerId ?? undefined, data: { name: data.name } });
  revalidatePath("/einsaetze/kunden");
  return { ok: true };
}

export async function toggleCustomer(customerId: string): Promise<void> {
  const user = await requireDispo();
  const c = await db.customer.findFirst({ where: { id: customerId, organizationId: user.organizationId } });
  if (!c) return;
  await db.customer.update({ where: { id: c.id }, data: { aktiv: !c.aktiv } });
  revalidatePath("/einsaetze/kunden");
}
