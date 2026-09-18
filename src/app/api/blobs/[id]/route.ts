// Unterschriften (PNG) für die Dispo-Ansicht – nur hinter Login und nur
// innerhalb des eigenen Mandanten.
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/einsatz/access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "Keine Berechtigung." }, { status });
  const { id } = await params;
  const blob = await db.blob.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!blob) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(Buffer.from(blob.bytes) as unknown as BodyInit, {
    headers: { "Content-Type": blob.mimeType, "Cache-Control": "private, max-age=3600" },
  });
}
