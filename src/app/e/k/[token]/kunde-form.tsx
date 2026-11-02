"use client";

// Kunde: sieht am Monatsende die Zettel aller Personen, bestätigt sie mit einer Unterschrift oder gibt einen Zettel mit
// Hinweis an die Person zurück.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KundenAnsicht } from "@/lib/einsatz/service/monatszettel";
import { STAND_TEXT, datumAnzeige, eintragMinuten, formatStunden, sortiert, stundenDezimal, type MonatsEintrag } from "@/lib/einsatz/monatszettel";
import { SignaturePad, type SignaturePadHandle } from "../../signature-pad";
import "../../monat.css";

function Wordmark() {
  return (
    <p className="ez-wordmark">
      fess<span>.</span>jobs
    </p>
  );
}

function Angaben({ e }: { e: MonatsEintrag }) {
  const teile = [
    e.taetigkeit,
    e.fahrten.length > 0 ? `Fahrt (${e.pkwArt === "FIRMA" ? "Firmenfahrzeug" : "Privat-PKW"}): ${e.fahrten.map((f) => `${f.von} – ${f.nach}${f.km ? ` (${String(f.km).replace(".", ",")} km)` : ""}`).join("; ")}` : "",
    e.spesen ? `Spesen ${e.spesen.toFixed(2).replace(".", ",")} €` : "",
    e.sonderabsprache ? `Absprache: ${e.sonderabsprache}` : "",
    e.getan ? `Getan: ${e.getan}` : "",
    e.notiz,
  ].filter(Boolean);
  return <>{teile.length > 0 ? teile.join(" · ") : "–"}</>;
}

export function KundeForm({ token }: { token: string }) {
  const [view, setView] = useState<KundenAnsicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [rueck, setRueck] = useState<{ id: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [haken, setHaken] = useState(false);
  const [leer, setLeer] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState<number | null>(null);
  const sig = useRef<SignaturePadHandle>(null);

  const lade = useCallback(async () => {
    try {
      const r = await fetch(`/api/e/k/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setFehler(j.error ?? "Link ungültig.");
      else setView(j);
    } catch {
      setFehler("Keine Verbindung. Bitte später noch einmal versuchen.");
    } finally {
      setLaden(false);
    }
  }, [token]);
  useEffect(() => {
    void lade();
  }, [lade]);

  const senden = async (body: object): Promise<{ ok: boolean; bestaetigt?: number }> => {
    setSendet(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/e/k/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        setFehler(j.error ?? "Das hat nicht geklappt.");
        return { ok: false };
      }
      setView(j.view);
      return { ok: true, bestaetigt: j.bestaetigt };
    } catch {
      setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
      return { ok: false };
    } finally {
      setSendet(false);
    }
  };

  if (laden) return <div className="mz-breit"><Wordmark /><p className="ez-muted" style={{ marginTop: "1rem" }}>Wird geladen …</p></div>;
  if (!view) {
    return (
      <div className="mz-breit">
        <Wordmark />
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <h1 className="ez-h1">Link nicht gefunden</h1>
          <p className="ez-muted" style={{ marginTop: "0.4rem" }}>{fehler ?? "Dieser Link ist ungültig oder abgelaufen."}</p>
        </div>
      </div>
    );
  }

  const bereit = view.zettel.filter((z) => z.stand === "wartet_kunde");
  const gesamt = bereit.reduce((s, z) => s + z.summe.stunden, 0);

  return (
    <div className="mz-breit" data-testid="mz-kunde">
      <Wordmark />
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow">Stundenbestätigung</p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{view.monatLabel}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem" }}>{view.kunde}{view.kontakt ? ` · ${view.kontakt}` : ""}</p>
        <p style={{ marginTop: "0.7rem", fontSize: "0.92rem" }}>
          Bitte prüfen Sie die Stunden der Mitarbeiter von FESS im {view.monatLabel}. Mit Ihrer Unterschrift bestätigen Sie die Angaben der Personen, die schon unterschrieben haben. Stimmt bei jemandem etwas nicht, geben Sie den Zettel mit einem Hinweis zurück.
        </p>
      </div>
      {fehler ? <div className="ez-error" style={{ marginTop: "0.8rem" }} role="alert" data-testid="mk-fehler">{fehler}</div> : null}
      {view.abgelaufen ? <div className="ez-info" style={{ marginTop: "0.8rem" }}>Dieser Link ist abgelaufen. Bitte melden Sie sich bei FESS.</div> : null}

      {view.zettel.map((z) => {
        const aufgeklappt = offen === z.id;
        const sichtbar = z.stand === "wartet_kunde" || z.stand === "fertig";
        return (
          <div key={z.id} className="ez-card" style={{ marginTop: "0.9rem" }} data-testid={`mk-zettel-${z.id}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <div>
                <strong>{z.name}</strong>
                <div style={{ marginTop: "0.3rem" }}>
                  <span className={`ez-pill ${z.stand === "fertig" ? "ez-pill-green" : z.stand === "wartet_kunde" ? "ez-pill-orange" : "ez-pill-grey"}`} data-testid={`mk-stand-${z.id}`}>{STAND_TEXT[z.stand]}</span>
                </div>
              </div>
              {sichtbar ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatStunden(z.summe.stunden)} h</strong>
                  <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => setOffen(aufgeklappt ? null : z.id)} data-testid={`mk-ansehen-${z.id}`}>{aufgeklappt ? "Zuklappen" : "Ansehen"}</button>
                </div>
              ) : null}
            </div>
            {!sichtbar ? <p className="ez-muted" style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>Noch nicht abgeschlossen – der Zettel erscheint hier zur Bestätigung, sobald die Person unterschrieben hat.</p> : null}
            {z.stand === "zurueck" && z.kundeHinweis ? <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Zurückgegeben mit dem Hinweis: „{z.kundeHinweis}“</p> : null}
            {aufgeklappt ? (
              <div style={{ marginTop: "0.8rem" }} data-testid={`mk-detail-${z.id}`}>
                <div style={{ overflowX: "auto" }}>
                  <table className="ez-tabelle">
                    <thead>
                      <tr><th>Datum</th><th>Zeit</th><th>Pause</th><th style={{ textAlign: "right" }}>Stunden</th><th>Angaben</th></tr>
                    </thead>
                    <tbody>
                      {sortiert(z.tage).map((e) => (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{datumAnzeige(e.datum)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{e.start}–{e.ende}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{e.pauseMin} min</td>
                          <td style={{ textAlign: "right" }}>{formatStunden(stundenDezimal(eintragMinuten(e)))}</td>
                          <td><Angaben e={e} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={3}><strong>Summe</strong></td><td style={{ textAlign: "right" }}><strong>{formatStunden(z.summe.stunden)}</strong></td><td className="ez-muted">{z.summe.tage} Tage</td></tr>
                    </tfoot>
                  </table>
                </div>
                {z.personUnterschrift ? (
                  <div style={{ marginTop: "0.6rem" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={z.personUnterschrift} alt={`Unterschrift ${z.name}`} style={{ maxHeight: "5rem", maxWidth: "100%", borderBottom: "1.5px solid var(--ez-ink)" }} />
                    <div className="ez-muted" style={{ fontSize: "0.8rem" }}>{z.name}{z.personSignedAt ? ` · ${new Date(z.personSignedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}` : ""}</div>
                  </div>
                ) : null}
                {z.stand === "wartet_kunde" ? (
                  rueck?.id === z.id ? (
                    <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
                      <label className="ez-label" htmlFor={`mk-hinweis-${z.id}`}>Was stimmt nicht?</label>
                      <textarea id={`mk-hinweis-${z.id}`} className="ez-textarea" rows={2} value={rueck.text} onChange={(e) => setRueck({ id: z.id, text: e.target.value })} placeholder="z. B. Am 06.10. war der Feierabend schon um 14:30." data-testid={`mk-hinweis-${z.id}`} />
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button type="button" className="ez-btn ez-btn-small" disabled={rueck.text.trim().length < 3 || sendet} onClick={async () => { const r = await senden({ aktion: "zurueck", sheetId: z.id, hinweis: rueck.text }); if (r.ok) setRueck(null); }} data-testid={`mk-zurueck-senden-${z.id}`}>Zurückgeben</button>
                        <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => setRueck(null)}>Abbrechen</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: "0.8rem" }}>
                      <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => setRueck({ id: z.id, text: "" })} data-testid={`mk-zurueckgeben-${z.id}`}>Zurückgeben mit Hinweis</button>
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {view.zettel.length === 0 ? <div className="ez-info" style={{ marginTop: "0.9rem" }}>Für diesen Monat gibt es noch keine Zettel.</div> : null}

      {fertig !== null ? (
        <div className="ez-info" style={{ marginTop: "1rem" }} data-testid="mk-fertig"><strong>Danke!</strong> Die Stunden von {fertig === 1 ? "einer Person" : `${fertig} Personen`} sind bestätigt. FESS hat Ihre Unterschrift erhalten.</div>
      ) : (
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <p className="ez-eyebrow">Bestätigung</p>
          {bereit.length === 0 ? (
            <p className="ez-muted" style={{ marginTop: "0.4rem" }}>Es wartet kein Zettel auf Ihre Unterschrift.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.5rem" }}>
              <p style={{ fontSize: "0.92rem" }}><strong>{bereit.length === 1 ? "1 Zettel wartet" : `${bereit.length} Zettel warten`}</strong> auf Ihre Unterschrift ({formatStunden(Math.round(gesamt * 100) / 100)} Stunden insgesamt).</p>
              <div>
                <label className="ez-label" htmlFor="mk-name">Ihr Name</label>
                <input id="mk-name" className="ez-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="mk-name" />
              </div>
              <label className={`ez-check ${haken ? "is-on" : ""}`}>
                <input type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)} data-testid="mk-haken" />
                <span>Die oben gezeigten Stunden sind richtig.</span>
              </label>
              <div>
                <SignaturePad ref={sig} onChange={setLeer} label="Ihre Unterschrift" testId="mk-signatur" />
                <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" style={{ marginTop: "0.4rem" }} onClick={() => sig.current?.clear()}>Neu unterschreiben</button>
              </div>
              <button
                type="button"
                className="ez-btn"
                disabled={!haken || leer || name.trim().length < 2 || sendet}
                onClick={async () => {
                  const bild = sig.current?.toDataUrl();
                  if (!bild) return;
                  const r = await senden({ aktion: "bestaetigen", kundeName: name, unterschrift: bild });
                  if (r.ok) setFertig(r.bestaetigt ?? 0);
                }}
                data-testid="mk-unterschreiben"
              >
                {sendet ? "Wird gesendet …" : "Stunden bestätigen und unterschreiben"}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="ez-muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>Dieser Link gilt nur für {view.kunde} und {view.monatLabel}.</p>
    </div>
  );
}
