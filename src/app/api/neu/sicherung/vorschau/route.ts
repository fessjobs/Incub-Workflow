import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { MAX_SICHERUNG_BYTES, planeSicherung } from "@/lib/neu/sicherung";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";
import { leseAnfrage } from "../anfrage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Was käme in die Sicherung? Anzahl und Größe je Bereich – es wird nichts erzeugt und nichts geladen.
export async function GET(req: Request) {
  const a = await neuBenutzerFuer("sicherung");
  if (!a.ok) return a.antwort;
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "Nur für Administratoren." }, { status: 403 });
  const q = leseAnfrage(req.url);
  if (!q.ok) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (!checkRateLimit(`neu-sicherung-vorschau:${u.id}`, 120, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const plan = await planeSicherung({ id: u.id, role: u.role, organizationId: u.organizationId, name: u.name ?? u.email }, q.anfrage);
  return NextResponse.json({ zaehler: plan.zaehler, bytes: plan.bytes, grenze: MAX_SICHERUNG_BYTES, zuGross: plan.zuGross }, { headers: { "Cache-Control": "no-store" } });
}
