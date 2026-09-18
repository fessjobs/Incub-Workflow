// Dokumentenspeicher für erzeugte PDFs und Exporte. Dokumente sind
// unveränderlich (kein Update-Pfad); jede Ablage schreibt den SHA-256-Hash
// ins Audit-Log.
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { keyToDateOnly } from "./tz";

export type DocumentCategory = "konkretisierung" | "stundennachweis" | "export";

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  konkretisierung: "Konkretisierung (AÜG)",
  stundennachweis: "Stundennachweis",
  export: "Export",
};

export type StoreDocumentInput = {
  organizationId: string;
  category: DocumentCategory;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  meta?: Prisma.InputJsonValue;
  createdById?: string | null;
  links?: Array<{ assignmentId?: string | null; employeeId?: string | null; customerId?: string | null; datum?: string | null }>;
};

export async function storeDocument(input: StoreDocumentInput): Promise<{ id: string; sha256: string; filename: string }> {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const doc = await db.document.create({
    data: {
      organizationId: input.organizationId,
      category: input.category,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: new Uint8Array(input.bytes),
      size: input.bytes.length,
      sha256,
      meta: input.meta,
      createdById: input.createdById ?? null,
      links: {
        create: (input.links ?? []).map((l) => ({
          assignmentId: l.assignmentId ?? null,
          employeeId: l.employeeId ?? null,
          customerId: l.customerId ?? null,
          datum: l.datum ? keyToDateOnly(l.datum) : null,
        })),
      },
    },
    select: { id: true },
  });
  await logAudit({
    organizationId: input.organizationId,
    userId: input.createdById ?? undefined,
    action: `document.${input.category}.create`,
    entityType: "document",
    entityId: doc.id,
    data: { filename: input.filename, sha256, size: input.bytes.length, links: input.links ?? [] },
  });
  return { id: doc.id, sha256, filename: input.filename };
}

export function safeFilename(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "Dokument";
}
