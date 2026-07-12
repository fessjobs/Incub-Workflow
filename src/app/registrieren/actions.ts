"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail."),
  password: z.string().min(8, "Passwort: mindestens 8 Zeichen."),
});

export type RegisterState = { error?: string; values?: { name?: string; email?: string } };

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const parsed = schema.safeParse({ name, email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message, values: { name, email } };
  }

  // Einziger Mandant (Version 1). Registrierung muss freigeschaltet sein.
  const org = await db.organization.findFirst();
  if (!org) return { error: "Keine Organisation vorhanden." };
  if (!org.allowSelfRegistration) {
    return { error: "Selbst-Registrierung ist aktuell deaktiviert. Bitte den Admin um einen Zugang." };
  }

  const exists = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { error: "Diese E-Mail ist bereits registriert.", values: { name, email } };

  const user = await db.user.create({
    data: {
      organizationId: org.id,
      name: parsed.data.name,
      email: parsed.data.email,
      role: "MEMBER",
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    },
  });
  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "user.register",
    entityType: "user",
    entityId: user.id,
    data: { email: user.email },
  });

  await createSession({ userId: user.id, organizationId: org.id, role: "MEMBER" });
  redirect("/dashboard");
}
