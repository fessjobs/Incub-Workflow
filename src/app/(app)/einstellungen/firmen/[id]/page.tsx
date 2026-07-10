import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CompanyForm } from "../company-form";
import { updateCompany } from "../actions";

export const metadata: Metadata = { title: "Firma bearbeiten" };

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const company = await db.company.findFirst({
    where: { id, organizationId: admin.organizationId },
  });
  if (!company) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">{company.brandName} bearbeiten</h2>
      <CompanyForm
        action={updateCompany.bind(null, company.id)}
        initial={company}
        submitLabel="Änderungen speichern"
      />
    </div>
  );
}
