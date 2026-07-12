import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleUserActive } from "./actions";

export const metadata: Metadata = { title: "Nutzer" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await db.user.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      companyAccess: { include: { company: true } },
      _count: { select: { receipts: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Nutzer</h2>
          <p className="mt-1 text-sm text-navy-400">
            Mitglieder sehen ausschließlich ihre eigenen Belege und Auswertungen.
          </p>
        </div>
        <Link href="/einstellungen/nutzer/neu" className="btn-primary">
          + Neuer Nutzer
        </Link>
      </div>

      <div className="card divide-y divide-navy-100 dark:divide-navy-800">
        {users.map((u) => (
          <div
            key={u.id}
            className={`flex flex-wrap items-center gap-4 p-4 ${u.active ? "" : "opacity-50"}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white dark:bg-white dark:text-navy-900">
              {u.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {u.name}
                {u.id === admin.id && <span className="ml-2 text-xs text-navy-400">(du)</span>}
              </p>
              <p className="truncate text-xs text-navy-400">
                {u.email} · {u._count.receipts} Belege
                {u.companyAccess.length > 0 &&
                  ` · nur: ${u.companyAccess.map((a) => a.company.brandName).join(", ")}`}
              </p>
            </div>
            <span
              className={`badge ${
                u.role === "ADMIN"
                  ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900"
                  : "bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300"
              }`}
            >
              {u.role === "ADMIN" ? "Admin" : u.role === "EINREICHER" ? "Kiosk" : "Mitglied"}
            </span>
            {!u.active && (
              <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
                deaktiviert
              </span>
            )}
            <Link href={`/einstellungen/nutzer/${u.id}`} className="btn-secondary !px-3 !py-1.5">
              Bearbeiten
            </Link>
            {u.id !== admin.id && (
              <form action={toggleUserActive.bind(null, u.id)}>
                <button type="submit" className="btn-secondary !px-3 !py-1.5">
                  {u.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
