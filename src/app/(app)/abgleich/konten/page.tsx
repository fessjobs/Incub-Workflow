import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountManager } from "./account-manager";

export const metadata: Metadata = { title: "Bankkonten" };

export default async function KontenPage() {
  const admin = await requireAdmin();
  const [accounts, companies] = await Promise.all([
    db.bankAccount.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { company: true, _count: { select: { transactions: true } } },
    }),
    db.company.findMany({
      where: { organizationId: admin.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, brandName: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Bankkonten</h2>
        <p className="mt-1 text-sm text-navy-400">
          Mehrere Konten pro Firma und private Konten. Die Zuordnung Konto → Firma steuert die
          Auswertungen pro Firma.
        </p>
      </div>
      <AccountManager
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          iban: a.iban,
          companyId: a.companyId,
          companyName: a.company?.brandName ?? null,
          isPrivate: a.isPrivate,
          active: a.active,
          txnCount: a._count.transactions,
        }))}
        companies={companies}
      />
    </div>
  );
}
