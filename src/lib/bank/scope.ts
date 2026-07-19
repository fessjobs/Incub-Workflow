import type { Prisma, User } from "@prisma/client";

// Konten-Sichtbarkeit: Mitglieder sehen nur eigene Konten. Admins sehen
// eigene Konten, Firmenkonten ohne Eigentümer und die Konten der Mitarbeiter
// (Nicht-Admin-Accounts) – aber NICHT die Konten/Auszüge anderer Admins.
export function accountVisibility(user: Pick<User, "id" | "role">): Prisma.BankAccountWhereInput {
  if (user.role !== "ADMIN") return { userId: user.id };
  return { OR: [{ userId: user.id }, { userId: null }, { owner: { role: { not: "ADMIN" } } }] };
}
