import { db } from "@/lib/db";
import { neuBenutzer } from "@/lib/neu/auth";

export const dynamic = "force-dynamic";

// Beleg-Datei ansehen (nur angemeldete Admins, nur der eigene Mandant)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  const { id } = await ctx.params;
  const f = await db.v2File.findFirst({ where: { id, organizationId: a.user.organizationId } });
  if (!f) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
