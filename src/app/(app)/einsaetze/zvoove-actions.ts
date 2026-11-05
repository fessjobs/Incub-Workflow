"use server";

// Haken „Stunden in zvoove“ in der Einsatzliste. organizationId nur aus der Session.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireModuleUser } from "@/lib/einsatz/access";

const Eingabe = z.object({ assignmentId: z.string().min(1).max(60), erledigt: z.boolean() });

export async function setzeZvooveAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireModuleUser();
  const p = Eingabe.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Daten." };
  const { assignmentId, erledigt } = p.data;
  const r = await db.assignment.updateMany({
    where: { id: assignmentId, organizationId: user.organizationId },
    data: erledigt ? { zvooveErledigt: true, zvooveVon: user.name ?? user.email ?? user.id, zvooveAm: new Date() } : { zvooveErledigt: false, zvooveVon: null, zvooveAm: null },
  });
  if (r.count === 0) return { ok: false, error: "Einsatz nicht gefunden." };
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: "assignment.zvoove", entityType: "assignment", entityId: assignmentId, data: { erledigt } });
  revalidatePath("/einsaetze");
  return { ok: true };
}
