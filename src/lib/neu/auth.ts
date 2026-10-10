// Zugang zum neuen System. Administratoren des bisherigen Systems haben die
// Rolle „admin“. Weitere Konten (Mitglied, Buchhaltung) bekommen eine Rolle nur,
// wenn ein Administrator sie im neuen Dashboard unter „Benutzer“ freigegeben hat.
// organizationId kommt aus der Sitzung, nie aus der Anfrage.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { darfAktion, istRolle, type Aktion, type NeuRolle } from "./rollen";

export interface NeuBenutzer {
  id: string;
  organizationId: string;
  name: string;
  label: string;
  rolle: NeuRolle;
}

// Konten mit diesen Rollen des bisherigen Systems lässt die Weiche der alten
// Oberfläche gar nicht bis hierher (Kiosk, Disposition) – sie bleiben ausgeschlossen.
const ROLLEN_BISHER_MOEGLICH = ["ADMIN", "MEMBER", "BUCHHALTUNG"];

export function darfNeu(role: string): boolean {
  return role === "ADMIN";
}

export async function neuRolleFuer(userId: string, organizationId: string, bisherigeRolle: string): Promise<NeuRolle | null> {
  if (bisherigeRolle === "ADMIN") return "admin";
  if (!ROLLEN_BISHER_MOEGLICH.includes(bisherigeRolle)) return null;
  const z = await db.v2Record.findUnique({ where: { organizationId_kind_id: { organizationId, kind: "benutzer", id: userId } } });
  const rolle = z && typeof z.data === "object" && z.data !== null ? (z.data as { rolle?: unknown }).rolle : null;
  return istRolle(rolle) && rolle !== "admin" ? rolle : null;
}

const ROLLE_LABEL: Record<NeuRolle, string> = { admin: "Admin", dispo: "Dispo", buchhaltung: "Buchhaltung", lesen: "Lesen" };

export async function neuBenutzer(): Promise<{ ok: true; user: NeuBenutzer } | { ok: false; antwort: NextResponse }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, antwort: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  const rolle = await neuRolleFuer(u.id, u.organizationId, u.role);
  if (!rolle) return { ok: false, antwort: NextResponse.json({ error: "Für dieses Konto nicht freigegeben." }, { status: 403 }) };
  const name = u.name ?? u.email;
  return { ok: true, user: { id: u.id, organizationId: u.organizationId, name, label: `${name} (${ROLLE_LABEL[rolle]})`, rolle } };
}

// Wie neuBenutzer, verlangt aber zusätzlich das Recht für eine Aktion
export async function neuBenutzerFuer(aktion: Aktion): Promise<{ ok: true; user: NeuBenutzer } | { ok: false; antwort: NextResponse }> {
  const a = await neuBenutzer();
  if (!a.ok) return a;
  if (!darfAktion(a.user.rolle, aktion)) return { ok: false, antwort: NextResponse.json({ error: "Dafür fehlt die Berechtigung." }, { status: 403 }) };
  return a;
}
