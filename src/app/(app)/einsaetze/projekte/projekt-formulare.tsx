"use client";

// Projekte: anlegen, benennen, Einsätze aufnehmen und herauslösen, Angaben
// und Rechnung einmal für die ganze Mappe.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addToProjektAction,
  createProjektAction,
  handOverProjektAction,
  removeFromProjektAction,
  renameProjektAction,
  saveProjektAngabenAction,
  setProjektRechnungAction,
  withdrawProjektHandOverAction,
  withdrawProjektRechnungAction,
} from "../actions";

export type FreierEinsatz = { id: string; label: string; kunde: string };

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

function useRuf() {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

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
  return { laeuft, meldung, fehler, ruf, router };
}

function Meldungen({ meldung, fehler }: { meldung: string | null; fehler: string | null }) {
  return (
    <>
      {meldung ? (
        <p className="mt-2 text-xs text-emerald-600" role="status" data-testid="projekt-ok">
          {meldung}
        </p>
      ) : null}
      {fehler ? (
        <p className="mt-2 text-xs text-red-600" role="alert" data-testid="projekt-fehler">
          {fehler}
        </p>
      ) : null}
    </>
  );
}

// ─── Neues Projekt aus freien Einsätzen ─────────────────────────────────────

export function NeuesProjekt({ kandidaten }: { kandidaten: FreierEinsatz[] }) {
  const { laeuft, meldung, fehler, ruf, router } = useRuf();
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);

  if (!offen) {
    return (
      <button type="button" className="btn-accent" onClick={() => setOffen(true)} data-testid="projekt-neu">
        + Einsätze zu einem Projekt zusammenfassen
      </button>
    );
  }

  return (
    <div className="card p-5" data-testid="projekt-neu-formular">
      <p className="eyebrow">Neues Projekt</p>
      <p className="mt-1 text-sm text-navy-500">Einsätze auswählen, die zusammen auf eine Rechnung sollen. Die Stunden bleiben je Einsatz.</p>
      <label className="mt-3 block text-xs text-navy-500">
        Name des Projekts
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="z. B. Tour Herbst 2026" data-testid="projekt-name" />
      </label>
      {kandidaten.length === 0 ? (
        <p className="mt-3 text-sm text-navy-400">Gerade gibt es keine freien Einsätze – alle gehören schon zu einem Projekt oder sind berechnet.</p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-auto text-sm">
          {kandidaten.map((k) => (
            <li key={k.id}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={gewaehlt.includes(k.id)}
                  onChange={(e) => setGewaehlt((v) => (e.target.checked ? [...v, k.id] : v.filter((x) => x !== k.id)))}
                  data-testid={`projekt-kandidat-${k.id}`}
                />
                <span>
                  {k.label}
                  <span className="block text-xs text-navy-400">{k.kunde}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-xs"
          disabled={laeuft || name.trim().length < 2 || gewaehlt.length === 0}
          data-testid="projekt-anlegen"
          onClick={() =>
            ruf(async () => {
              const res = await createProjektAction({ name, assignmentIds: gewaehlt });
              if (res.ok) router.push(`/einsaetze/projekte/${res.id}`);
              return res;
            })
          }
        >
          {laeuft ? "legt an …" : `Projekt anlegen (${gewaehlt.length})`}
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => setOffen(false)}>
          Abbrechen
        </button>
      </div>
      <Meldungen meldung={meldung} fehler={fehler} />
    </div>
  );
}

// ─── Kopf des Projekts: umbenennen ──────────────────────────────────────────

export function ProjektName({ projektId, name }: { projektId: string; name: string }) {
  const { laeuft, meldung, fehler, ruf } = useRuf();
  const [offen, setOffen] = useState(false);
  const [wert, setWert] = useState(name);

  if (!offen) {
    return (
      <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setOffen(true)} data-testid="projekt-umbenennen">
        umbenennen
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input className="input text-sm" value={wert} onChange={(e) => setWert(e.target.value)} maxLength={120} data-testid="projekt-name-feld" />
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={laeuft || wert.trim().length < 2}
        data-testid="projekt-name-speichern"
        onClick={() => ruf(() => renameProjektAction(projektId, { name: wert }), () => setOffen(false))}
      >
        Speichern
      </button>
      <Meldungen meldung={meldung} fehler={fehler} />
    </span>
  );
}

// ─── Einsätze der Mappe ─────────────────────────────────────────────────────

export function EinsatzAufnehmen({ projektId, kandidaten }: { projektId: string; kandidaten: FreierEinsatz[] }) {
  const { laeuft, meldung, fehler, ruf } = useRuf();
  const [wahl, setWahl] = useState("");

  if (kandidaten.length === 0) return <p className="text-xs text-navy-400">Gerade gibt es keine freien Einsätze zum Aufnehmen.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input text-xs" value={wahl} onChange={(e) => setWahl(e.target.value)} aria-label="Einsatz aufnehmen" data-testid="projekt-aufnehmen-wahl">
        <option value="">Einsatz auswählen …</option>
        {kandidaten.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label} · {k.kunde}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={laeuft || wahl === ""}
        data-testid="projekt-aufnehmen"
        onClick={() => ruf(() => addToProjektAction(projektId, wahl), () => setWahl(""))}
      >
        Aufnehmen
      </button>
      <Meldungen meldung={meldung} fehler={fehler} />
    </div>
  );
}

export function EinsatzHerausloesen({ assignmentId, einsatznummer }: { assignmentId: string; einsatznummer: string }) {
  const { laeuft, ruf } = useRuf();
  return (
    <button
      type="button"
      className="text-xs text-navy-400 underline hover:text-red-600 disabled:opacity-50"
      disabled={laeuft}
      title={`Einsatz ${einsatznummer} aus dem Projekt lösen`}
      data-testid={`projekt-herausloesen-${einsatznummer}`}
      onClick={() => ruf(() => removeFromProjektAction(assignmentId))}
    >
      herauslösen
    </button>
  );
}

// ─── Angaben und Rechnung für die ganze Mappe ───────────────────────────────

export function ProjektAbrechnung({
  projektId,
  stand,
  angaben,
  angabenMeta,
  rechnung,
  zahlen,
  darfRechnung,
}: {
  projektId: string;
  stand: "OFFEN" | "FREIGEGEBEN" | "BEREIT" | "BERECHNET";
  angaben: { angebotsnummer: string; konditionen: string; abrechnungHinweis: string };
  angabenMeta: { von: string | null; am: string | null };
  rechnung: { nummer: string | null; von: string | null; am: string | null };
  zahlen: { einsaetze: number; stunden: number; ergaenzungen: number; offeneEinsaetze: number };
  darfRechnung: boolean;
}) {
  const { laeuft, meldung, fehler, ruf } = useRuf();
  const [angebotsnummer, setAngebotsnummer] = useState(angaben.angebotsnummer);
  const [konditionen, setKonditionen] = useState(angaben.konditionen);
  const [hinweis, setHinweis] = useState(angaben.abrechnungHinweis);
  const [nummer, setNummer] = useState(rechnung.nummer ?? "");
  const daten = { angebotsnummer, konditionen, abrechnungHinweis: hinweis };
  const offen = stand !== "BERECHNET";

  if (!darfRechnung) {
    return (
      <div className="card p-5">
        <p className="eyebrow">Abrechnung</p>
        <p className="mt-2 text-sm text-navy-400">Angaben und Rechnung pflegen Admin und Buchhaltung.</p>
      </div>
    );
  }

  return (
    <div className="card p-5" data-testid="projekt-abrechnung">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Abrechnung des Projekts</p>
          <p className="mt-1 text-sm text-navy-400">
            {zahlen.einsaetze} Einsatz/Einsätze · {zahlen.stunden.toFixed(2).replace(".", ",")} h freigegeben
            {zahlen.ergaenzungen !== 0 ? ` · Ergänzungen ${euro(zahlen.ergaenzungen)}` : ""}
          </p>
        </div>
      </div>

      {stand === "OFFEN" ? (
        <p className="mt-3 text-sm text-amber-600" data-testid="projekt-wartet">
          {zahlen.einsaetze === 0
            ? "Noch keine Einsätze im Projekt."
            : `${zahlen.offeneEinsaetze} Einsatz/Einsätze haben noch offene Stunden – die Buchhaltung bestätigt sie zuerst am jeweiligen Einsatz.`}
        </p>
      ) : null}

      {offen ? (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-navy-500">
              Angebotsnummer
              <input className="input mt-1" value={angebotsnummer} onChange={(e) => setAngebotsnummer(e.target.value)} maxLength={60} placeholder="z. B. AN-2026-118" data-testid="projekt-angebotsnummer" />
            </label>
            <label className="text-xs text-navy-500">
              Konditionen
              <input className="input mt-1" value={konditionen} onChange={(e) => setKonditionen(e.target.value)} maxLength={2000} placeholder="z. B. 32,50 €/h" data-testid="projekt-konditionen" />
            </label>
            <label className="text-xs text-navy-500">
              Beschreibung / Kommentar
              <input className="input mt-1" value={hinweis} onChange={(e) => setHinweis(e.target.value)} maxLength={2000} placeholder="Was auf die Rechnung soll" data-testid="projekt-hinweis" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="projekt-angaben-speichern" onClick={() => ruf(() => saveProjektAngabenAction(projektId, daten))}>
              Zwischenspeichern
            </button>
            {stand === "BEREIT" ? (
              <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="projekt-angaben-zurueck" onClick={() => ruf(() => withdrawProjektHandOverAction(projektId))}>
                Zurückholen
              </button>
            ) : (
              <button
                type="button"
                className="btn-accent text-xs"
                disabled={laeuft || stand === "OFFEN" || angebotsnummer.trim() === ""}
                title={stand === "OFFEN" ? "Erst müssen alle Einsätze freigegeben sein." : angebotsnummer.trim() === "" ? "Ohne Angebotsnummer geht es nicht." : undefined}
                data-testid="projekt-angaben-weiter"
                onClick={() => ruf(() => handOverProjektAction(projektId, daten))}
              >
                An die Buchhaltung
              </button>
            )}
          </div>
          {stand === "BEREIT" ? (
            <p className="mt-2 text-xs text-navy-400" data-testid="projekt-angaben-info">
              Gemeldet von {angabenMeta.von ?? "–"}
              {angabenMeta.am ? ` am ${angabenMeta.am}` : ""}
            </p>
          ) : null}

          <div className="mt-4 border-t border-navy-100 pt-4 dark:border-navy-800">
            <p className="text-sm font-medium">Eine Rechnung für das ganze Projekt</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-navy-500">
                Rechnungsnummer
                <input className="input mt-1" value={nummer} onChange={(e) => setNummer(e.target.value)} maxLength={60} placeholder="z. B. RE-2026-044" data-testid="projekt-rechnungsnummer" />
              </label>
              <button
                type="button"
                className="btn-accent text-xs"
                disabled={laeuft || stand !== "BEREIT" || nummer.trim() === ""}
                title={stand === "BEREIT" ? undefined : "Erst die Angaben an die Buchhaltung geben."}
                data-testid="projekt-rechnung-setzen"
                onClick={() => ruf(() => setProjektRechnungAction(projektId, { rechnungsnummer: nummer }))}
              >
                Rechnung geschrieben
              </button>
            </div>
            {stand !== "BEREIT" ? <p className="mt-2 text-xs text-navy-400">Wird möglich, sobald die Angaben vollständig sind.</p> : null}
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" data-testid="projekt-rechnung-info">
            <span className="font-medium">Rechnung {rechnung.nummer}</span> geschrieben von {rechnung.von ?? "–"}
            {rechnung.am ? ` am ${rechnung.am}` : ""} · gilt für {zahlen.einsaetze} Einsatz/Einsätze
          </p>
          <button type="button" className="btn-secondary text-xs" disabled={laeuft} data-testid="projekt-rechnung-zurueck" onClick={() => ruf(() => withdrawProjektRechnungAction(projektId))}>
            Vermerk entfernen
          </button>
        </div>
      )}
      <Meldungen meldung={meldung} fehler={fehler} />
    </div>
  );
}
