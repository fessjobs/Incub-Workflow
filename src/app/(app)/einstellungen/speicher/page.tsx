import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Speicher" };

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

// Speicher-Übersicht: Wie voll ist die Datenbank? Belege (Originale + PDFs)
// liegen komplett in Postgres – bei vollem Volume schlagen Uploads fehl.
export default async function SpeicherPage() {
  await requireAdmin();

  const [sizeRow, files, receiptCount, txnCount, topFiles] = await Promise.all([
    db.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database())::bigint AS size`,
    db.receiptFile.aggregate({ _sum: { size: true }, _count: true }),
    db.receipt.count(),
    db.bankTransaction.count(),
    db.receiptFile.findMany({
      orderBy: { size: "desc" },
      take: 5,
      select: { filename: true, size: true, kind: true, receipt: { select: { receiptNumber: true, vendor: true } } },
    }),
  ]);

  const dbSize = Number(sizeRow[0]?.size ?? 0);
  const fileBytes = Number(files._sum.size ?? 0);

  const stats = [
    { label: "Datenbank gesamt", value: fmtBytes(dbSize) },
    { label: "Beleg-Dateien (Originale + PDFs)", value: fmtBytes(fileBytes) },
    { label: "Dateien", value: String(files._count) },
    { label: "Belege / Kontobewegungen", value: `${receiptCount} / ${txnCount}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Speicher</h2>
        <p className="mt-1 text-sm text-navy-400">
          Alle Beleg-Dateien liegen in der Postgres-Datenbank. Ist deren Railway-Volume voll,
          schlagen neue Uploads mit einem Datenbankfehler fehl.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-navy-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <p className="eyebrow mb-3">Größte Dateien</p>
        <div className="space-y-2 text-sm">
          {topFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">
                {f.receipt?.receiptNumber ?? "Entwurf"} · {f.receipt?.vendor || f.filename} ({f.kind === "PDF" ? "PDF" : "Original"})
              </span>
              <span className="tabular-nums text-navy-400">{fmtBytes(f.size)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-semibold">Wenn Uploads mit „Datenbankfehler“ scheitern:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>In Railway das <strong>Postgres</strong>-Service öffnen → Volume/Disk-Belegung prüfen.</li>
          <li>Volume vergrößern: Volume anklicken → <em>Grow</em> (bzw. „Extend volume“). Danach funktionieren Uploads sofort wieder.</li>
          <li>Alternativ Platz schaffen: alte Test-Importe unter Abgleich löschen oder nicht mehr benötigte Belege verwerfen.</li>
        </ol>
      </div>
    </div>
  );
}
