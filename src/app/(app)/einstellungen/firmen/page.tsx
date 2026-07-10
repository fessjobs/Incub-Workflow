import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CompanyChip } from "@/components/company-chip";
import { toggleCompanyActive } from "./actions";

export const metadata: Metadata = { title: "Firmen" };

export default async function CompaniesPage() {
  const admin = await requireAdmin();
  const companies = await db.company.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { receipts: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Firmen</h2>
          <p className="mt-1 text-sm text-navy-400">
            Marke und Rechtsträger getrennt gepflegt – der Rechtsträger erscheint auf dem Beiblatt.
          </p>
        </div>
        <Link href="/einstellungen/firmen/neu" className="btn-primary">
          + Neue Firma
        </Link>
      </div>

      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {companies.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-4 p-4">
            <CompanyChip
              name={c.brandName}
              location={c.location}
              color={c.color}
              isPrivate={c.isPrivate}
              inactive={!c.active}
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate text-navy-500 dark:text-navy-300">
                {c.legalName || <span className="italic text-navy-300">Rechtsträger noch nicht hinterlegt</span>}
              </p>
              <p className="truncate text-xs text-navy-400">
                {c.address || "Anschrift fehlt"} · Kürzel {c.shortCode} · {c._count.receipts} Belege
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!c.active && (
                <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
                  inaktiv
                </span>
              )}
              <Link href={`/einstellungen/firmen/${c.id}`} className="btn-secondary !px-3 !py-1.5">
                Bearbeiten
              </Link>
              <form action={toggleCompanyActive.bind(null, c.id)}>
                <button type="submit" className="btn-secondary !px-3 !py-1.5">
                  {c.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-navy-400">
        Firmen werden deaktiviert statt gelöscht, damit Belegnummern und Historie erhalten bleiben.
      </p>
    </div>
  );
}
