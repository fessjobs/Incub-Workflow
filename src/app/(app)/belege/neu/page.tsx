import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { isExtractionAvailable } from "@/lib/claude";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Belege erfassen" };

export default async function NewReceiptsPage() {
  await requireUser();
  const autoRead = isExtractionAvailable();

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">02 / Erfassen</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Belege erfassen</h1>
        <p className="mt-1 text-sm text-navy-400">
          Fotografieren, scannen oder hochladen – auch mehrere auf einmal.
          {autoRead
            ? " Jeder Beleg wird automatisch ausgelesen."
            : " Automatisches Auslesen ist inaktiv (kein API-Schlüssel) – Felder werden manuell erfasst."}
        </p>
      </div>
      <Uploader autoRead={autoRead} />
    </div>
  );
}
