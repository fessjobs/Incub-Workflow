import { NextResponse } from "next/server";
import { z } from "zod";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { listeBenutzer, setzeBenutzerRolle } from "@/lib/neu/benutzer";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await neuBenutzerFuer("benutzer");
  if (!a.ok) return a.antwort;
  return NextResponse.json({ benutzer: await listeBenutzer(a.user.organizationId) }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.object({ userId: z.string().min(1).max(80), rolle: z.enum(["dispo", "buchhaltung", "lesen", "keine"]) });

export async function POST(req: Request) {
  const a = await neuBenutzerFuer("benutzer");
  if (!a.ok) return a.antwort;
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (b.data.userId === a.user.id) return NextResponse.json({ error: "Die eigene Rolle lässt sich hier nicht ändern." }, { status: 400 });
  const r = await setzeBenutzerRolle(a.user.organizationId, { id: a.user.id, label: a.user.label }, b.data.userId, b.data.rolle === "keine" ? null : b.data.rolle);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, benutzer: await listeBenutzer(a.user.organizationId) });
}
