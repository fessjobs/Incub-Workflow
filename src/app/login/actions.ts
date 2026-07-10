"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// email wird bei Fehlern zurückgegeben, damit das Feld nach dem
// React-19-Formular-Reset nicht leer ist.
export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Bitte E-Mail und Passwort eingeben.", email };
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });
  const valid =
    user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid) {
    return { error: "E-Mail oder Passwort ist falsch.", email };
  }

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
