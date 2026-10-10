// Benutzer des neuen Dashboards: Die Konten selbst gehören zum bisherigen System (gleiche
// Anmeldung). Hier wird nur LESEND nach den Konten der Organisation gefragt und die Rolle
// im neuen Dashboard in v2_records gespeichert. Am Konto selbst ändert sich nichts.
import { db } from "@/lib/db";
import { loescheRecord, schreibeAudit, setzeRecord } from "./store";
import type { NeuRolle } from "./rollen";

export interface BenutzerZeile {
  userId: string;
  name: string;
  email: string;
  bisherigeRolle: string;
  // Rolle im neuen Dashboard (null = kein Zugang)
  rolle: NeuRolle | null;
  // Kann dieses Konto überhaupt ins neue Dashboard? (Kiosk- und Disposition-Konten leitet das bisherige System um)
  moeglich: boolean;
  grund: string | null;
}

export async function listeBenutzer(organizationId: string): Promise<BenutzerZeile[]> {
  const [konten, zugaenge] = await Promise.all([
    db.user.findMany({ where: { organizationId, active: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } }),
    db.v2Record.findMany({ where: { organizationId, kind: "benutzer" }, select: { id: true, data: true } }),
  ]);
  const rollen = new Map(zugaenge.map((z) => [z.id, (z.data as { rolle?: NeuRolle } | null)?.rolle ?? null]));
  return konten.map((k) => {
    if (k.role === "ADMIN") return { userId: k.id, name: k.name, email: k.email, bisherigeRolle: k.role, rolle: "admin" as const, moeglich: true, grund: "Administratoren haben immer vollen Zugang." };
    const moeglich = k.role === "MEMBER" || k.role === "BUCHHALTUNG";
    return {
      userId: k.id, name: k.name, email: k.email, bisherigeRolle: k.role, rolle: rollen.get(k.id) ?? null, moeglich,
      grund: moeglich ? null : k.role === "DISPONENT" ? "Konten mit der bisherigen Rolle „Disposition“ leitet das bisherige System ins Einsatzmodul um – dafür bräuchte es eine Freigabe der Weiche." : "Kiosk-Konten haben keinen Zugang.",
    };
  });
}

export type SetzeErgebnis = { ok: true } | { ok: false; status: number; error: string };

export async function setzeBenutzerRolle(organizationId: string, von: { id: string; label: string }, userId: string, rolle: Exclude<NeuRolle, "admin"> | null): Promise<SetzeErgebnis> {
  const konto = await db.user.findFirst({ where: { id: userId, organizationId, active: true }, select: { id: true, name: true, email: true, role: true } });
  if (!konto) return { ok: false, status: 404, error: "Konto nicht gefunden." };
  if (konto.role === "ADMIN") return { ok: false, status: 400, error: "Administratoren haben immer vollen Zugang." };
  if (konto.role !== "MEMBER" && konto.role !== "BUCHHALTUNG") return { ok: false, status: 400, error: "Dieses Konto kann das neue Dashboard nicht nutzen." };
  const alt = (await db.v2Record.findUnique({ where: { organizationId_kind_id: { organizationId, kind: "benutzer", id: userId } } }))?.data as { rolle?: string } | null | undefined;
  if (rolle === null) await loescheRecord(organizationId, "benutzer", userId);
  else await setzeRecord(organizationId, "benutzer", userId, { userId, name: konto.name, email: konto.email, rolle }, von.label);
  await schreibeAudit(organizationId, [
    { id: `au-benutzer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, zeitpunkt: new Date().toISOString(), user: von.label, tabelle: "benutzer", datensatz: userId, feld: "rolle", alt: alt?.rolle ?? "kein Zugang", neu: rolle ?? "kein Zugang", grund: konto.email },
  ]);
  return { ok: true };
}
