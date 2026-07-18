import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugForFile } from "@/lib/format";

// Fertige Setcard-PDF ansehen/herunterladen (nur Admin)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const setcard = await db.setcard.findFirst({
    where: { id, organizationId: admin.organizationId },
    include: { person: { select: { firstName: true, lastName: true } }, company: { select: { brandName: true } } },
  });
  if (!setcard || !setcard.pdfBytes) return new NextResponse("Nicht gefunden.", { status: 404 });

  const url = new URL(req.url);
  const download = url.searchParams.get("dl") === "1";
  const filename = `Setcard_${slugForFile(`${setcard.person.firstName}-${setcard.person.lastName}`)}_${slugForFile(setcard.company.brandName)}_${setcard.profileNo}.pdf`;

  return new NextResponse(Buffer.from(setcard.pdfBytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
