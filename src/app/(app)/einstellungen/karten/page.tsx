import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CardManager } from "./card-manager";

export const metadata: Metadata = { title: "Firmenkarten" };

export default async function CardsPage() {
  const admin = await requireAdmin();
  const [cards, holders] = await Promise.all([
    db.corporateCard.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: [{ active: "desc" }, { label: "asc" }],
      include: { holder: { select: { name: true } }, _count: { select: { receipts: true } } },
    }),
    db.user.findMany({
      where: { organizationId: admin.organizationId, active: true, role: { in: ["ADMIN", "MEMBER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Firmenkarten (Amex)</h2>
        <p className="mt-1 text-sm text-navy-400">
          Eine Karte pro Gesellschafter, z.&nbsp;B. „Amex Maik“. Beim Erfassen mit Zahlungsart
          „Firmenkarte“ wird die konkrete Karte gewählt – die Buchhaltung bekommt die Belege
          pro Karte sortiert.
        </p>
      </div>
      <CardManager
        cards={cards.map((c) => ({
          id: c.id,
          label: c.label,
          holderUserId: c.holderUserId,
          holderName: c.holder?.name ?? null,
          active: c.active,
          receiptCount: c._count.receipts,
        }))}
        holders={holders}
      />
    </div>
  );
}
