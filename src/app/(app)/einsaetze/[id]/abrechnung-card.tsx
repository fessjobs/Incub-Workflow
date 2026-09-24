"use client";

// Der Weg zur Rechnung auf einen Blick: drei Stationen, immer nur die eine
// Sache, die jetzt dran ist.
//
//   1. Angaben (Dispo/Admin)  2. Freigabe (Dispo)  3. Rechnung (Buchhaltung)
//
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseForInvoiceAction, saveAbrechnungsangabenAction, setInvoiceAction, withdrawInvoiceAction, withdrawInvoiceReleaseAction } from "../actions";

export type AbrechnungStand = "OFFEN" | "FREIGEGEBEN" | "BERECHNET";

type Props = {
  assignmentId: string;
  einsatznummer: string;
  stand: AbrechnungStand;
  angaben: { angebotsnummer: string; konditionen: string; abrechnungHinweis: string };
  pruefung: { moeglich: boolean; offen: string[]; stunden: number; personen: number };
  freigabe: { von: string | null; am: string | null };
  rechnung: { nummer: string | null; von: string | null; am: string | null };
  darfAngaben: boolean;
  darfFreigeben: boolean;
  darfRechnung: boolean;
};

const STUFEN: Array<{ stand: AbrechnungStand; titel: string; wer: string }> = [
  { stand: "OFFEN", titel: "Angaben", wer: "Dispo" },
  { stand: "FREIGEGEBEN", titel: "Freigegeben", wer: "Dispo" },
  { stand: "BERECHNET", titel: "Rechnung", wer: "Buchhaltung" },
];

const RANG: Record<AbrechnungStand, number> = { OFFEN: 0, FREIGEGEBEN: 1, BERECHNET: 2 };

function Meldung({ text, art }: { text: string | null; art: "ok" | "fehler" }) {
  if (!text) return null;
  return (
    <p className={`mt-2 text-xs ${art === "ok" ? "text-emerald-600" : "text-red-600"}`} role={art === "fehler" ? "alert" : "status"} data-testid={`abrechnung-${art}`}>
      {text}
    </p>
  );
}

export function AbrechnungCard(props: Props) {
  const { assignmentId, einsatznummer, stand, pruefung, freigabe, rechnung } = props;
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Angaben lokal halten, damit Tippen nicht bei jedem Refresh verloren geht
  const [angebotsnummer, setAngebotsnummer] = useState(props.angaben.angebotsnummer);
  const [konditionen, setKonditionen] = useState(props.angaben.konditionen);
  const [hinweis, setHinweis] = useState(props.angaben.abrechnungHinweis);
  const [nummer, setNummer] = useState(rechnung.nummer ?? "");

  const angabenOffen = stand !== "BERECHNET" && props.darfAngaben;
  const erledigt = RANG[stand];

  function ruf(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    starte(async () => {
      setMeldung(null);
      setFehler(null);
      const res = await fn();
      if (!res.ok) return setFehler(res.error);
      setMeldung(res.message ?? "Gespeichert.");
      router.refresh();
    });
  }

  return (
    <div className="card p-5" data-testid="abrechnung-karte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Abrechnung</p>
          <p className="mt-1 text-sm text-navy-400">
            {pruefung.stunden.toFixed(2).replace(".", ",")} h freigegebene Stunden · {pruefung.personen} Person(en)
          </p>
        </div>
        <span
          className={
            stand === "BERECHNET"
              ? "badge bg-navy-900 text-white dark:bg-white dark:text-navy-900"
              : stand === "FREIGEGEBEN"
                ? "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          }
          data-testid="abrechnung-stand"
        >
          {stand === "BERECHNET" ? "Rechnung geschrieben" : stand === "FREIGEGEBEN" ? "Freigegeben" : "Offen"}
        </span>
      </div>

      {/* Stationen als Leiste – wo stehen wir, wer ist dran */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {STUFEN.map((s, i) => {
          const fertig = i <= erledigt && !(i === 0 && stand === "OFFEN");
          const dran = i === erledigt || (i === 0 && stand === "OFFEN");
          return (
            <li
              key={s.stand}
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

      {/* 1 – Angaben für die Buchhaltung */}
      <div className="mt-5 border-t border-navy-100 pt-4 dark:border-navy-800">
        <p className="text-sm font-medium">Angaben für die Buchhaltung</p>
        {angabenOffen ? (
          <>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-navy-500">
                Angebotsnummer
                <input className="input mt-1" value={angebotsnummer} onChange={(e) => setAngebotsnummer(e.target.value)} maxLength={60} placeholder="z. B. AN-2026-118" data-testid="angebotsnummer" />
              </label>
              <label className="text-xs text-navy-500">
                Konditionen
                <input className="input mt-1" value={konditionen} onChange={(e) => setKonditionen(e.target.value)} maxLength={2000} placeholder="z. B. 32,50 €/h, Ü ab 10 h +25 %" data-testid="konditionen" />
              </label>
              <label className="text-xs text-navy-500">
                Beschreibung / Kommentar
                <input className="input mt-1" value={hinweis} onChange={(e) => setHinweis(e.target.value)} maxLength={2000} placeholder="Was auf die Rechnung soll" data-testid="abrechnung-hinweis" />
              </label>
            </div>
            <button
              type="button"
              className="btn-secondary mt-3 text-xs"
              disabled={laeuft}
              data-testid="angaben-speichern"
              onClick={() => ruf(() => saveAbrechnungsangabenAction(assignmentId, { angebotsnummer, konditionen, abrechnungHinweis: hinweis }))}
            >
              {laeuft ? "speichert …" : "Angaben speichern"}
            </button>
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

      {/* 2 – Freigabe durch die Dispo */}
      <div className="mt-4 border-t border-navy-100 pt-4 dark:border-navy-800">
        {stand === "OFFEN" ? (
          <>
            <p className="text-sm font-medium">Zur Abrechnung freigeben</p>
            {pruefung.offen.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-navy-500" data-testid="abrechnung-offene-punkte">
                {pruefung.offen.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-navy-400">Alle Zeiten sind freigegeben – der Einsatz kann an die Buchhaltung.</p>
            )}
            {props.darfFreigeben ? (
              <button
                type="button"
                className="btn-accent mt-3 text-xs"
                disabled={laeuft || !pruefung.moeglich}
                title={pruefung.moeglich ? undefined : pruefung.offen[0]}
                data-testid="abrechnung-freigeben"
                onClick={() => ruf(() => releaseForInvoiceAction(assignmentId))}
              >
                {laeuft ? "gibt frei …" : "Stundennachweis freigeben"}
              </button>
            ) : (
              <p className="mt-2 text-xs text-navy-400">Die Freigabe erteilt die Dispo.</p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" data-testid="abrechnung-freigabe-info">
              <span className="font-medium">Freigegeben</span> von {freigabe.von ?? "–"}
              {freigabe.am ? ` am ${freigabe.am}` : ""}
            </p>
            {props.darfFreigeben && stand === "FREIGEGEBEN" ? (
              <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="abrechnung-freigabe-zurueck" onClick={() => ruf(() => withdrawInvoiceReleaseAction(assignmentId))}>
                Freigabe zurücknehmen
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* 3 – Rechnung durch die Buchhaltung */}
      <div className="mt-4 border-t border-navy-100 pt-4 dark:border-navy-800">
        {stand === "BERECHNET" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <p className="text-sm font-medium">Rechnung geschrieben</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-navy-500">
                Rechnungsnummer
                <input className="input mt-1" value={nummer} onChange={(e) => setNummer(e.target.value)} maxLength={60} placeholder={`z. B. RE-${einsatznummer.slice(0, 4)}-001`} data-testid="rechnungsnummer" />
              </label>
              <button
                type="button"
                className="btn-accent text-xs"
                disabled={laeuft || stand !== "FREIGEGEBEN" || nummer.trim() === ""}
                title={stand === "FREIGEGEBEN" ? undefined : "Erst muss die Dispo freigeben."}
                data-testid="rechnung-setzen"
                onClick={() => ruf(() => setInvoiceAction(assignmentId, { rechnungsnummer: nummer }))}
              >
                {laeuft ? "speichert …" : "Rechnung geschrieben"}
              </button>
            </div>
            {stand !== "FREIGEGEBEN" ? <p className="mt-2 text-xs text-navy-400">Wird möglich, sobald die Dispo den Stundennachweis freigegeben hat.</p> : null}
          </>
        ) : (
          <p className="text-sm text-navy-400">Die Rechnung schreibt die Buchhaltung.</p>
        )}
      </div>

      <Meldung text={meldung} art="ok" />
      <Meldung text={fehler} art="fehler" />
    </div>
  );
}
