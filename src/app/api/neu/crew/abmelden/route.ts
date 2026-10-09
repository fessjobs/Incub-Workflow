import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { CREW_COOKIE } from "@/lib/neu/crew";
import { tokenHash } from "@/lib/neu/token";

export const dynamic = "force-dynamic";

// Diese Sitzung beenden (die Einladung bleibt gültig, bis sie abläuft)
export async function POST() {
  const roh = (await cookies()).get(CREW_COOKIE)?.value;
  if (roh) await db.v2Access.deleteMany({ where: { tokenHash: tokenHash(roh), kind: "crew-session" } });
  const r = NextResponse.json({ ok: true });
  r.cookies.set(CREW_COOKIE, "", { path: "/", maxAge: 0 });
  return r;
}
