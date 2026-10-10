import { NextResponse } from "next/server";
import { z } from "zod";
import { neuBenutzerFuer } from "@/lib/neu/auth";
import { KINDS } from "@/lib/neu/schemas";
import { entferneBeispieldaten, ladeBeispieldaten } from "@/lib/neu/store";

export const dynamic = "force-dynamic";

const seedSchema = z.object({ ops: z.array(z.object({ kind: z.enum(KINDS), id: z.string().min(1).max(120), data: z.unknown() })).max(5000) });

// Beispieldaten laden (ersetzt frühere Beispieldaten, echte Datensätze bleiben)
export async function POST(req: Request) {
  const a = await neuBenutzerFuer("beispieldaten");
  if (!a.ok) return a.antwort;
  const body = seedSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const n = await ladeBeispieldaten(a.user.organizationId, a.user.label, body.data.ops.map((o) => ({ kind: o.kind, id: o.id, data: o.data ?? null })));
    return NextResponse.json({ ok: true, angelegt: n });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 400 });
  }
}

// Beispieldaten wieder entfernen – echte Datensätze bleiben
export async function DELETE() {
  const a = await neuBenutzerFuer("beispieldaten");
  if (!a.ok) return a.antwort;
  return NextResponse.json({ ok: true, entfernt: await entferneBeispieldaten(a.user.organizationId) });
}
