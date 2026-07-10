import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserForm } from "../user-form";
import { createUser } from "../actions";

export const metadata: Metadata = { title: "Neuer Nutzer" };

export default async function NewUserPage() {
  const admin = await requireAdmin();
  const companies = await db.company.findMany({
    where: { organizationId: admin.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, brandName: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Neuen Nutzer anlegen</h2>
      <UserForm action={createUser} companies={companies} isNew />
    </div>
  );
}
