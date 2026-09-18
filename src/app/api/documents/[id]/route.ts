// Download eines Dokuments aus dem Dokumentenspeicher (PDFs, Exporte) –
// hinter Login, mandantenbezogen.
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/einsatz/access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "Keine Berechtigung." }, { status });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!doc) return new NextResponse("Nicht gefunden", { status: 404 });
  const download = new URL(req.url).searchParams.get("dl") === "1";
  return new NextResponse(Buffer.from(doc.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${download || doc.mimeType !== "application/pdf" ? "attachment" : "inline"}; filename="${doc.filename}"`,
      "X-Content-Sha256": doc.sha256,
      "Cache-Control": "private, no-store",
    },
  });
}
