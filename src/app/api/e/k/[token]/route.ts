// Kundenlink des Monatszettels (ohne Login): GET zeigt alle Zettel des Monats, POST bestätigt (eine Unterschrift für alle
// abgeschlossenen Zettel) oder gibt einen Zettel mit Hinweis an die Person zurück.
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { bestaetigeKunde, gibZurueck, kundenAnsicht, ladeStapelPerToken, MonatsError } from "@/lib/einsatz/service/monatszettel";

export const dynamic = "force-dynamic";

function limited(req: Request, bucket: string, limit: number) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip)) return { ip, res: NextResponse.json({ error: "Zu viele Fehlversuche. Bitte später erneut versuchen." }, { status: 429 }) };
  const rl = checkRateLimit(`${bucket}:${ip}`, limit, 60_000);
  if (!rl.ok) return { ip, res: NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }) };
  return { ip, res: null };
}

async function ansicht(token: string) {
  const batch = await ladeStapelPerToken(token);
  return batch ? kundenAnsicht(batch) : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "k-get", 60);
  if (res) return res;
  const { token } = await params;
  const view = await ansicht(token);
  if (!view) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

const Aktion = z.discriminatedUnion("aktion", [
  z.object({ aktion: z.literal("bestaetigen"), kundeName: z.string().max(120), unterschrift: z.string().max(700_000) }),
  z.object({ aktion: z.literal("zurueck"), sheetId: z.string().max(60), hinweis: z.string().max(600) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "k-post", 10);
  if (res) return res;
  const { token } = await params;
  const body = Aktion.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  try {
    let bestaetigt = 0;
    if (body.data.aktion === "bestaetigen") bestaetigt = (await bestaetigeKunde(token, { kundeName: body.data.kundeName, unterschrift: body.data.unterschrift }, { ip, userAgent: req.headers.get("user-agent") })).bestaetigt;
    else await gibZurueck(token, body.data.sheetId, body.data.hinweis);
    return NextResponse.json({ ok: true, bestaetigt, view: await ansicht(token) });
  } catch (err) {
    if (err instanceof MonatsError) {
      if (err.status === 404) registerTokenMiss(ip);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Kundenbestätigung fehlgeschlagen:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Speichern fehlgeschlagen. Bitte noch einmal versuchen." }, { status: 500 });
  }
}
