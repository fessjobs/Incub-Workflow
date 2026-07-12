import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { demoCount } from "@/lib/demo";
import { OrgForm } from "./org-form";
import { DemoControls } from "./demo-controls";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganizationPage() {
  const admin = await requireAdmin();
  const org = await db.organization.findUniqueOrThrow({
    where: { id: admin.organizationId },
  });
  const demos = await demoCount(admin.organizationId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Organisation &amp; Branding</h2>
        <p className="mt-1 text-sm text-navy-400">
          Mandanten-Einstellungen – Branding und Ablagepfad sind pro Mandant konfigurierbar
          (SaaS-Vorbereitung).
        </p>
      </div>
      <OrgForm
        initial={{
          name: org.name,
          brandName: org.brandName,
          tagline: org.tagline,
          primaryColor: org.primaryColor,
          storagePath: org.storagePath,
          allowSelfRegistration: org.allowSelfRegistration,
        }}
      />
      <DemoControls demoCount={demos} />
    </div>
  );
}
