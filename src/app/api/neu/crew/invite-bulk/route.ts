import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { inTagen, neuesToken, tokenHash } from "@/lib/neu/token";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";

export const dynamic = "force-dynamic";

const body = z.object({ crewIds: z.array(z.string().min(1).max(80)).min(1).max(300), tage: z.number().int().min(1).max(60).default(14) });

// Persönliche Links für mehrere Personen auf einmal (für die vorbereiteten Nachrichten).
// Die Links werden nur hier zurückgegeben und nirgends im Klartext gespeichert.
export async function POST(req: Request) {
  const a = await neuBenutzerFuer("nachrichten");
  if (!a.ok) return a.antwort;
  if (!checkRateLimit(`neu-invite-bulk:${a.user.id}`, 20, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const ids = [...new Set(b.data.crewIds)];
  const vorhanden = await db.v2Record.findMany({ where: { organizationId: a.user.organizationId, kind: "crew", id: { in: ids } }, select: { id: true } });
  const ok = new Set(vorhanden.map((v) => v.id));
  const bis = inTagen(b.data.tage);
  const links: Record<string, string> = {};
  const zeilen = [];
  for (const id of ids) {
    if (!ok.has(id)) continue;
    const token = neuesToken();
    links[id] = `/crew/start/${token}`;
    zeilen.push({ tokenHash: tokenHash(token), organizationId: a.user.organizationId, kind: "einladung", refId: id, expiresAt: bis, maxUses: 10, createdBy: a.user.id });
  }
  if (zeilen.length > 0) await db.v2Access.createMany({ data: zeilen });
  return NextResponse.json({ links, gueltigBis: bis.toISOString(), unbekannt: ids.filter((i) => !ok.has(i)) }, { headers: { "Cache-Control": "no-store" } });
}
