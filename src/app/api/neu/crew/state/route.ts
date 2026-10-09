import { NextResponse } from "next/server";
import { crewSitzung, crewState } from "@/lib/neu/crew";

export const dynamic = "force-dynamic";

export async function GET() {
  const z = await crewSitzung();
  if (!z) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const s = await crewState(z);
  if (!s) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(s, { headers: { "Cache-Control": "no-store" } });
}
