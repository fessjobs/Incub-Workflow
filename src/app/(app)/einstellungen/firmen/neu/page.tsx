import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { CompanyForm } from "../company-form";
import { createCompany } from "../actions";

export const metadata: Metadata = { title: "Neue Firma" };

export default async function NewCompanyPage() {
  await requireAdmin();
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Neue Firma anlegen</h2>
      <CompanyForm action={createCompany} submitLabel="Firma anlegen" />
    </div>
  );
}
