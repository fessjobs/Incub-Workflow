// Rollen für das Einsatzmodul (nutzt die bestehende Session/Auth):
// - ADMIN und MEMBER = Dispo (Einsätze anlegen, Links, PDFs, Stammdaten)
// - BUCHHALTUNG = lesend + Prüfung/Freigabe + Exporte + Lohnarten
// - EINREICHER = kein Zugriff (nur Beleg-Kiosk)
// organizationId kommt IMMER aus der Session, nie aus dem Request.
import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";

export type ModuleUser = Pick<User, "id" | "organizationId" | "role" | "name" | "email">;

export function canViewModule(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "MEMBER" || user.role === "BUCHHALTUNG";
}

export function canDispo(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "MEMBER";
}

export function canReview(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "BUCHHALTUNG";
}

export function canManageRules(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "BUCHHALTUNG";
}

export async function requireModuleUser() {
  const user = await requireUser();
  if (!canViewModule(user)) redirect("/dashboard");
  return user;
}

export async function requireDispo() {
  const user = await requireUser();
  if (!canDispo(user)) redirect("/einsaetze");
  return user;
}

export async function requireReviewer() {
  const user = await requireUser();
  if (!canReview(user)) redirect("/einsaetze");
  return user;
}

// Für API-Routen: null statt Redirect (Route antwortet mit 401/403)
export async function apiUser(check: (u: Pick<User, "role">) => boolean = canViewModule) {
  const user = await getCurrentUser();
  if (!user) return { user: null, status: 401 as const };
  if (!check(user)) return { user: null, status: 403 as const };
  return { user, status: 200 as const };
}
