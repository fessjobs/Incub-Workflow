"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { loadDemoData, clearDemoData } from "@/lib/demo";

export type OrgFormState = { error?: string; success?: boolean };

const orgSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  brandName: z.string().trim().min(1, "Produktname fehlt."),
  tagline: z.string().trim().max(80, "Tagline: max. 80 Zeichen."),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farbe: Hex-Format #RRGGBB."),
  storagePath: z.string().trim().min(1, "Ablagepfad fehlt."),
});

export async function updateOrganization(
  _prev: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const admin = await requireAdmin();
  const parsed = orgSchema.safeParse({
    name: formData.get("name"),
    brandName: formData.get("brandName"),
    tagline: formData.get("tagline"),
    primaryColor: formData.get("primaryColor"),
    storagePath: formData.get("storagePath"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  await db.organization.update({
    where: { id: admin.organizationId },
    data: parsed.data,
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "organization.update",
    entityType: "organization",
    entityId: admin.organizationId,
    data: parsed.data,
  });
  revalidatePath("/einstellungen/organisation");
  return { success: true };
}

export async function toggleDemoData(load: boolean): Promise<{ ok: boolean; count?: number }> {
  const admin = await requireAdmin();
  if (load) {
    await clearDemoData(admin.organizationId); // erst alte Demo weg, dann neu
    const count = await loadDemoData(admin.organizationId, admin.id);
    await logAudit({ organizationId: admin.organizationId, userId: admin.id, action: "demo.load", entityType: "organization" });
    revalidatePath("/einstellungen/organisation");
    revalidatePath("/dashboard");
    return { ok: true, count };
  }
  await clearDemoData(admin.organizationId);
  await logAudit({ organizationId: admin.organizationId, userId: admin.id, action: "demo.clear", entityType: "organization" });
  revalidatePath("/einstellungen/organisation");
  revalidatePath("/dashboard");
  return { ok: true, count: 0 };
}

export async function completeOnboarding(): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  await db.organization.update({ where: { id: admin.organizationId }, data: { onboarded: true } });
  revalidatePath("/dashboard");
  return { ok: true };
}
