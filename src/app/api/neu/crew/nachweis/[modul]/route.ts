import { db } from "@/lib/db";
import { crewSitzung } from "@/lib/neu/crew";
import { leseRecord } from "@/lib/neu/store";
import type { Crew } from "@/preview/logic/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Das Nachweis-PDF der eigenen Unterweisung (zuletzt abgeschlossene Fassung des Moduls)
export async function GET(_req: Request, ctx: { params: Promise<{ modul: string }> }) {
  const z = await crewSitzung();
  if (!z) return new Response("Nicht angemeldet", { status: 401 });
  const { modul } = await ctx.params;
  const rec = await leseRecord<Crew>(z.organizationId, "crew", z.crewId);
  const id = rec?.data.unterweisungen[modul]?.nachweisId;
  if (!id) return new Response("Nicht gefunden", { status: 404 });
  const f = await db.v2File.findFirst({ where: { id, organizationId: z.organizationId, kind: "unterweisung-nachweis" } });
  // Nur das eigene PDF (die Zuordnung steht im Datensatz der Datei)
  if (!f || (f.meta as { crewId?: string } | null)?.crewId !== z.crewId) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
