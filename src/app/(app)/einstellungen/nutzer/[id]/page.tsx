import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserForm } from "../user-form";
import { updateUser } from "../actions";

export const metadata: Metadata = { title: "Nutzer bearbeiten" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findFirst({
    where: { id, organizationId: admin.organizationId },
    include: { companyAccess: true },
  });
  if (!user) notFound();

  const companies = await db.company.findMany({
    where: { organizationId: admin.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, brandName: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">{user.name} bearbeiten</h2>
      <UserForm
        action={updateUser.bind(null, user.id)}
        companies={companies}
        initial={{
          name: user.name,
          email: user.email,
          role: user.role,
          companyIds: user.companyAccess.map((a) => a.companyId),
        }}
        isSelf={user.id === admin.id}
      />
    </div>
  );
}
