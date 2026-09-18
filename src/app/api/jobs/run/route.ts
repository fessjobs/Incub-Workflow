// POST /api/jobs/run – verarbeitet fällige Jobs. Für externe Cron-Aufrufe
// (Railway Cron, GitHub Action) mit Header "Authorization: Bearer $JOBS_SECRET";
// alternativ als angemeldeter Admin (Button in der Dispo).
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canDispo } from "@/lib/einsatz/access";
import { processJobsOnce } from "@/lib/einsatz/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.JOBS_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (secret && header === `Bearer ${secret}`) return true;
  // Auch die Disposition stößt Jobs an (Knopf in der Einsatzliste)
  const user = await getCurrentUser();
  return Boolean(user && canDispo(user));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  const result = await processJobsOnce(50);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return POST(req);
}
