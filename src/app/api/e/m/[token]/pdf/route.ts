// Das fertige Monatsstundenzettel-PDF (nach der Bestätigung des Kunden) über den Personenlink – nur der eigene Zettel.
import { NextResponse } from "next/server";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { abgelegtesPdf, ladeZettelPerToken } from "@/lib/einsatz/service/monatszettel";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip) || !checkRateLimit(`m-pdf:${ip}`, 20, 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const { token } = await params;
  const sheet = await ladeZettelPerToken(token);
  if (!sheet) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  const pdf = sheet.kundeStatus === "BESTAETIGT" ? await abgelegtesPdf(sheet.organizationId, sheet.id) : null;
  if (!pdf) return NextResponse.json({ error: "Noch kein fertiger Zettel – der Kunde hat noch nicht bestätigt." }, { status: 404 });
  return new NextResponse(pdf.bytes as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "no-store" } });
}
