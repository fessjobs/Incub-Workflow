import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildDatevZip } from "@/lib/export/datev";

// DATEV-Monatsexport (Admin + Buchhaltung): Buchungsstapel-CSV je Firma +
// Beleg-PDFs sortiert nach Firma/Zahlungsart + Excel-Übersicht.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "BUCHHALTUNG") {
    return new NextResponse("Nur für Admin und Buchhaltung.", { status: 403 });
  }
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month")); // 1-basiert aus UI
  const companyId = url.searchParams.get("company") || undefined;

  if (!year || !month) return new NextResponse("Bitte Jahr und Monat angeben.", { status: 400 });

  const result = await buildDatevZip({
    organizationId: user.organizationId,
    year,
    month: month - 1,
    companyId,
  });
  if (!result) return new NextResponse("Keine Belege in diesem Monat.", { status: 404 });

  return new NextResponse(result.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
