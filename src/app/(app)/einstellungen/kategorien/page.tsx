import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CategoryList } from "./category-list";

export const metadata: Metadata = { title: "Kategorien" };

export default async function CategoriesPage() {
  const admin = await requireAdmin();
  const categories = await db.category.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { receipts: true } } },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Kategorien</h2>
        <p className="mt-1 text-sm text-navy-400">
          Auswahl im Erfassungs-Flow. „Bewirtung“ blendet die gesetzlichen Zusatzfelder ein.
        </p>
      </div>
      <CategoryList
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          isHospitality: c.isHospitality,
          isFuel: c.isFuel,
          active: c.active,
          receiptCount: c._count.receipts,
        }))}
      />
    </div>
  );
}
