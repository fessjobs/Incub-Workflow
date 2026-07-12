import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { KioskForm } from "./kiosk-form";

export const metadata: Metadata = { title: "Beleg erfassen" };

export default async function ErfassenPage() {
  const user = await requireUser();

  // Erlaubte Firma bestimmen (Kiosk ist auf eine Firma beschränkt)
  const access = await db.userCompanyAccess.findMany({
    where: { userId: user.id },
    include: { company: true },
  });
  let company = access.map((a) => a.company).find((c) => c.active) ?? null;
  if (!company) {
    // Fallback: fess.jobs, sonst erste aktive Firma
    company =
      (await db.company.findFirst({ where: { organizationId: user.organizationId, shortCode: "FJ", active: true } })) ??
      (await db.company.findFirst({ where: { organizationId: user.organizationId, active: true }, orderBy: { sortOrder: "asc" } }));
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Beleg erfassen</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {company ? company.brandName : "Beleg"}
        </h1>
        <p className="mt-1 text-sm text-navy-400">
          Beleg fotografieren, deinen Namen und den Auftrag eingeben – fertig.
        </p>
      </div>

      {company ? (
        <KioskForm companyId={company.id} companyName={company.brandName} />
      ) : (
        <div className="card p-6 text-sm text-navy-400">
          Für dein Konto ist keine Firma hinterlegt. Bitte den Admin um Freischaltung.
        </div>
      )}
    </div>
  );
}
