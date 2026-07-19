import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { receiptVisibility } from "@/lib/receipts";
import { buildMonthlyZip } from "@/lib/export/zip";

// Steuerberater-Monats-ZIP (Admin): alle PDFs des Monats + Excel-Übersicht.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const companyId = url.searchParams.get("company") ?? "";
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month")); // 1-basiert aus UI

  if (!companyId || !year || !month) {
    return new NextResponse("Bitte Firma, Jahr und Monat angeben.", { status: 400 });
  }

  const result = await buildMonthlyZip({
    organizationId: admin.organizationId,
    companyId,
    year,
    month: month - 1,
    // Admin exportiert nur, was er sehen darf (keine Belege anderer Admins)
    restrict: receiptVisibility(admin),
  });
  if (!result) return new NextResponse("Firma nicht gefunden.", { status: 404 });

  return new NextResponse(result.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
