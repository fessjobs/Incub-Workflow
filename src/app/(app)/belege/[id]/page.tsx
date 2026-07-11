import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receiptScope } from "@/lib/receipts";
import { formatDateTime } from "@/lib/format";
import { ReceiptEditor } from "./receipt-editor";
import { ReimbursementControl } from "./reimbursement-control";

export const metadata: Metadata = { title: "Beleg" };

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const receipt = await db.receipt.findFirst({
    where: { id, ...receiptScope(user) },
    include: {
      company: true,
      category: true,
      user: true,
      vehicle: true,
      versions: { orderBy: { versionNo: "desc" }, include: { createdBy: true } },
      files: { select: { kind: true } },
    },
  });
  if (!receipt) notFound();

  const access = await db.userCompanyAccess.findMany({ where: { userId: user.id } });
  const companies = await db.company.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const allowedCompanies = access.length === 0 ? companies : companies.filter((c) => access.some((a) => a.companyId === c.id));
  const categories = await db.category.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const vehicles = await db.vehicle.findMany({
    where: { organizationId: user.organizationId, active: true },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const hasPdf = receipt.files.some((f) => f.kind === "PDF");
  const hasOriginal = receipt.files.some((f) => f.kind === "ORIGINAL");
  const isDraft = receipt.status === "ENTWURF";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/belege" className="text-sm text-navy-400 hover:underline">
          ← Belege
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {receipt.receiptNumber ?? "Neuer Beleg"}
          </h1>
          <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
            {isDraft ? "Entwurf" : "Abgelegt"}
          </span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <ReceiptEditor
            receipt={{
              id: receipt.id,
              companyId: receipt.companyId,
              categoryId: receipt.categoryId,
              receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
              vendor: receipt.vendor,
              grossAmount: receipt.grossAmount ? Number(receipt.grossAmount) : null,
              netAmount: receipt.netAmount !== null ? Number(receipt.netAmount) : null,
              vatLines: (receipt.vatLines as unknown as { rate: number; net: number; vat: number }[]) ?? [],
              kind: receipt.kind,
              paymentMethod: receipt.paymentMethod,
              purpose: receipt.purpose,
              approved: receipt.approved,
              isSelfReceipt: receipt.isSelfReceipt,
              selfReceiptReason: receipt.selfReceiptReason,
              hospitalityGuests: receipt.hospitalityGuests,
              hospitalityOccasion: receipt.hospitalityOccasion,
              hospitalityLocation: receipt.hospitalityLocation,
              vehicleName: receipt.vehicle?.name ?? null,
              odometerKm: receipt.odometerKm,
              notes: receipt.notes,
              status: receipt.status,
            }}
            companies={allowedCompanies.map((c) => ({ id: c.id, brandName: c.brandName, color: c.color }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, isHospitality: c.isHospitality, isFuel: c.isFuel }))}
            vehicles={vehicles.map((v) => v.name)}
            canDelete={isDraft || user.role === "ADMIN"}
          />

          {/* Versionshistorie */}
          {receipt.versions.length > 0 && (
            <section className="space-y-3">
              <p className="eyebrow">Historie</p>
              <div className="card divide-y divide-navy-100 text-sm dark:divide-navy-800">
                {receipt.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-4 py-3">
                    <span>Version {v.versionNo}</span>
                    <span className="text-xs text-navy-400">
                      {v.createdBy.name} · {formatDateTime(v.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Seitenspalte: Vorschau + Downloads + Erstattung */}
        <aside className="space-y-4">
          {!isDraft && receipt.kind === "AUSLAGE" && (
            <ReimbursementControl receiptId={receipt.id} status={receipt.reimbursementStatus} />
          )}
          <div className="card p-4">
            <p className="eyebrow mb-3">Dateien</p>
            <div className="space-y-2">
              {hasPdf ? (
                <div className="flex gap-2">
                  <a href={`/belege/${receipt.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary flex-1 justify-center">
                    PDF ansehen
                  </a>
                  <a href={`/belege/${receipt.id}/pdf?dl=1`} className="btn-secondary justify-center" title="Herunterladen">
                    ↓
                  </a>
                </div>
              ) : (
                <p className="text-xs text-navy-400">PDF wird beim Ablegen erzeugt.</p>
              )}
              {hasOriginal && (
                <a href={`/belege/${receipt.id}/original`} target="_blank" rel="noreferrer" className="btn-secondary w-full justify-center">
                  Original ansehen
                </a>
              )}
            </div>
          </div>
          {hasOriginal && (
            <div className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/belege/${receipt.id}/original`} alt="Beleg-Original" className="w-full" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
