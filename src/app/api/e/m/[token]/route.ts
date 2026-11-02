// Personenlink des Monatszettels (ohne Login): GET liefert den eigenen Zettel, PUT speichert den Entwurf,
// POST unterschreibt, PATCH nimmt die Unterschrift zurück (solange der Kunde nicht bestätigt hat).
// Schutz: unerratbarer UUID-Token, Rate-Limit je IP, Zählung von Fehlversuchen.
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { ladeZettelPerToken, MonatsError, oeffneWieder, personAnsicht, speichereEntwurf, unterschreibe } from "@/lib/einsatz/service/monatszettel";

export const dynamic = "force-dynamic";

function limited(req: Request, bucket: string, limit: number) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip)) return { ip, res: NextResponse.json({ error: "Zu viele Fehlversuche. Bitte später erneut versuchen." }, { status: 429 }) };
  const rl = checkRateLimit(`${bucket}:${ip}`, limit, 60_000);
  if (!rl.ok) return { ip, res: NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }) };
  return { ip, res: null };
}

async function ansicht(token: string) {
  const sheet = await ladeZettelPerToken(token);
  return sheet ? personAnsicht(sheet) : null;
}

function fehler(err: unknown) {
  if (err instanceof MonatsError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("Monatszettel fehlgeschlagen:", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Speichern fehlgeschlagen. Bitte noch einmal versuchen." }, { status: 500 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "m-get", 60);
  if (res) return res;
  const { token } = await params;
  const view = await ansicht(token);
  if (!view) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

const Entwurf = z.object({ tage: z.unknown() });
const Signiert = z.object({ tage: z.unknown(), unterschrift: z.string().max(700_000) });

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "m-put", 120);
  if (res) return res;
  const { token } = await params;
  const body = Entwurf.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  try {
    await speichereEntwurf(token, body.data.tage);
    return NextResponse.json({ ok: true, view: await ansicht(token) });
  } catch (err) {
    if (err instanceof MonatsError && err.status === 404) registerTokenMiss(ip);
    return fehler(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "m-post", 10);
  if (res) return res;
  const { token } = await params;
  const body = Signiert.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  try {
    const r = await unterschreibe(token, body.data.tage, body.data.unterschrift, { ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ ok: true, einsatznummer: r.einsatznummer, view: await ansicht(token) });
  } catch (err) {
    if (err instanceof MonatsError && err.status === 404) registerTokenMiss(ip);
    return fehler(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "m-patch", 20);
  if (res) return res;
  const { token } = await params;
  try {
    await oeffneWieder(token);
    return NextResponse.json({ ok: true, view: await ansicht(token) });
  } catch (err) {
    if (err instanceof MonatsError && err.status === 404) registerTokenMiss(ip);
    return fehler(err);
  }
}
