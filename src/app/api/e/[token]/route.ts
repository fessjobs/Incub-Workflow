// Mitarbeiter-Link (ohne Login): GET liefert nur die eigene Schicht,
// POST reicht Zeiten + Unterschrift ein (einmalig, danach gesperrt).
// Schutz: unerratbare UUID-Tokens, Rate-Limit je IP, Zählung von Fehlversuchen.
import { NextResponse } from "next/server";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { TimeEntrySubmitSchema } from "@/lib/einsatz/schemas";
import { tokenView } from "@/lib/einsatz/service/public-view";
import { loadByToken, submitTimeEntry, TimeEntryError, tokenState } from "@/lib/einsatz/service/time-entries";

export const dynamic = "force-dynamic";

function limited(req: Request, bucket: string, limit: number) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip)) return { ip, res: NextResponse.json({ error: "Zu viele Fehlversuche. Bitte später erneut versuchen." }, { status: 429 }) };
  const rl = checkRateLimit(`${bucket}:${ip}`, limit, 60_000);
  if (!rl.ok) {
    return { ip, res: NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }) };
  }
  return { ip, res: null };
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "e-get", 30);
  if (res) return res;
  const { token } = await params;
  const sa = await loadByToken(token);
  if (!sa) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  return NextResponse.json(tokenView(sa), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = limited(req, "e-post", 10);
  if (res) return res;
  const { token } = await params;
  const sa = await loadByToken(token);
  if (!sa) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  const state = tokenState(sa);
  if (state !== "offen") {
    const msg = state === "erfasst" ? "Dieser Eintrag wurde bereits unterschrieben." : state === "abgelaufen" ? "Der Link ist abgelaufen. Bitte bei der Dispo melden." : "Diese Einteilung wurde storniert.";
    return NextResponse.json({ error: msg, state }, { status: 409 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const parsed = TimeEntrySubmitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  try {
    const result = await submitTimeEntry(sa.id, parsed.data, { ip, userAgent: req.headers.get("user-agent") }, "MITARBEITER");
    const fresh = await loadByToken(token);
    return NextResponse.json({ ok: true, timeEntryId: result.timeEntryId, view: fresh ? tokenView(fresh) : null });
  } catch (err) {
    if (err instanceof TimeEntryError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Zeiterfassung fehlgeschlagen:", message);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
