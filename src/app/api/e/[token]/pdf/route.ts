// Leseansicht nach der Signatur: Download des aktuellen Stundennachweis-PDFs
// des Einsatzes über den Mitarbeiter-Token (nur eigener Einsatz).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { loadByToken } from "@/lib/einsatz/service/time-entries";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip) || !checkRateLimit(`e-pdf:${ip}`, 20, 60_000).ok) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }
  const { token } = await params;
  const sa = await loadByToken(token);
  if (!sa) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  const link = await db.documentLink.findFirst({
    where: { assignmentId: sa.shift.assignmentId, document: { category: "stundennachweis" } },
    orderBy: { document: { createdAt: "desc" } },
    include: { document: true },
  });
  if (!link) return NextResponse.json({ error: "Noch kein Stundennachweis erzeugt." }, { status: 404 });
  return new NextResponse(Buffer.from(link.document.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${link.document.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
