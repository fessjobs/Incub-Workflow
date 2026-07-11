import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { RuleRow } from "./rule-row";

export const metadata: Metadata = { title: "Merkregeln" };

export default async function RegelnPage() {
  const admin = await requireAdmin();
  const rules = await db.matchRule.findMany({
    where: { organizationId: admin.organizationId, active: true },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Merkregeln</h2>
        <p className="mt-1 text-sm text-navy-400">
          Wiederkehrende Buchungen (z. B. Miete, Gehälter), die bewusst keinen Beleg im Tool haben,
          werden anhand dieser Muster automatisch ignoriert. Regeln entstehen, wenn du beim Abgleich
          „merken“ ankreuzt.
        </p>
      </div>
      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {rules.length === 0 ? (
          <p className="p-4 text-sm text-navy-400">Noch keine Merkregeln.</p>
        ) : (
          rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={{ id: r.id, pattern: r.pattern, note: r.note, created: formatDate(r.createdAt), count: r._count.transactions }}
            />
          ))
        )}
      </div>
    </div>
  );
}
