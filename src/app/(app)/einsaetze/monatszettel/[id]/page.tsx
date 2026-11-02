import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDispo } from "@/lib/einsatz/access";
import { STAND_TEXT, datumAnzeige, eintragMinuten, formatStunden, monatsName, sortiert, stundenDezimal, summe, vollerName, zettelNamen, zettelStand } from "@/lib/einsatz/monatszettel";
import { ladeZettel, leseTage } from "@/lib/einsatz/service/monatszettel";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Monatszettel" };
export const dynamic = "force-dynamic";

export default async function MonatszettelDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDispo();
  const { id } = await params;
  const z = await ladeZettel(user.organizationId, id);
  if (!z) notFound();
  const tage = sortiert(leseTage(z.tage));
  const su = summe(tage);
  const stand = zettelStand({ anzahlTage: tage.length, personSigniert: z.personSignedAt !== null, kundeStatus: z.kundeStatus });
  const name = vollerName(zettelNamen(z)) || "Name noch nicht eingetragen";
  const zurueck = `/einsaetze/monatszettel?kunde=${z.batch.customerId}&monat=${z.batch.monat}`;

  return (
    <div className="space-y-6" data-testid="mz-detail">
      <Link href={zurueck} className="text-sm underline">← Alle Monatszettel von {z.batch.customer.name}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{z.batch.customer.name} · {monatsName(z.batch.monat)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-navy-400">
            {z.employee?.personalnummer ? `Personalnummer ${z.employee.personalnummer} · ` : ""}
            {z.nameOffen ? "Name selbst eingetragen · " : ""}
            {STAND_TEXT[stand]}
            {z.personSignedAt ? ` · Person unterschrieben ${formatDateTime(z.personSignedAt)}` : ""}
            {z.kundeAm && z.kundeStatus === "BESTAETIGT" ? ` · Kunde ${z.kundeName ?? ""} bestätigt ${formatDateTime(z.kundeAm)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-accent" href={`/api/documents/monatszettel/${z.id}`} target="_blank" rel="noreferrer" data-testid="mz-pdf">
            {z.kundeStatus === "BESTAETIGT" ? "PDF öffnen" : "PDF-Vorschau"}
          </a>
          <a className="btn-secondary" href={`/e/m/${z.token}`} target="_blank" rel="noreferrer">Als Person öffnen</a>
          <a className="btn-secondary" href={`/e/k/${z.batch.token}`} target="_blank" rel="noreferrer">Kundenlink öffnen</a>
          {z.batch.assignmentId ? <Link className="btn-secondary" href={`/einsaetze/${z.batch.assignmentId}`}>Einsatz {z.batch.assignment?.einsatznummer}</Link> : null}
        </div>
      </div>
      {z.kundeStatus === "ZURUECK" && z.kundeHinweis ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Der Kunde hat den Zettel zurückgegeben: „{z.kundeHinweis}“</p> : null}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm" data-testid="mz-eintraege">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-navy-400">
              <th className="px-4 py-2">Datum</th>
              <th className="px-4 py-2">Zeit</th>
              <th className="px-4 py-2">Pause</th>
              <th className="px-4 py-2 text-right">Stunden</th>
              <th className="px-4 py-2">Angaben</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
            {tage.map((e) => {
              const angaben = [
                e.taetigkeit,
                e.fahrten.length > 0 ? `Fahrt (${e.pkwArt === "FIRMA" ? "Firmenfahrzeug" : "Privat-PKW"}): ${e.fahrten.map((f) => `${f.von} – ${f.nach}${f.km ? ` (${String(f.km).replace(".", ",")} km)` : ""}`).join("; ")}` : "",
                e.spesen ? `Spesen ${e.spesen.toFixed(2).replace(".", ",")} €` : "",
                e.sonderabsprache ? `Absprache: ${e.sonderabsprache}` : "",
                e.getan ? `Getan: ${e.getan}` : "",
                e.notiz,
              ].filter(Boolean);
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{datumAnzeige(e.datum)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{e.start}–{e.ende}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.pauseMin} min</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{formatStunden(stundenDezimal(eintragMinuten(e)))}</td>
                  <td className="px-4 py-2 text-xs">{angaben.join(" · ") || "–"}</td>
                </tr>
              );
            })}
            {tage.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-navy-400">Noch keine Einträge.</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="px-4 py-2" colSpan={3}>Summe</td>
              <td className="px-4 py-2 text-right font-mono text-xs">{formatStunden(su.stunden)}</td>
              <td className="px-4 py-2 text-xs text-navy-400">{su.tage} Tage{su.km > 0 ? ` · ${String(su.km).replace(".", ",")} km` : ""}{su.spesen > 0 ? ` · ${su.spesen.toFixed(2).replace(".", ",")} € Spesen` : ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-navy-400">Nach der Unterschrift der Person stehen die Zeiten im Einsatz „Monatszettel {monatsName(z.batch.monat)}“ und laufen wie alle anderen durch Freigabe, Auswertung und Exporte. Das PDF liegt nach der Bestätigung des Kunden unter Dokumente (Stundennachweis).</p>
    </div>
  );
}
