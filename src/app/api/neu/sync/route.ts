import { NextResponse } from "next/server";
import { neuBenutzer } from "@/lib/neu/auth";
import { syncSchema } from "@/lib/neu/schemas";
import { schreibeAudit, schreibeOps } from "@/lib/neu/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  const body = syncSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage.", details: body.error.issues.slice(0, 3) }, { status: 400 });
  const r = await schreibeOps(a.user.organizationId, a.user.label, body.data.ops);
  if (!r.ok) {
    if ("konflikte" in r) return NextResponse.json({ error: "Zwischenzeitlich geändert.", konflikte: r.konflikte }, { status: 409 });
    return NextResponse.json({ error: r.ungueltig }, { status: 400 });
  }
  await schreibeAudit(a.user.organizationId, body.data.audit);
  return NextResponse.json({ ok: true, revs: r.revs });
}
