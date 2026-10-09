import { NextResponse } from "next/server";
import { neuBenutzer } from "@/lib/neu/auth";
import { version } from "@/lib/neu/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await neuBenutzer();
  if (!a.ok) return a.antwort;
  return NextResponse.json({ version: await version(a.user.organizationId) });
}
