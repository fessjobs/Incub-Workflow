import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { neuBenutzer } from "@/lib/neu/auth";
import { leseRecord } from "@/lib/neu/store";
import { inTagen, neuesToken, tokenHash } from "@/lib/neu/token";

export const dynamic = "force-dynamic";

// Beleg-Link je Auftrag: ohne Anmeldung nutzbar, mit Ablauf
export async function POST(req: Request) {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  const body = z.object({ jobId: z.string().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const job = await leseRecord(a.user.organizationId, "job", body.data.jobId);
  if (!job) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  const token = neuesToken();
  const bis = inTagen(90);
  await db.v2Access.create({ data: { tokenHash: tokenHash(token), organizationId: a.user.organizationId, kind: "beleg", refId: body.data.jobId, expiresAt: bis, createdBy: a.user.id } });
  return NextResponse.json({ pfad: `/b/${token}`, gueltigBis: bis.toISOString() });
}
