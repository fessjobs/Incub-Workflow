import { NextResponse } from "next/server";
import { neuBenutzer } from "@/lib/neu/auth";
import { ladeAlles } from "@/lib/neu/store";
import { envBase } from "@/lib/einsatz/base-url";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  const alles = await ladeAlles(a.user.organizationId);
  return NextResponse.json({ ...alles, basis: envBase(), benutzer: a.user.label });
}
