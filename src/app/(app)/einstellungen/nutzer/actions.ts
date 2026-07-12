"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type UserFormState = { error?: string };

const baseUserSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail."),
  role: z.enum(["ADMIN", "MEMBER", "EINREICHER"]),
});

function readCompanyIds(formData: FormData): string[] {
  return formData.getAll("companyIds").map(String).filter(Boolean);
}

export async function createUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const admin = await requireAdmin();
  const parsed = baseUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Passwort: mindestens 8 Zeichen." };

  const exists = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { error: "Diese E-Mail ist bereits vergeben." };

  const companyIds = readCompanyIds(formData);
  const user = await db.user.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(password, 12),
      companyAccess: {
        create: companyIds.map((companyId) => ({ companyId })),
      },
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "user.create",
    entityType: "user",
    entityId: user.id,
    data: { email: user.email, role: user.role },
  });
  revalidatePath("/einstellungen/nutzer");
  redirect("/einstellungen/nutzer");
}

export async function updateUser(
  userId: string,
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const admin = await requireAdmin();
  const parsed = baseUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const user = await db.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId },
  });
  if (!user) return { error: "Nutzer nicht gefunden." };

  // Sich selbst nicht die Admin-Rolle entziehen (Aussperr-Schutz)
  if (user.id === admin.id && parsed.data.role !== "ADMIN") {
    return { error: "Du kannst dir nicht selbst die Admin-Rolle entziehen." };
  }

  const conflict = await db.user.findFirst({
    where: { email: parsed.data.email, NOT: { id: userId } },
  });
  if (conflict) return { error: "Diese E-Mail ist bereits vergeben." };

  const password = String(formData.get("password") ?? "");
  if (password && password.length < 8) return { error: "Neues Passwort: mindestens 8 Zeichen." };

  const companyIds = readCompanyIds(formData);
  await db.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      companyAccess: {
        deleteMany: {},
        create: companyIds.map((companyId) => ({ companyId })),
      },
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    data: { email: parsed.data.email, role: parsed.data.role, passwordChanged: Boolean(password) },
  });
  revalidatePath("/einstellungen/nutzer");
  redirect("/einstellungen/nutzer");
}

export async function toggleUserActive(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return; // sich selbst nicht deaktivieren
  const user = await db.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId },
  });
  if (!user) return;
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: user.active ? "user.deactivate" : "user.activate",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/einstellungen/nutzer");
}
