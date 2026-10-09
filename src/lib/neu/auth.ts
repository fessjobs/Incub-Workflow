// Zugang zum neuen System. Phase 1: nur Administratoren. organizationId kommt
// aus der Sitzung, nie aus der Anfrage.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export interface NeuBenutzer {
  id: string;
  organizationId: string;
  name: string;
  label: string;
}

export function darfNeu(role: string): boolean {
  return role === "ADMIN";
}

export async function neuBenutzer(): Promise<{ ok: true; user: NeuBenutzer } | { ok: false; antwort: NextResponse }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, antwort: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  if (!darfNeu(u.role)) return { ok: false, antwort: NextResponse.json({ error: "Für dieses Konto nicht freigegeben." }, { status: 403 }) };
  return { ok: true, user: { id: u.id, organizationId: u.organizationId, name: u.name ?? u.email, label: `${u.name ?? u.email} (Admin)` } };
}
