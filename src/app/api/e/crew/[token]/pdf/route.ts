// Nach der Kundenbestätigung: der unterschriebene Stundennachweis des
// Einsatzes über den Gruppenlink – zum Ansehen, Herunterladen und Teilen.
// Kein Login; der Token ist der Ausweis, genau wie beim Unterschreiben.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { loadCrewByToken } from "@/lib/einsatz/service/time-entries";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip) || !checkRateLimit(`crew-pdf:${ip}`, 20, 60_000).ok) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }
  const { token } = await params;
  const a = await loadCrewByToken(token);
  if (!a) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  const link = await db.documentLink.findFirst({
    where: { assignmentId: a.id, document: { category: "stundennachweis" } },
    orderBy: { document: { createdAt: "desc" } },
    include: { document: true },
  });
  if (!link) return NextResponse.json({ error: "Noch kein Stundennachweis erzeugt." }, { status: 404 });
  const download = new URL(req.url).searchParams.get("dl") === "1";
  return new NextResponse(Buffer.from(link.document.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${link.document.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
