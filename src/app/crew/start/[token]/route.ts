import { CREW_COOKIE, loeseEinladungEin } from "@/lib/neu/crew";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";

export const dynamic = "force-dynamic";

const seite = (text: string, ziel: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${ziel}"><title>fess.jobs</title></head><body style="font-family:system-ui;padding:2rem"><p>${text}</p><p><a href="${ziel}">Weiter</a></p></body></html>`;

// Einladungslink einlösen: legt die Crew-Sitzung an und leitet zur Startseite der Crew
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt";
  if (!checkRateLimit(`neu-start:${ip}`, 30, 10 * 60_000).ok) return new Response("Zu viele Versuche. Bitte später erneut.", { status: 429 });
  const { token } = await ctx.params;
  const r = await loeseEinladungEin(token.slice(0, 80));
  if (!r) return new Response(seite("Dieser Link ist abgelaufen oder ungültig. Bitte bei FESS einen neuen Link anfordern.", "/crew"), { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return new Response(seite("Du bist angemeldet …", "/crew"), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${CREW_COOKIE}=${r.sitzung}; Path=/; HttpOnly; SameSite=Lax; Expires=${r.ablauf.toUTCString()}${secure}`,
    },
  });
}
