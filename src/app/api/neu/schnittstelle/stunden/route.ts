import { NextResponse } from "next/server";
import { schnittstelleUmgebungAn } from "@/lib/neu/schnittstelle";

export const dynamic = "force-dynamic";

// VORBEREITET, NICHT IN BETRIEB. Später nimmt diese Adresse Stunden aus den Einsatzzettel-PDFs entgegen.
// Verhalten wie die Adresse für die Aufträge: aus = 404, „an“ = 501, nie werden Daten verarbeitet.
export async function POST() {
  if (!schnittstelleUmgebungAn()) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ error: "Die Schnittstelle ist vorbereitet, aber noch nicht eingebaut." }, { status: 501 });
}
