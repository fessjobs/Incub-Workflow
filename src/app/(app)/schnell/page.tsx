import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { QuickUpload } from "./quick-upload";

export const metadata: Metadata = { title: "Schnell-Upload" };

// Schnell-Upload für Gesellschafter: von überall Beleg → Firma → Zahlungsart
// (eigene Amex) → bezahlt/offen → fertig. Mit sofortigem Zahlungs-Check.
export default async function SchnellPage() {
  const user = await requireUser();

  const access = await db.userCompanyAccess.findMany({ where: { userId: user.id } });
  const companies = await db.company.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, brandName: true, color: true },
  });
  const allowedCompanies =
    access.length === 0 ? companies : companies.filter((c) => access.some((a) => a.companyId === c.id));

  // Karten: eigene zuerst (Gesellschafter wählt meist die eigene Amex)
  const cards = await db.corporateCard.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true, holderUserId: true },
  });
  cards.sort((a, b) => Number(b.holderUserId === user.id) - Number(a.holderUserId === user.id));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="eyebrow">Schnell-Upload</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Beleg in 10 Sekunden</h1>
        <p className="mt-1 text-sm text-navy-400">
          Foto → Firma → Zahlungsart → bezahlt oder offen. Alles Weitere liest die Automatik
          aus; der Zahlungs-Check sucht sofort die passende Kontobewegung.
        </p>
      </div>
      <QuickUpload
        companies={allowedCompanies}
        cards={cards.map((c) => ({ id: c.id, label: c.label, own: c.holderUserId === user.id }))}
      />
    </div>
  );
}
