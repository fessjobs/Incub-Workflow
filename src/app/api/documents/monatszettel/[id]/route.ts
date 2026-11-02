// Monatsstundenzettel für das Dashboard (hinter Login): bestätigte Zettel liefern das abgelegte PDF, alle anderen eine
// Vorschau, die nicht abgelegt wird.
import { NextResponse } from "next/server";
import { apiUser, canDispo } from "@/lib/einsatz/access";
import { abgelegtesPdf, erzeugeMonatsPdf, ladeZettel, MonatsError } from "@/lib/einsatz/service/monatszettel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, status } = await apiUser((u) => canDispo(u) || u.role === "BUCHHALTUNG");
  if (!user) return NextResponse.json({ error: "Keine Berechtigung." }, { status });
  const { id } = await params;
  const sheet = await ladeZettel(user.organizationId, id);
  if (!sheet) return new NextResponse("Nicht gefunden", { status: 404 });
  try {
    const abgelegt = sheet.kundeStatus === "BESTAETIGT" ? await abgelegtesPdf(user.organizationId, sheet.id) : null;
    const pdf = abgelegt ?? (await erzeugeMonatsPdf(user.organizationId, sheet.id, { userId: user.id, vorschau: true }));
    return new NextResponse(pdf.bytes as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof MonatsError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
