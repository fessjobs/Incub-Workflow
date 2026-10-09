import { NextResponse } from "next/server";
import { CREW_COOKIE, crewLoeschen, crewSitzung } from "@/lib/neu/crew";

export const dynamic = "force-dynamic";

// DSGVO: Person löscht ihre Daten im neuen System
export async function DELETE() {
  const z = await crewSitzung();
  if (!z) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  await crewLoeschen(z);
  const r = NextResponse.json({ ok: true });
  r.cookies.set(CREW_COOKIE, "", { path: "/", maxAge: 0 });
  return r;
}
