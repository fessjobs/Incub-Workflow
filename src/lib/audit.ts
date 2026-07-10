import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Zentraler Audit-Log-Eintrag: wer hat wann was geändert.
export async function logAudit(params: {
  organizationId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  data?: Prisma.InputJsonValue;
}) {
  await db.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      data: params.data,
    },
  });
}
