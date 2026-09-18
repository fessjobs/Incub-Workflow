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
  // Ersetzt vorhandene Dokumente derselben Kategorie zu diesem Einsatz, statt
  // eine weitere Fassung anzulegen. Pro Einsatz bleibt so genau ein aktueller
  // Stundennachweis und eine aktuelle Konkretisierung übrig; die Historie
  // steht über Hash und Zeitpunkt im Audit-Log.
  replaceForAssignmentId?: string | null;
};

export async function storeDocument(input: StoreDocumentInput): Promise<{ id: string; sha256: string; filename: string; ersetzt: number }> {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  // Vorgänger derselben Kategorie zu diesem Einsatz einsammeln (vor dem
  // Anlegen, damit das neue Dokument nicht mitgelöscht wird).
  const vorgaenger = input.replaceForAssignmentId
    ? await db.document.findMany({
        where: {
          organizationId: input.organizationId,
          category: input.category,
          links: { some: { assignmentId: input.replaceForAssignmentId } },
        },
        select: { id: true, sha256: true, filename: true, createdAt: true },
      })
    : [];
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
  if (vorgaenger.length > 0) {
    await db.document.deleteMany({ where: { id: { in: vorgaenger.map((v) => v.id) } } });
  }

  await logAudit({
    organizationId: input.organizationId,
    userId: input.createdById ?? undefined,
    action: `document.${input.category}.create`,
    entityType: "document",
    entityId: doc.id,
    data: {
      filename: input.filename,
      sha256,
      size: input.bytes.length,
      links: input.links ?? [],
      // Nachvollziehbarkeit der ersetzten Fassungen
      ersetzt: vorgaenger.map((v) => ({ id: v.id, sha256: v.sha256, filename: v.filename, erstelltAm: v.createdAt })),
    },
  });
  return { id: doc.id, sha256, filename: input.filename, ersetzt: vorgaenger.length };
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
