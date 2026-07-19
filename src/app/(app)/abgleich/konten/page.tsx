import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountVisibility } from "@/lib/bank/scope";
import { AccountManager } from "./account-manager";

export const metadata: Metadata = { title: "Bankkonten" };

export default async function KontenPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const accounts = await db.bankAccount.findMany({
    where: { organizationId: user.organizationId, ...accountVisibility(user) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { owner: { select: { name: true } }, _count: { select: { transactions: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Meine Bankkonten</h2>
        <p className="mt-1 text-sm text-navy-400">
          Deine privaten und geschäftlichen Konten. Kontoauszüge gehören dir – beim Abgleich
          legst du pro Buchung fest, für welche Firma die Ausgabe war.
        </p>
      </div>
      <AccountManager
        showOwner={isAdmin}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          iban: a.iban,
          isPrivate: a.isPrivate,
          active: a.active,
          ownerName: a.owner?.name ?? null,
          txnCount: a._count.transactions,
        }))}
      />
    </div>
  );
}
