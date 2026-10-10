import { NextResponse } from "next/server";
import { schnittstelleUmgebungAn } from "@/lib/neu/schnittstelle";

export const dynamic = "force-dynamic";

// VORBEREITET, NICHT IN BETRIEB. Später liefert diese Adresse die Aufträge für das bisherige System.
// Ohne NEU_SCHNITTSTELLE=an antwortet sie mit 404, als gäbe es sie nicht. Auch mit „an“ liefert diese
// Version nur 501: es werden weder Daten gelesen noch ausgegeben.
export async function GET() {
  if (!schnittstelleUmgebungAn()) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ error: "Die Schnittstelle ist vorbereitet, aber noch nicht eingebaut." }, { status: 501 });
}
