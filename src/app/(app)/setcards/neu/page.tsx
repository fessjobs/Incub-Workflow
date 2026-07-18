import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasTheme, SETCARD_THEMES } from "@/lib/setcard/themes";
import { isSetcardAiAvailable } from "@/lib/setcard/extract";
import { SetcardWizard } from "../wizard";

export const metadata: Metadata = { title: "Neue Setcard" };

export default async function NeueSetcardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const initialPersonId = typeof sp.person === "string" ? sp.person : null;
  const admin = await requireAdmin();

  const companies = (
    await db.company.findMany({
      where: { organizationId: admin.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, brandName: true, shortCode: true, color: true },
    })
  ).filter((c) => hasTheme(c.shortCode));

  const persons = await db.person.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/setcards" className="text-sm text-navy-400 hover:underline">← Setcards</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Neue Setcard</h1>
      </div>
      <SetcardWizard
        companies={companies}
        persons={persons.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))}
        themes={SETCARD_THEMES}
        aiAvailable={isSetcardAiAvailable()}
        initialPersonId={initialPersonId}
      />
    </div>
  );
}
