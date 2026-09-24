import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canBillingNotes, canDispo, canInvoice, canRate, canReview, requireModuleUser } from "@/lib/einsatz/access";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/einsatz/documents";
import { loadAssignment, progressOf, warningsFor } from "@/lib/einsatz/service/assignments";
import { bearbeitbarkeit } from "@/lib/einsatz/service/besetzung";
import { erfahrungFuer, erfahrungOder } from "@/lib/einsatz/service/personal";
import { pruefeEinsatzLoeschbar } from "@/lib/einsatz/service/loeschen";
import { pruefeAbrechnungsfreigabe } from "@/lib/einsatz/service/abrechnung";
import { db } from "@/lib/db";
import { gruppenlinkFor, linkRows } from "@/lib/einsatz/service/links";
import { baseUrlFromRequest } from "@/lib/einsatz/mail";
import { hasConfiguredBase, misconfiguredBase } from "@/lib/einsatz/base-url";
import { berlinDateKey, berlinTime, dateOnlyKey, formatKeyDE } from "@/lib/einsatz/tz";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "../status-badge";
import { ActionButtons } from "./action-buttons";
import { LinksPanel } from "./links-panel";
import { CorrectionForm } from "./correction-form";
import { EditKopf, EditSchicht } from "./edit-forms";
import { PasteNames } from "./paste-names";
import { RenamePerson } from "./rename-person";
import { Zeitvorgabe } from "./zeitvorgabe";
import { RatePerson } from "./rate-person";
import { BilanzBadge, ErfahrungZeile } from "../rating-badges";
import { AbrechnungCard } from "./abrechnung-card";
import { DeleteButton } from "../delete-button";
import { deleteAssignmentAction, deleteEntryAction } from "../actions";
import { cancelShiftAssignmentAction } from "../actions";

export const metadata: Metadata = { title: "Einsatz" };
export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { MITARBEITER: "Mitarbeiter", ANSPRECHPARTNER: "Ansprechpartner", SPARE: "Spare" };

export default async function EinsatzDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModuleUser();
  const { id } = await params;
  const a = await loadAssignment(user.organizationId, id);
  if (!a) notFound();
  const dispo = canDispo(user);
  const progress = progressOf(a);
  const warnings = await warningsFor(a);
  // Ohne gesetzte APP_BASE_URL die Adresse aus dem laufenden Aufruf ableiten,
  // damit die kopierten Links immer vollständig sind (Handy!).
  const base = await baseUrlFromRequest();
  const links = linkRows(a, base);
  const gruppe = gruppenlinkFor(a, base);
  const von = dateOnlyKey(a.datumVon);
  const bis = dateOnlyKey(a.datumBis);
  // Wie weit der Einsatz noch offen ist – Kunde und Freigabe sind die Grenzen
  const offen = bearbeitbarkeit(a);
  const kunden = dispo ? await db.customer.findMany({ where: { organizationId: user.organizationId, aktiv: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  // Interne Beurteilung und Erfahrung: nur fürs Backend, nie im Link oder PDF
  const darfBewerten = canRate(user);
  const darfFreigeben = canReview(user);
  const personen = a.shifts.flatMap((s) => s.assignments.map((sa) => sa.employeeId));
  const erfahrung = darfBewerten ? await erfahrungFuer(user.organizationId, [...new Set(personen)]) : new Map();
  const loeschbar = dispo ? pruefeEinsatzLoeschbar(user, a) : null;
  const offeneZeiten = a.shifts.reduce(
    (n, s) => n + s.assignments.filter((sa) => sa.status !== "STORNIERT" && sa.timeEntries.some((t) => t.unterschriftZeitpunkt && t.review !== "FREIGEGEBEN")).length,
    0
  );
  // Abrechnung: offen → freigegeben (Dispo) → berechnet (Buchhaltung)
  const abrechnung = pruefeAbrechnungsfreigabe(a);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            <Link href="/einsaetze" className="hover:underline">
              Einsätze
            </Link>{" "}
            · {a.einsatznummer}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {a.projekt}
            {a.artist && a.artist !== a.projekt ? <span className="text-navy-400"> · {a.artist}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            {a.customer.name} · {a.einsatzort} · {formatKeyDE(von)}
            {von !== bis ? ` – ${formatKeyDE(bis)}` : ""}
            {a.einsatzbereich ? ` · ${a.einsatzbereich}` : ""}
            {a.aueVertragRef ? ` · AÜV ${a.aueVertragRef}` : ""} · Feiertage: {a.bundesland ?? "BW"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            <span className={`badge ${progress.gesamt > 0 && progress.erfasst === progress.gesamt ? "bg-emerald-100 text-emerald-700" : "bg-navy-100 text-navy-600"}`}>
              {progress.erfasst} von {progress.gesamt} unterschrieben
            </span>
            {a.confirmations[0] ? <span className="badge bg-emerald-100 text-emerald-700">Kunde: {a.confirmations[0].kundeName}</span> : null}
          </div>
        </div>
        <ActionButtons assignmentId={a.id} status={a.status} dispo={dispo} freigeben={darfFreigeben} offeneZeiten={offeneZeiten} />
      </div>

      {dispo ? (
        <EditKopf
          assignmentId={a.id}
          kunden={kunden}
          gesperrt={offen.kopf ? null : offen.grund}
          werte={{
            projekt: a.projekt,
            artist: a.artist ?? "",
            customerId: a.customerId,
            einsatzort: a.einsatzort,
            einsatzbereich: a.einsatzbereich ?? "",
            aueVertragRef: a.aueVertragRef ?? "",
            bundesland: a.bundesland ?? "",
            notizen: a.notizen ?? "",
          }}
        />
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">Warnungen</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="mr-1 text-[11px] uppercase tracking-wide opacity-70">{w.art}</span>
                {w.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.shifts.map((s) => (
        <div key={s.id} className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3 dark:border-navy-800">
            <div>
              <p className="font-medium">
                {s.bezeichnung}
                {s.taetigkeit ? <span className="text-navy-400"> · {s.taetigkeit}</span> : null}
              </p>
              <p className="text-xs text-navy-400">
                {formatKeyDE(berlinDateKey(s.planStart))} {berlinTime(s.planStart)}–{berlinTime(s.planEnde)}
                {berlinDateKey(s.planEnde) !== berlinDateKey(s.planStart) ? " (+1)" : ""}
                {s.treffpunkt ? ` · Treffpunkt ${s.treffpunkt}` : ""}
                {s.anzahlSoll !== null ? ` · Soll ${s.anzahlSoll}` : ""}
                {s.garantieStunden !== null ? ` · Garantie ${Number(s.garantieStunden)} h` : ""}
              </p>
              {dispo && s.vorgabeStart && s.vorgabeEnde && s.vorgabePause !== null ? (
                <Zeitvorgabe shiftId={s.id} start={berlinTime(s.vorgabeStart)} ende={berlinTime(s.vorgabeEnde)} pauseMinuten={s.vorgabePause} von={s.vorgabeVon ?? "–"} />
              ) : null}
            </div>
            {dispo && offen.schichten ? (
              <EditSchicht
                shiftId={s.id}
                gesperrt={null}
                werte={{
                  bezeichnung: s.bezeichnung,
                  taetigkeit: s.taetigkeit,
                  datum: berlinDateKey(s.planStart),
                  start: berlinTime(s.planStart),
                  endeDatum: berlinDateKey(s.planEnde),
                  ende: berlinTime(s.planEnde),
                  treffpunkt: s.treffpunkt ?? "",
                  anzahlSoll: s.anzahlSoll === null ? "" : String(s.anzahlSoll),
                  garantieStunden: s.garantieStunden === null ? "" : String(Number(s.garantieStunden)),
                }}
              />
            ) : null}
          </div>
          <div className="divide-y divide-navy-100 dark:divide-navy-800">
            {s.assignments.map((sa) => {
              const e = sa.timeEntries[0];
              return (
                <div key={sa.id} className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center ${sa.status === "STORNIERT" ? "opacity-50" : ""}`}>
                  <div>
                    <p className="font-medium" data-testid={`person-name-${sa.id}`}>
                      {sa.employee.vorname} {sa.employee.nachname}
                      <span className="ml-2 text-xs text-navy-400">{ROLE[sa.rolle]}</span>
                    </p>
                    <p className="text-xs text-navy-400">
                      {sa.employee.personalnummer ? `PN ${sa.employee.personalnummer}` : "ohne Personalnummer"} · <StatusBadge status={sa.status} />
                    </p>
                    {darfBewerten ? (
                      <p className="mt-1">
                        <a href={`/einsaetze/personal/${sa.employeeId}`} className="hover:underline">
                          <ErfahrungZeile e={erfahrungOder(erfahrung, sa.employeeId)} maxTaetigkeiten={2} />
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <div className="text-xs text-navy-500">
                    {e ? (
                      <>
                        <p>
                          Ist {berlinTime(e.istStart)}–{berlinTime(e.istEnde)}
                          {berlinDateKey(e.istEnde) !== berlinDateKey(e.istStart) ? " (+1)" : ""} · Pause {e.pauseMinuten} min · <strong>{Number(e.stundenGesamt).toFixed(2)} h</strong>
                        </p>
                        <p>
                          {e.pkw ? `PKW ${e.pkwArt === "FIRMA" ? "Firma" : "privat"} (${e.trips.reduce((k, t) => k + Number(t.km), 0)} km)` : "kein PKW"} · {e.spesen ? "Spesen" : "keine Spesen"} · <StatusBadge status={e.review} />
                          {e.version > 1 ? ` · v${e.version}` : ""}
                        </p>
                      </>
                    ) : (
                      <p>noch nicht erfasst</p>
                    )}
                  </div>
                  <div className="text-xs text-navy-500">
                    {e?.unterschriftZeitpunkt ? (
                      <div className="flex items-center gap-2">
                        {e.unterschriftMitarbeiterUrl?.startsWith("/api/blobs/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.unterschriftMitarbeiterUrl} alt="Unterschrift" className="h-8 rounded border border-navy-100 bg-white" />
                        ) : null}
                        <span>
                          {formatDateTime(e.unterschriftZeitpunkt)}
                          <br />
                          {e.quelle} · {e.geraet ?? "–"}
                        </span>
                      </div>
                    ) : (
                      <span>keine Unterschrift</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {dispo && e ? <CorrectionForm entry={{ id: e.id, startDatum: berlinDateKey(e.istStart), start: berlinTime(e.istStart), endeDatum: berlinDateKey(e.istEnde), ende: berlinTime(e.istEnde), pauseMinuten: e.pauseMinuten, taetigkeit: e.taetigkeit ?? "", notiz: e.notiz ?? "", pkw: e.pkw, pkwArt: e.pkwArt, spesen: e.spesen, spesenBetrag: e.spesenBetrag === null ? null : Number(e.spesenBetrag), review: e.review }} name={`${sa.employee.vorname} ${sa.employee.nachname}`} /> : null}
                    {darfBewerten && e?.unterschriftZeitpunkt ? (
                      <RatePerson shiftAssignmentId={sa.id} wert={sa.bewertung?.wert ?? null} notiz={sa.bewertung?.notiz ?? null} name={`${sa.employee.vorname} ${sa.employee.nachname}`} />
                    ) : null}
                    {dispo ? <RenamePerson shiftAssignmentId={sa.id} vorname={sa.employee.vorname} nachname={sa.employee.nachname} unterschrieben={Boolean(e?.unterschriftZeitpunkt)} /> : null}
                    {darfFreigeben && e ? (
                      <DeleteButton
                        testId={`zeit-loeschen-${sa.id}`}
                        label="Stunden löschen"
                        frage={`Erfassung von ${sa.employee.vorname} ${sa.employee.nachname} löschen?`}
                        mitgeht={[
                          `${Number(e.stundenGesamt).toFixed(2).replace(".", ",")} h am ${formatKeyDE(berlinDateKey(e.istStart))}${e.version > 1 ? ` (alle ${e.version} Versionen)` : ""}`,
                          e.unterschriftZeitpunkt ? "die Unterschrift" : "noch keine Unterschrift",
                          "eine gesetzte Beurteilung dieser Schicht",
                        ]}
                        bestaetigungWort={null}
                        gesperrtGrund={e.review === "FREIGEGEBEN" ? "freigegeben – erst Freigabe zurücknehmen" : null}
                        onDelete={deleteEntryAction.bind(null, sa.id)}
                      />
                    ) : null}
                    {dispo && !e ? (
                      <form action={cancelShiftAssignmentAction.bind(null, sa.id)}>
                        <button type="submit" className="btn-secondary text-xs">
                          {sa.status === "STORNIERT" ? "Reaktivieren" : "Stornieren"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {dispo && offen.besetzung ? <PasteNames shiftId={s.id} schicht={s.bezeichnung} /> : null}
        </div>
      ))}

      {dispo ? <LinksPanel assignmentId={a.id} rows={links} gruppe={gruppe} baseConfigured={hasConfiguredBase()} fehlkonfiguriert={misconfiguredBase()} /> : null}

      <div className="card p-5">
        <p className="eyebrow">Dokumente</p>
        {a.documentLinks.length === 0 ? (
          <p className="mt-2 text-sm text-navy-400">Noch keine Dokumente. Konkretisierung und Stundennachweis werden hier abgelegt (Kategorie im Dokumentenspeicher).</p>
        ) : (
          <ul className="mt-2 divide-y divide-navy-100 text-sm dark:divide-navy-800">
            {Array.from(new Map(a.documentLinks.map((l) => [l.document.id, l.document])).values()).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="badge-accent mr-2">{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</span>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {d.filename}
                  </a>
                  <span className="ml-2 text-xs text-navy-400">
                    {formatDateTime(d.createdAt)} · {Math.round(d.size / 1024)} KB · SHA-256 {d.sha256.slice(0, 12)}…
                  </span>
                </div>
                <a href={`/api/documents/${d.id}?dl=1`} className="btn-secondary text-xs">
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AbrechnungCard
        assignmentId={a.id}
        einsatznummer={a.einsatznummer}
        stand={a.abrechnung}
        angaben={{ angebotsnummer: a.angebotsnummer ?? "", konditionen: a.konditionen ?? "", abrechnungHinweis: a.abrechnungHinweis ?? "" }}
        pruefung={{ moeglich: abrechnung.moeglich, offen: abrechnung.offen, stunden: abrechnung.stunden, personen: abrechnung.personen }}
        freigabe={{ von: a.freigabeVon, am: a.freigabeAm ? formatDateTime(a.freigabeAm) : null }}
        rechnung={{ nummer: a.rechnungsnummer, von: a.rechnungVon, am: a.rechnungAm ? formatDateTime(a.rechnungAm) : null }}
        darfAngaben={canBillingNotes(user)}
        darfFreigeben={darfFreigeben}
        darfRechnung={canInvoice(user)}
      />

      {dispo && loeschbar ? (
        <div className="card p-5" data-testid="einsatz-loeschen-karte">
          <p className="eyebrow">Einsatz löschen</p>
          <p className="mt-1 text-sm text-navy-400">
            Entfernt den Einsatz mit allen Schichten, Einteilungen, Erfassungen und den dazugehörigen PDFs. Was gelöscht wurde, bleibt mit allen Daten im Protokoll.
          </p>
          <div className="mt-3">
            <DeleteButton
              testId="einsatz-loeschen"
              label={`Einsatz ${a.einsatznummer} löschen`}
              frage={`Einsatz ${a.einsatznummer} „${a.projekt}“ wirklich löschen?`}
              mitgeht={[
                `${a.shifts.length} Schicht(en) mit ${a.shifts.reduce((n, s) => n + s.assignments.length, 0)} Einteilung(en)`,
                loeschbar.unterschriften > 0 ? `${loeschbar.unterschriften} unterschriebene Erfassung(en)` : "keine erfassten Zeiten",
                loeschbar.kundeBestaetigt ? "die Bestätigung des Kunden" : "keine Kundenbestätigung",
                loeschbar.dokumente > 0 ? `${loeschbar.dokumente} PDF(s) aus dem Dokumentenspeicher` : "keine PDFs",
              ]}
              bestaetigungWort={loeschbar.bestaetigungNoetig ? a.einsatznummer : null}
              gesperrtGrund={loeschbar.moeglich ? null : loeschbar.grund}
              onDelete={deleteAssignmentAction.bind(null, a.id)}
              weiterNach="/einsaetze"
            />
          </div>
        </div>
      ) : null}

      {a.rawInput ? (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-medium">Rohtext (Original)</summary>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 font-mono text-xs dark:bg-navy-800">{a.rawInput}</pre>
        </details>
      ) : null}
    </div>
  );
}
