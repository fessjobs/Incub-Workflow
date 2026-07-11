"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type CategoryFormState = { error?: string };

const nameSchema = z.string().trim().min(1, "Name fehlt.").max(60, "Name: max. 60 Zeichen.");

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const admin = await requireAdmin();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const exists = await db.category.findUnique({
    where: {
      organizationId_name: { organizationId: admin.organizationId, name: parsed.data },
    },
  });
  if (exists) return { error: `Kategorie "${parsed.data}" existiert bereits.` };

  const maxSort = await db.category.aggregate({
    where: { organizationId: admin.organizationId },
    _max: { sortOrder: true },
  });
  const category = await db.category.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data,
      isHospitality: formData.get("isHospitality") === "on",
      isFuel: formData.get("isFuel") === "on",
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "category.create",
    entityType: "category",
    entityId: category.id,
    data: { name: category.name },
  });
  revalidatePath("/einstellungen/kategorien");
  return {};
}

export async function renameCategory(
  categoryId: string,
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const admin = await requireAdmin();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const category = await db.category.findFirst({
    where: { id: categoryId, organizationId: admin.organizationId },
  });
  if (!category) return { error: "Kategorie nicht gefunden." };

  const conflict = await db.category.findFirst({
    where: {
      organizationId: admin.organizationId,
      name: parsed.data,
      NOT: { id: categoryId },
    },
  });
  if (conflict) return { error: `Kategorie "${parsed.data}" existiert bereits.` };

  await db.category.update({ where: { id: categoryId }, data: { name: parsed.data } });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "category.rename",
    entityType: "category",
    entityId: categoryId,
    data: { from: category.name, to: parsed.data },
  });
  revalidatePath("/einstellungen/kategorien");
  return {};
}

export async function toggleCategoryActive(categoryId: string) {
  const admin = await requireAdmin();
  const category = await db.category.findFirst({
    where: { id: categoryId, organizationId: admin.organizationId },
  });
  if (!category) return;
  await db.category.update({
    where: { id: categoryId },
    data: { active: !category.active },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: category.active ? "category.deactivate" : "category.activate",
    entityType: "category",
    entityId: categoryId,
  });
  revalidatePath("/einstellungen/kategorien");
}

export async function deleteCategory(categoryId: string) {
  const admin = await requireAdmin();
  const category = await db.category.findFirst({
    where: { id: categoryId, organizationId: admin.organizationId },
    include: { _count: { select: { receipts: true } } },
  });
  if (!category) return;
  // Kategorien mit Belegen nur deaktivieren, nie löschen (Historie!)
  if (category._count.receipts > 0) {
    await db.category.update({ where: { id: categoryId }, data: { active: false } });
  } else {
    await db.category.delete({ where: { id: categoryId } });
  }
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "category.delete",
    entityType: "category",
    entityId: categoryId,
    data: { name: category.name },
  });
  revalidatePath("/einstellungen/kategorien");
}
