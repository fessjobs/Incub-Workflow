import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { neuBenutzer } from "@/lib/neu/auth";
import { leseRecord } from "@/lib/neu/store";
import { inTagen, neuesToken, tokenHash } from "@/lib/neu/token";

export const dynamic = "force-dynamic";

// Einladungslink zum Fragebogen für eine Person (Merle schickt ihn per WhatsApp, offener Punkt 12)
export async function POST(req: Request) {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  const body = z.object({ crewId: z.string().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const crew = await leseRecord(a.user.organizationId, "crew", body.data.crewId);
  if (!crew) return NextResponse.json({ error: "Person nicht gefunden." }, { status: 404 });
  const token = neuesToken();
  await db.v2Access.create({ data: { tokenHash: tokenHash(token), organizationId: a.user.organizationId, kind: "einladung", refId: body.data.crewId, expiresAt: inTagen(14), maxUses: 10, createdBy: a.user.id } });
  return NextResponse.json({ pfad: `/crew/start/${token}`, gueltigBis: inTagen(14).toISOString() });
}
