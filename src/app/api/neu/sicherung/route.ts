import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { baueSicherung, BEREICHE, monatsName } from "@/lib/neu/sicherung";
import { schreibeAudit } from "@/lib/neu/store";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";
import { leseAnfrage } from "./anfrage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Monats-Sicherung als ZIP. Nur Administratoren; liest nur, ändert nichts an den Daten.
export async function GET(req: Request) {
  const a = await neuBenutzerFuer("sicherung");
  if (!a.ok) return a.antwort;
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "Nur für Administratoren." }, { status: 403 });
  const q = leseAnfrage(req.url);
  if (!q.ok) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  // Erst prüfen, dann zählen: nur wirkliche Sicherungen verbrauchen das Kontingent
  if (!checkRateLimit(`neu-sicherung:${u.id}`, 20, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Sicherungen in kurzer Zeit. Bitte kurz warten." }, { status: 429 });

  const r = await baueSicherung({ id: u.id, role: u.role, organizationId: u.organizationId, name: u.name ?? u.email }, q.anfrage);
  if ("fehler" in r) return NextResponse.json({ error: r.fehler }, { status: 413 });

  const bereiche = BEREICHE.filter((b) => q.anfrage.bereiche.includes(b.id)).map((b) => b.label).join(", ");
  await schreibeAudit(a.user.organizationId, [
    {
      id: `au-sicherung-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      zeitpunkt: new Date().toISOString(),
      user: a.user.label,
      tabelle: "sicherung",
      datensatz: q.anfrage.monat,
      feld: "download",
      alt: "",
      neu: `${monatsName(q.anfrage.monat)}: ${bereiche} · ${(r.bytes.length / 1024 / 1024).toFixed(1)} MB`.slice(0, 1900),
      grund: null,
    },
  ]);
  return new NextResponse(new Uint8Array(r.bytes), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
