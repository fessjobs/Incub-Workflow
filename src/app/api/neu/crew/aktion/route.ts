import { NextResponse } from "next/server";
import { z } from "zod";
import { crewAktion, crewSitzung, crewState } from "@/lib/neu/crew";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";

export const dynamic = "force-dynamic";

const aktion = z.discriminatedUnion("typ", [
  z.object({ typ: z.literal("entwurf"), antworten: z.record(z.unknown()), etappe: z.number().int() }),
  z.object({ typ: z.literal("abschicken") }),
  z.object({ typ: z.literal("unterweisung"), modul: z.string().max(40), richtig: z.number().int().min(0).max(50), gesamt: z.number().int().min(1).max(50) }),
  z.object({
    typ: z.literal("bewerbung"),
    jobId: z.string().min(1).max(80),
    schichtIds: z.array(z.string().max(80)).min(1).max(50),
    eigeneAnreise: z.boolean(),
    hatVertrag: z.boolean(),
    abfahrtsort: z.string().max(200),
    plaetze: z.number().min(0).max(20),
    kommentar: z.string().max(1000),
  }),
]);

export async function POST(req: Request) {
  const zugang = await crewSitzung();
  if (!zugang) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!checkRateLimit(`neu-crew:${zugang.crewId}`, 240, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const body = aktion.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const r = await crewAktion(zugang, body.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, state: await crewState(zugang) }, { headers: { "Cache-Control": "no-store" } });
}
