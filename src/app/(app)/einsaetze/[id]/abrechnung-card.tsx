"use client";

// Der Weg zur Rechnung auf einen Blick: drei Handgriffe, immer nur der eine,
// der jetzt dran ist.
//
//   1. Stunden bestätigen + Ergänzungen (Buchhaltung)
//   2. Angaben zur Abrechnung (Admin)
//   3. Rechnung schreiben (Buchhaltung)
//
// Der Admin darf jeden Schritt selbst gehen.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addErgaenzungAction,
  deleteErgaenzungAction,
  handOverToInvoiceAction,
  releaseAssignmentAction,
  releaseForInvoiceAction,
  saveAbrechnungsangabenAction,
  setInvoiceAction,
  withdrawHandOverAction,
  withdrawInvoiceAction,
  withdrawInvoiceReleaseAction,
} from "../actions";

export type AbrechnungStand = "OFFEN" | "FREIGEGEBEN" | "BEREIT" | "BERECHNET";
type Art = "BONUS" | "FAHRTKOSTEN" | "SPESEN" | "ZUSCHLAG" | "ABZUG" | "SONSTIGES";

export type ErgaenzungZeile = { id: string; art: Art; artLabel: string; betrag: number; person: string | null; bemerkung: string | null };

type Props = {
  assignmentId: string;
  einsatznummer: string;
  stand: AbrechnungStand;
  angaben: { angebotsnummer: string; konditionen: string; abrechnungHinweis: string };
  pruefung: { moeglich: boolean; offen: string[]; stunden: number; personen: number; bestaetigbar: number; offeneZeiten: number };
  ergaenzungen: ErgaenzungZeile[];
  ergaenzungenSumme: number;
  mitarbeiter: Array<{ id: string; name: string }>;
  freigabe: { von: string | null; am: string | null };
  angabenMeta: { von: string | null; am: string | null };
  rechnung: { nummer: string | null; von: string | null; am: string | null };
  darfStunden: boolean;
  darfAngaben: boolean;
  darfRechnung: boolean;
};

const ARTEN: Array<{ wert: Art; label: string }> = [
  { wert: "BONUS", label: "Bonus" },
  { wert: "FAHRTKOSTEN", label: "Fahrtkosten" },
  { wert: "SPESEN", label: "Spesen" },
  { wert: "ZUSCHLAG", label: "Zuschlag" },
  { wert: "ABZUG", label: "Abzug" },
  { wert: "SONSTIGES", label: "Sonstiges" },
];

const STUFEN: Array<{ titel: string; wer: string }> = [
  { titel: "Stunden & Ergänzungen", wer: "Buchhaltung" },
  { titel: "Angaben zur Abrechnung", wer: "Admin" },
  { titel: "Rechnung", wer: "Buchhaltung" },
];

// Wie viele Schritte sind erledigt – daraus ergibt sich die Leiste
const ERLEDIGT: Record<AbrechnungStand, number> = { OFFEN: 0, FREIGEGEBEN: 1, BEREIT: 2, BERECHNET: 3 };

const STAND_TEXT: Record<AbrechnungStand, string> = {
  OFFEN: "Stunden offen",
  FREIGEGEBEN: "Stunden freigegeben",
  BEREIT: "Rechnung offen",
  BERECHNET: "Rechnung geschrieben",
};

const STAND_STIL: Record<AbrechnungStand, string> = {
  OFFEN: "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  FREIGEGEBEN: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  BEREIT: "badge bg-navy-200 text-navy-700 dark:bg-navy-700 dark:text-navy-100",
  BERECHNET: "badge bg-navy-900 text-white dark:bg-white dark:text-navy-900",
};

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const stunden = (n: number) => `${n.toFixed(2).replace(".", ",")} h`;

export function AbrechnungCard(props: Props) {
  const { assignmentId, einsatznummer, stand, pruefung, freigabe, angabenMeta, rechnung } = props;
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Angaben lokal halten, damit Tippen nicht bei jedem Refresh verloren geht
  const [angebotsnummer, setAngebotsnummer] = useState(props.angaben.angebotsnummer);
  const [konditionen, setKonditionen] = useState(props.angaben.konditionen);
  const [hinweis, setHinweis] = useState(props.angaben.abrechnungHinweis);
  const [nummer, setNummer] = useState(rechnung.nummer ?? "");

  // Neue Ergänzung
  const [art, setArt] = useState<Art>("BONUS");
  const [betrag, setBetrag] = useState("");
  const [person, setPerson] = useState("");
  const [bemerkung, setBemerkung] = useState("");

  const offen = stand !== "BERECHNET";
  // Schritt 2 ist erst offen, wenn die Stunden freigegeben sind
  const angabenFelder = (stand === "FREIGEGEBEN" || stand === "BEREIT") && props.darfAngaben;
  const erledigt = ERLEDIGT[stand];

  function ruf(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, danach?: () => void) {
    starte(async () => {
      setMeldung(null);
      setFehler(null);
      const res = await fn();
      if (!res.ok) return setFehler(res.error);
      setMeldung(res.message ?? "Gespeichert.");
      danach?.();
      router.refresh();
    });
  }

  const angabenDaten = { angebotsnummer, konditionen, abrechnungHinweis: hinweis };

  return (
    <div className="card p-5" data-testid="abrechnung-karte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Abrechnung</p>
          <p className="mt-1 text-sm text-navy-400">
            {stunden(pruefung.stunden)} freigegebene Stunden · {pruefung.personen} Person(en)
            {props.ergaenzungen.length > 0 ? ` · Ergänzungen ${euro(props.ergaenzungenSumme)}` : ""}
          </p>
        </div>
        <span className={STAND_STIL[stand]} data-testid="abrechnung-stand">
          {STAND_TEXT[stand]}
        </span>
      </div>

      {/* Die drei Handgriffe als Leiste – wo stehen wir, wer ist dran */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {STUFEN.map((s, i) => {
          const fertig = i < erledigt;
          const dran = i === erledigt;
          return (
            <li
              key={s.titel}
              data-testid={`abrechnung-stufe-${i + 1}`}
              className={`rounded-lg border px-3 py-2 text-xs ${
                fertig
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  : dran
                    ? "border-navy-300 bg-navy-50 font-medium dark:border-navy-600 dark:bg-navy-800"
                    : "border-navy-100 text-navy-400 dark:border-navy-800"
              }`}
            >
              <span className="font-semibold">
                {fertig ? "✓ " : `${i + 1}. `}
                {s.titel}
              </span>
              <span className="block opacity-70">{s.wer}</span>
            </li>
          );
        })}
      </ol>

      {/* ── 1 Stunden bestätigen und Ergänzungen ───────────────────────────── */}
      <div className="mt-5 border-t border-navy-100 pt-4 dark:border-navy-800">
        <p className="text-sm font-medium">1. Stunden bestätigen und Ergänzungen aufnehmen</p>

        {stand === "OFFEN" ? (
          <>
            {pruefung.offen.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-navy-500" data-testid="abrechnung-offene-punkte">
                {pruefung.offen.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-navy-400">Alle Zeiten sind bestätigt – der Einsatz kann weiter an die Abrechnung.</p>
            )}
            {props.darfStunden ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pruefung.bestaetigbar > 0 ? (
                  <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="stunden-bestaetigen" onClick={() => ruf(() => releaseAssignmentAction(assignmentId))}>
                    {laeuft ? "bestätigt …" : `Stunden bestätigen (${pruefung.bestaetigbar})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-accent text-xs"
                  disabled={laeuft || !pruefung.moeglich}
                  title={pruefung.moeglich ? undefined : pruefung.offen[0]}
                  data-testid="abrechnung-freigeben"
                  onClick={() => ruf(() => releaseForInvoiceAction(assignmentId))}
                >
                  {laeuft ? "gibt frei …" : "Stunden freigeben"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-navy-400">Die Stunden bestätigt und gibt die Buchhaltung frei.</p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" data-testid="abrechnung-freigabe-info">
              <span className="font-medium">{stunden(pruefung.stunden)} freigegeben</span> von {freigabe.von ?? "–"}
              {freigabe.am ? ` am ${freigabe.am}` : ""}
            </p>
            {props.darfStunden && stand === "FREIGEGEBEN" ? (
              <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="abrechnung-freigabe-zurueck" onClick={() => ruf(() => withdrawInvoiceReleaseAction(assignmentId))}>
                Freigabe zurücknehmen
              </button>
            ) : null}
          </div>
        )}

        {/* Ergänzungen: Bonus, Fahrtkosten, Spesen, Zuschlag, Abzug */}
        <div className="mt-3 rounded-lg border border-navy-100 p-3 dark:border-navy-800" data-testid="ergaenzungen">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">Ergänzungen zur Abrechnung</span>
            <span className="tabular-nums text-navy-500" data-testid="ergaenzungen-summe">
              Summe {euro(props.ergaenzungenSumme)}
            </span>
          </p>
          {props.ergaenzungen.length === 0 ? (
            <p className="mt-1 text-xs text-navy-400">Noch keine – Bonus, Fahrtkosten, Spesen, Zuschläge oder Abzüge kommen hier dazu.</p>
          ) : (
            <ul className="mt-2 divide-y divide-navy-100 text-xs dark:divide-navy-800">
              {props.ergaenzungen.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid={`ergaenzung-${e.id}`}>
                  <span>
                    <span className="badge-accent mr-2">{e.artLabel}</span>
                    <strong className="tabular-nums">
                      {e.art === "ABZUG" ? "−" : "+"}
                      {euro(e.betrag)}
                    </strong>
                    {e.person ? <span className="ml-2 text-navy-500">{e.person}</span> : null}
                    {e.bemerkung ? <span className="ml-2 text-navy-400">{e.bemerkung}</span> : null}
                  </span>
                  {offen && props.darfStunden ? (
                    <button type="button" className="text-navy-400 underline hover:text-red-600" disabled={laeuft} data-testid={`ergaenzung-weg-${e.id}`} onClick={() => ruf(() => deleteErgaenzungAction(e.id))}>
                      entfernen
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {offen && props.darfStunden ? (
            <div className="mt-2 grid gap-2 md:grid-cols-[auto_7rem_1fr_auto]">
              <select className="input text-xs" value={art} onChange={(e) => setArt(e.target.value as Art)} aria-label="Art der Ergänzung" data-testid="ergaenzung-art">
                {ARTEN.map((a) => (
                  <option key={a.wert} value={a.wert}>
                    {a.label}
                  </option>
                ))}
              </select>
              <input className="input text-xs" value={betrag} onChange={(e) => setBetrag(e.target.value)} inputMode="decimal" placeholder="Betrag €" aria-label="Betrag in Euro" data-testid="ergaenzung-betrag" />
              <input className="input text-xs" value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} maxLength={300} placeholder="Bemerkung (optional)" aria-label="Bemerkung" data-testid="ergaenzung-bemerkung" />
              <div className="flex gap-2">
                <select className="input text-xs" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person (optional)" data-testid="ergaenzung-person">
                  <option value="">ganzer Einsatz</option>
                  {props.mitarbeiter.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={laeuft || betrag.trim() === ""}
                  data-testid="ergaenzung-hinzu"
                  onClick={() =>
                    ruf(
                      () => addErgaenzungAction(assignmentId, { art, betrag: betrag.replace(",", "."), employeeId: person, bemerkung }),
                      () => {
                        setBetrag("");
                        setBemerkung("");
                        setPerson("");
                      }
                    )
                  }
                >
                  Aufnehmen
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 2 Angaben zur Abrechnung ───────────────────────────────────────── */}
      <div className="mt-4 border-t border-navy-100 pt-4 dark:border-navy-800">
        <p className="text-sm font-medium">2. Angaben zur Abrechnung</p>
        {stand === "OFFEN" ? (
          <p className="mt-1 text-xs text-navy-400" data-testid="angaben-wartet">
            Wird möglich, sobald die Stunden freigegeben sind (Schritt 1).
          </p>
        ) : angabenFelder ? (
          <>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-navy-500">
                Angebotsnummer
                <input className="input mt-1" value={angebotsnummer} onChange={(e) => setAngebotsnummer(e.target.value)} maxLength={60} placeholder="z. B. AN-2026-118" data-testid="angebotsnummer" />
              </label>
              <label className="text-xs text-navy-500">
                Konditionen
                <input className="input mt-1" value={konditionen} onChange={(e) => setKonditionen(e.target.value)} maxLength={2000} placeholder="z. B. 32,50 €/h, ab 10 h +25 %" data-testid="konditionen" />
              </label>
              <label className="text-xs text-navy-500">
                Beschreibung / Kommentar
                <input className="input mt-1" value={hinweis} onChange={(e) => setHinweis(e.target.value)} maxLength={2000} placeholder="Was auf die Rechnung soll" data-testid="abrechnung-hinweis" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="angaben-speichern" onClick={() => ruf(() => saveAbrechnungsangabenAction(assignmentId, angabenDaten))}>
                {laeuft ? "speichert …" : "Zwischenspeichern"}
              </button>
              {stand === "FREIGEGEBEN" ? (
                <button
                  type="button"
                  className="btn-accent text-xs"
                  disabled={laeuft || angebotsnummer.trim() === ""}
                  title={angebotsnummer.trim() === "" ? "Ohne Angebotsnummer kann die Buchhaltung nicht abrechnen." : undefined}
                  data-testid="angaben-weiter"
                  onClick={() => ruf(() => handOverToInvoiceAction(assignmentId, angabenDaten))}
                >
                  An die Buchhaltung
                </button>
              ) : (
                <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="angaben-zurueck" onClick={() => ruf(() => withdrawHandOverAction(assignmentId))}>
                  Zurückholen
                </button>
              )}
            </div>
            {stand === "BEREIT" ? (
              <p className="mt-2 text-xs text-navy-400" data-testid="angaben-info">
                An die Buchhaltung gemeldet von {angabenMeta.von ?? "–"}
                {angabenMeta.am ? ` am ${angabenMeta.am}` : ""}
              </p>
            ) : null}
          </>
        ) : (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-xs text-navy-400">Angebotsnummer</dt>
            <dd data-testid="angaben-angebotsnummer">{angebotsnummer || "–"}</dd>
            <dt className="text-xs text-navy-400">Konditionen</dt>
            <dd>{konditionen || "–"}</dd>
            <dt className="text-xs text-navy-400">Beschreibung</dt>
            <dd>{hinweis || "–"}</dd>
          </dl>
        )}
      </div>

      {/* ── 3 Rechnung ─────────────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-navy-100 pt-4 dark:border-navy-800">
        <p className="text-sm font-medium">3. Rechnung</p>
        {stand === "BERECHNET" ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" data-testid="abrechnung-rechnung-info">
              <span className="font-medium">Rechnung {rechnung.nummer}</span> geschrieben von {rechnung.von ?? "–"}
              {rechnung.am ? ` am ${rechnung.am}` : ""}
            </p>
            {props.darfRechnung ? (
              <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="abrechnung-rechnung-zurueck" onClick={() => ruf(() => withdrawInvoiceAction(assignmentId))}>
                Vermerk entfernen
              </button>
            ) : null}
          </div>
        ) : props.darfRechnung ? (
          <>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-navy-500">
                Rechnungsnummer
                <input className="input mt-1" value={nummer} onChange={(e) => setNummer(e.target.value)} maxLength={60} placeholder={`z. B. RE-${einsatznummer.slice(0, 4)}-001`} data-testid="rechnungsnummer" />
              </label>
              <button
                type="button"
                className="btn-accent text-xs"
                disabled={laeuft || stand !== "BEREIT" || nummer.trim() === ""}
                title={stand === "BEREIT" ? undefined : "Erst Stunden freigeben und die Angaben ergänzen."}
                data-testid="rechnung-setzen"
                onClick={() => ruf(() => setInvoiceAction(assignmentId, { rechnungsnummer: nummer }))}
              >
                {laeuft ? "speichert …" : "Rechnung geschrieben"}
              </button>
            </div>
            {stand !== "BEREIT" ? (
              <p className="mt-2 text-xs text-navy-400">
                {stand === "OFFEN" ? "Wartet auf die Freigabe der Stunden." : "Wartet auf die Angaben zur Abrechnung (Schritt 2)."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-navy-400">Die Rechnung schreibt die Buchhaltung.</p>
        )}
      </div>

      {meldung ? (
        <p className="mt-3 text-xs text-emerald-600" role="status" data-testid="abrechnung-ok">
          {meldung}
        </p>
      ) : null}
      {fehler ? (
        <p className="mt-3 text-xs text-red-600" role="alert" data-testid="abrechnung-fehler">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
