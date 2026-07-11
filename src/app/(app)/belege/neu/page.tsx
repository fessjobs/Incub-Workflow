import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { isExtractionAvailable } from "@/lib/claude";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Belege erfassen" };

export default async function NewReceiptsPage() {
  const user = await requireUser();
  const autoRead = isExtractionAvailable();

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">02 / Erfassen</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Belege erfassen</h1>
        <p className="mt-1 text-sm text-navy-400">
          Fotografieren, scannen oder hochladen – auch mehrere auf einmal.
          {autoRead && " Jeder Beleg wird automatisch ausgelesen und aus früheren Belegen vorbelegt."}
        </p>
      </div>

      {!autoRead && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">Automatisches Auslesen ist inaktiv</p>
          <p className="mt-1">
            Es ist kein <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900">ANTHROPIC_API_KEY</code> hinterlegt –
            Belege werden hochgeladen, aber nicht automatisch ausgelesen.
          </p>
          {user.role === "ADMIN" && (
            <p className="mt-2">
              <strong>So aktivierst du es:</strong> Schlüssel auf console.anthropic.com erstellen →
              in Railway beim App-Baustein unter <em>Variables</em> als{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900">ANTHROPIC_API_KEY</code> eintragen
              (lokal: in der <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900">.env</code>).
              Danach bei bestehenden Entwürfen einfach „Neu auslesen“ klicken.
            </p>
          )}
        </div>
      )}

      <Uploader autoRead={autoRead} />
    </div>
  );
}
