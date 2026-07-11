import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receiptScope } from "@/lib/receipts";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const receipt = await db.receipt.findFirst({ where: { id, ...receiptScope(user) } });
  if (!receipt) return new NextResponse("Nicht gefunden", { status: 404 });

  const file = await db.receiptFile.findFirst({ where: { receiptId: id, kind: "ORIGINAL" } });
  if (!file) return new NextResponse("Kein Original", { status: 404 });

  return new NextResponse(Buffer.from(file.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.filename}"`,
    },
  });
}
