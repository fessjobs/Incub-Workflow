import { NextResponse } from "next/server";
import JSZip from "jszip";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receiptScope } from "@/lib/receipts";
import { slugForFile } from "@/lib/format";

// Ausgewählte Beleg-PDFs als ZIP herunterladen (?ids=a,b,c)
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  if (ids.length === 0) return new NextResponse("Keine Belege ausgewählt.", { status: 400 });

  const receipts = await db.receipt.findMany({
    where: { id: { in: ids }, ...receiptScope(user), status: "ABGELEGT" },
    orderBy: [{ receiptDate: "asc" }],
    include: { files: { select: { kind: true, bytes: true, mimeType: true } } },
  });
  if (receipts.length === 0) return new NextResponse("Keine Belege gefunden.", { status: 404 });

  const zip = new JSZip();
  const used = new Set<string>();
  for (const r of receipts) {
    // Fertige PDF (Beiblatt + Original) bevorzugen, sonst Original
    const file =
      r.files.find((f) => f.kind === "PDF") ?? r.files.find((f) => f.kind === "ORIGINAL");
    if (!file) continue;
    const ext = file.kind === "PDF" || file.mimeType === "application/pdf" ? "pdf" : (file.mimeType.split("/")[1] ?? "bin");
    let name = `${r.receiptNumber ?? r.id}_${slugForFile(r.vendor || "Beleg")}.${ext}`;
    while (used.has(name)) name = `_${name}`;
    used.add(name);
    zip.file(name, Buffer.from(file.bytes));
  }

  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Belege_Auswahl_${stamp}.zip"`,
    },
  });
}
