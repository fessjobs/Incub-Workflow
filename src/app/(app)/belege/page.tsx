import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Belege" };

export default async function BelegePage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">02 / Belege</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Belege</h1>
      </div>

      <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-400 dark:bg-navy-800">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Noch keine Beleg-Erfassung</h2>
        <p className="max-w-md text-sm leading-relaxed text-navy-400">
          Der Kern-Flow – fotografieren, automatisch auslesen, Beiblatt-PDF
          generieren und ablegen – wird in Sprint 2 gebaut. Das Fundament dafür
          ist fertig.
        </p>
      </div>
    </div>
  );
}
