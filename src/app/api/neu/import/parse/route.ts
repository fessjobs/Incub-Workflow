import { NextResponse } from "next/server";
import { neuBenutzer } from "@/lib/neu/auth";
import { darfAktion } from "@/lib/neu/rollen";
import { leseDatei, MAX_DATEI_BYTES } from "@/lib/neu/import/datei";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Liest eine hochgeladene Tabelle (Excel oder CSV) und gibt die Rohzeilen zurück.
// Es wird nichts gespeichert: die Oberfläche zeigt erst eine Vorschau.
export async function POST(req: Request) {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  if (!darfAktion(a.user.rolle, "import-personal") && !darfAktion(a.user.rolle, "import-auftraege")) return NextResponse.json({ error: "Dafür fehlt die Berechtigung." }, { status: 403 });
  if (!checkRateLimit(`neu-import:${a.user.id}`, 30, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const datei = form?.get("datei");
  if (!(datei instanceof File)) return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  if (datei.size === 0) return NextResponse.json({ error: "Die Datei ist leer." }, { status: 400 });
  if (datei.size > MAX_DATEI_BYTES) return NextResponse.json({ error: "Die Datei ist größer als 8 MB." }, { status: 413 });
  try {
    const blaetter = await leseDatei(new Uint8Array(await datei.arrayBuffer()), datei.name);
    if (blaetter.length === 0) return NextResponse.json({ error: "In der Datei wurde keine Tabelle mit Inhalt gefunden." }, { status: 422 });
    return NextResponse.json({ blaetter }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden." }, { status: 422 });
  }
}
