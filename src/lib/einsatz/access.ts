// Rollen für das Einsatzmodul (nutzt die bestehende Session/Auth):
// - DISPONENT = ausschließlich dieses Modul: Einsätze, Konkretisierungen,
//   Stundennachweise, Links, Auswertung, Dokumente, Kunden- und Personalstamm.
//   Kein Zugriff auf Belege, Abgleich, Einstellungen.
// - ADMIN und MEMBER = Dispo (wie oben, zusätzlich der Rest der App)
// - BUCHHALTUNG = lesend + Prüfung/Freigabe + Exporte + Lohnarten
// - EINREICHER = kein Zugriff (nur Beleg-Kiosk)
// organizationId kommt IMMER aus der Session, nie aus dem Request.
import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";

export type ModuleUser = Pick<User, "id" | "organizationId" | "role" | "name" | "email">;

export function canViewModule(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "MEMBER" || user.role === "BUCHHALTUNG" || user.role === "DISPONENT";
}

export function canDispo(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "MEMBER" || user.role === "DISPONENT";
}

// Prüfen und freigeben darf auch die Disposition – sie verantwortet die Zeiten.
export function canReview(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "BUCHHALTUNG" || user.role === "DISPONENT";
}

// Interne Beurteilung nach einem Einsatz: Admin, Disposition und Buchhaltung.
// Bewusst dieselbe Runde wie die Freigabe, aber als eigene Funktion – wer
// bewerten darf, kann sich unabhängig von der Freigabe ändern.
export function canRate(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN" || user.role === "BUCHHALTUNG" || user.role === "DISPONENT";
}

export async function requireRater() {
  const user = await requireUser();
  if (!canRate(user)) redirect("/einsaetze");
  return user;
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

// Pfad-/Startseitenlogik liegt in roles.ts (ohne Abhängigkeiten, damit die
// Middleware sie nutzen kann) und wird hier nur weitergereicht.
export { homePathFor, disponentDarf, DISPONENT_PATHS } from "./roles";
