"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const companySchema = z.object({
  brandName: z.string().trim().min(1, "Markenname fehlt."),
  shortCode: z
    .string()
    .trim()
    .min(1, "Kürzel fehlt.")
    .max(8, "Kürzel: max. 8 Zeichen.")
    .regex(/^[A-Za-z0-9]+$/, "Kürzel: nur Buchstaben und Zahlen.")
    .transform((v) => v.toUpperCase()),
  legalName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  location: z.string().trim().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farbe: Hex-Format #RRGGBB.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  isPrivate: z.boolean(),
});

export type CompanyFormState = { error?: string };

function parseCompanyForm(formData: FormData) {
  return companySchema.safeParse({
    brandName: formData.get("brandName"),
    shortCode: formData.get("shortCode"),
    legalName: (formData.get("legalName") as string) || undefined,
    address: (formData.get("address") as string) || undefined,
    location: (formData.get("location") as string) || undefined,
    color: (formData.get("color") as string) || undefined,
    isPrivate: formData.get("isPrivate") === "on",
  });
}

export async function createCompany(
  _prev: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const admin = await requireAdmin();
  const parsed = parseCompanyForm(formData);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const exists = await db.company.findUnique({
    where: {
      organizationId_shortCode: {
        organizationId: admin.organizationId,
        shortCode: parsed.data.shortCode,
      },
    },
  });
  if (exists) return { error: `Kürzel "${parsed.data.shortCode}" ist bereits vergeben.` };

  const maxSort = await db.company.aggregate({
    where: { organizationId: admin.organizationId },
    _max: { sortOrder: true },
  });

  const company = await db.company.create({
    data: {
      organizationId: admin.organizationId,
      ...parsed.data,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "company.create",
    entityType: "company",
    entityId: company.id,
    data: { brandName: company.brandName, shortCode: company.shortCode },
  });
  revalidatePath("/einstellungen/firmen");
  redirect("/einstellungen/firmen");
}

export async function updateCompany(
  companyId: string,
  _prev: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const admin = await requireAdmin();
  const parsed = parseCompanyForm(formData);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: admin.organizationId },
  });
  if (!company) return { error: "Firma nicht gefunden." };

  const conflict = await db.company.findFirst({
    where: {
      organizationId: admin.organizationId,
      shortCode: parsed.data.shortCode,
      NOT: { id: companyId },
    },
  });
  if (conflict) return { error: `Kürzel "${parsed.data.shortCode}" ist bereits vergeben.` };

  await db.company.update({ where: { id: companyId }, data: parsed.data });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "company.update",
    entityType: "company",
    entityId: companyId,
    data: parsed.data,
  });
  revalidatePath("/einstellungen/firmen");
  redirect("/einstellungen/firmen");
}

export async function toggleCompanyActive(companyId: string) {
  const admin = await requireAdmin();
  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: admin.organizationId },
  });
  if (!company) return;
  await db.company.update({
    where: { id: companyId },
    data: { active: !company.active },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: company.active ? "company.deactivate" : "company.activate",
    entityType: "company",
    entityId: companyId,
  });
  revalidatePath("/einstellungen/firmen");
}
