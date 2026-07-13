"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type CardFormState = { error?: string; ok?: boolean };

const cardSchema = z.object({
  label: z.string().trim().min(1, "Bezeichnung fehlt."),
  holderUserId: z.string().optional().nullable(),
});

export async function saveCard(
  cardId: string | null,
  _prev: CardFormState,
  formData: FormData
): Promise<CardFormState> {
  const admin = await requireAdmin();
  const parsed = cardSchema.safeParse({
    label: formData.get("label"),
    holderUserId: (formData.get("holderUserId") as string) || null,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  if (parsed.data.holderUserId) {
    const holder = await db.user.findFirst({
      where: { id: parsed.data.holderUserId, organizationId: admin.organizationId },
    });
    if (!holder) return { error: "Karteninhaber nicht gefunden." };
  }

  const conflict = await db.corporateCard.findFirst({
    where: {
      organizationId: admin.organizationId,
      label: parsed.data.label,
      ...(cardId ? { NOT: { id: cardId } } : {}),
    },
  });
  if (conflict) return { error: "Eine Karte mit dieser Bezeichnung existiert bereits." };

  if (cardId) {
    const existing = await db.corporateCard.findFirst({
      where: { id: cardId, organizationId: admin.organizationId },
    });
    if (!existing) return { error: "Karte nicht gefunden." };
    await db.corporateCard.update({
      where: { id: cardId },
      data: { label: parsed.data.label, holderUserId: parsed.data.holderUserId },
    });
  } else {
    await db.corporateCard.create({
      data: {
        organizationId: admin.organizationId,
        label: parsed.data.label,
        holderUserId: parsed.data.holderUserId,
      },
    });
  }
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: cardId ? "card.update" : "card.create",
    entityType: "corporate_card",
    entityId: cardId ?? undefined,
    data: { label: parsed.data.label },
  });
  revalidatePath("/einstellungen/karten");
  return { ok: true };
}

export async function toggleCard(cardId: string) {
  const admin = await requireAdmin();
  const card = await db.corporateCard.findFirst({
    where: { id: cardId, organizationId: admin.organizationId },
  });
  if (!card) return;
  await db.corporateCard.update({ where: { id: cardId }, data: { active: !card.active } });
  revalidatePath("/einstellungen/karten");
}
