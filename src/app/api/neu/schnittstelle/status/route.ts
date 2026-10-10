import { NextResponse } from "next/server";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { leseRecord } from "@/lib/neu/store";
import { schnittstelleStatus } from "@/lib/neu/schnittstelle";

export const dynamic = "force-dynamic";

// Zeigt nur den Zustand der Schalter an. Ruft nichts auf und tauscht keine Daten.
export async function GET() {
  const a = await neuBenutzerFuer("schnittstelle");
  if (!a.ok) return a.antwort;
  const e = await leseRecord<{ schnittstelle?: { aktiv?: boolean } }>(a.user.organizationId, "einst", "main");
  return NextResponse.json(schnittstelleStatus(e?.data.schnittstelle?.aktiv === true), { headers: { "Cache-Control": "no-store" } });
}
