"use client";

// Monatszettel am Handy: Tage antippen, Zeiten, Fahrten und Besonderheiten eintragen (nur Beginn und Ende sind Pflicht),
// am Monatsende prüfen und unterschreiben. Bis der Kunde bestätigt hat, lässt sich der Zettel wieder öffnen.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonAnsicht } from "@/lib/einsatz/service/monatszettel";
import {
  datumAnzeige, eintragMinuten, formatStunden, kalenderWochen, kannAbschliessen, neuerEintragId, pruefeEintrag, sortiert, stundenDezimal, stundenMinuten, summe, wochentagIndex, STAND_TEXT, type Fahrt, type MonatsEintrag,
} from "@/lib/einsatz/monatszettel";
import { formatKeyDE } from "@/lib/einsatz/tz";
import { SignaturePad, type SignaturePadHandle } from "../../signature-pad";
import "../../monat.css";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function leererEintrag(datum: string): MonatsEintrag {
  return { id: neuerEintragId(), datum, start: "08:00", ende: "16:30", pauseMin: 30, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "" };
}

function Wordmark() {
  return (
    <p className="ez-wordmark">
      fess<span>.</span>jobs
    </p>
  );
}

export function MonatForm({ token }: { token: string }) {
  const [view, setView] = useState<PersonAnsicht | null>(null);
  const [tage, setTage] = useState<MonatsEintrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speicher, setSpeicher] = useState<"" | "speichert" | "gespeichert">("");
  const [dialog, setDialog] = useState<{ datum: string; eintrag: MonatsEintrag | null } | null>(null);
  const [haken, setHaken] = useState(false);
  const [leer, setLeer] = useState(true);
  const [sendet, setSendet] = useState(false);
  const sig = useRef<SignaturePadHandle>(null);

  const uebernehme = useCallback((v: PersonAnsicht) => {
    setView(v);
    setTage(v.tage);
  }, []);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const r = await fetch(`/api/e/m/${token}`, { cache: "no-store" });
        const j = await r.json();
        if (abgebrochen) return;
        if (!r.ok) setFehler(j.error ?? "Link ungültig.");
        else uebernehme(j);
      } catch {
        if (!abgebrochen) setFehler("Keine Verbindung. Bitte später noch einmal versuchen.");
      } finally {
        if (!abgebrochen) setLaden(false);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [token, uebernehme]);

  const speichere = async (neu: MonatsEintrag[]): Promise<boolean> => {
    setTage(neu);
    setSpeicher("speichert");
    setFehler(null);
    try {
      const r = await fetch(`/api/e/m/${token}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tage: neu }) });
      const j = await r.json();
      if (!r.ok) {
        setFehler(j.error ?? "Speichern fehlgeschlagen.");
        setSpeicher("");
        return false;
      }
      uebernehme(j.view);
      setSpeicher("gespeichert");
      return true;
    } catch {
      setFehler("Keine Verbindung – deine letzte Änderung ist noch nicht gespeichert.");
      setSpeicher("");
      return false;
    }
  };

  const unterschreiben = async () => {
    if (!view) return;
    const bild = sig.current?.toDataUrl();
    if (!bild) return;
    setSendet(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/e/m/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tage, unterschrift: bild }) });
      const j = await r.json();
      if (!r.ok) setFehler(j.error ?? "Unterschreiben fehlgeschlagen.");
      else {
        uebernehme(j.view);
        setHaken(false);
        sig.current?.clear();
      }
    } catch {
      setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
    } finally {
      setSendet(false);
    }
  };

  const oeffnen = async () => {
    setFehler(null);
    const r = await fetch(`/api/e/m/${token}`, { method: "PATCH" });
    const j = await r.json();
    if (!r.ok) setFehler(j.error ?? "Das geht gerade nicht.");
    else uebernehme(j.view);
  };

  if (laden) return <div><Wordmark /><p className="ez-muted" style={{ marginTop: "1rem" }}>Wird geladen …</p></div>;
  if (!view) {
    return (
      <div>
        <Wordmark />
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <h1 className="ez-h1">Link nicht gefunden</h1>
          <p className="ez-muted" style={{ marginTop: "0.4rem" }}>{fehler ?? "Dieser Link ist ungültig oder abgelaufen."} Bitte melde dich bei der Dispo.</p>
        </div>
      </div>
    );
  }

  const gesperrt = view.personSigniert || view.gesperrt !== null;
  const su = summe(tage);
  const abschluss = kannAbschliessen(view.monat, tage);

  return (
    <div data-testid="mz-person">
      <Wordmark />
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow">Monatsstundenzettel</p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{view.monatLabel}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem" }}>{view.kunde}</p>
        <div style={{ marginTop: "0.7rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <span className="ez-pill ez-pill-orange">{view.person.vorname} {view.person.nachname}</span>
          <span className="ez-pill ez-pill-grey" data-testid="mz-status">{STAND_TEXT[view.stand]}</span>
          {speicher === "gespeichert" ? <span className="ez-pill ez-pill-green" data-testid="mz-gespeichert">✓ Gespeichert</span> : speicher === "speichert" ? <span className="ez-pill ez-pill-grey">Speichert …</span> : null}
        </div>
      </div>

      {fehler ? <div className="ez-error" style={{ marginTop: "0.8rem" }} role="alert" data-testid="mz-fehler-seite">{fehler}</div> : null}

      {view.kundeHinweis && !view.personSigniert ? (
        <div className="ez-error" style={{ marginTop: "0.8rem" }}>
          <strong>Der Kunde hat den Zettel zurückgegeben.</strong> <span data-testid="mz-rueckgabe-hinweis">„{view.kundeHinweis}“</span>
          <div style={{ marginTop: "0.3rem" }}>Bitte korrigiere die Einträge und unterschreibe noch einmal.</div>
        </div>
      ) : null}
      {view.kundeName ? (
        <div className="ez-info" style={{ marginTop: "0.8rem" }}>
          <strong>Fertig.</strong> {view.kundeName} hat den Monat bestätigt. Danke!{" "}
          {view.pdf ? <a href={`/api/e/m/${token}/pdf`} target="_blank" rel="noreferrer" data-testid="mz-pdf-link" style={{ textDecoration: "underline" }}>Monatszettel als PDF öffnen</a> : null}
        </div>
      ) : view.gesperrt ? (
        <div className="ez-info" style={{ marginTop: "0.8rem" }} data-testid="mz-gesperrt">{view.gesperrt}</div>
      ) : view.personSigniert ? (
        <div className="ez-info" style={{ marginTop: "0.8rem" }}>
          <strong>Du hast unterschrieben.</strong> Jetzt ist der Kunde dran.
          <div style={{ marginTop: "0.5rem" }}>
            <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={oeffnen} data-testid="mz-wieder-oeffnen">Doch noch etwas ändern</button>
          </div>
        </div>
      ) : (
        <div className="ez-info" style={{ marginTop: "0.8rem" }}>Tippe auf einen Tag, an dem du gearbeitet hast. Nur Beginn und Ende sind Pflicht – alles andere ist freiwillig. Tage in der Zukunft sind gesperrt.</div>
      )}

      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow" style={{ marginBottom: "0.6rem" }}>Tage eintragen</p>
        <div className="ez-kal" role="grid" aria-label={`Kalender ${view.monatLabel}`}>
          {WOCHENTAGE.map((w) => (
            <div key={w} className="ez-kal-kopf" role="columnheader">{w}</div>
          ))}
          {kalenderWochen(view.monat).flat().map((d, i) => {
            if (!d) return <div key={`leer-${i}`} />;
            const heute = tage.filter((e) => e.datum === d);
            const min = heute.reduce((m, e) => m + eintragMinuten(e), 0);
            const zukunft = d > view.heute;
            return (
              <button
                key={d}
                type="button"
                data-testid={`mz-tag-${d}`}
                className={`ez-tag ${heute.length > 0 ? "belegt" : ""} ${d === view.heute ? "heute" : ""} ${wochentagIndex(d) >= 5 ? "we" : ""}`}
                disabled={zukunft || (gesperrt && heute.length === 0)}
                title={zukunft ? "Dieser Tag liegt in der Zukunft." : datumAnzeige(d)}
                onClick={() => setDialog({ datum: d, eintrag: null })}
              >
                <span className="nr">{Number(d.slice(8))}</span>
                {heute.length > 0 ? <span className="std">{stundenMinuten(min)}</span> : null}
              </button>
            );
          })}
        </div>
        <p style={{ marginTop: "0.8rem", fontSize: "0.9rem" }} data-testid="mz-summe">
          <strong>{su.tage}</strong> {su.tage === 1 ? "Tag" : "Tage"} · <strong>{formatStunden(su.stunden)} h</strong>
          {su.km > 0 ? ` · ${String(su.km).replace(".", ",")} km Fahrt` : ""}
          {su.spesen > 0 ? ` · ${su.spesen.toFixed(2).replace(".", ",")} € Spesen` : ""}
        </p>
      </div>

      {tage.length > 0 ? (
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <p className="ez-eyebrow" style={{ marginBottom: "0.3rem" }}>Deine Einträge</p>
          {sortiert(tage).map((e) => (
            <button key={e.id} type="button" className="ez-zeile-btn" data-testid={`mz-eintrag-${e.id}`} onClick={() => setDialog({ datum: e.datum, eintrag: e })}>
              <span>
                <strong>{datumAnzeige(e.datum)}</strong>
                <span className="ez-muted" style={{ display: "block", fontSize: "0.8rem" }}>
                  {[e.taetigkeit, e.fahrten.length > 0 ? `${e.fahrten.length} Fahrt` : "", e.sonderabsprache ? "Absprache" : "", e.getan ? "Beschreibung" : ""].filter(Boolean).join(" · ") || "ohne Zusatzangaben"}
                </span>
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.start}–{e.ende} · {formatStunden(stundenDezimal(eintragMinuten(e)))} h</span>
            </button>
          ))}
        </div>
      ) : null}

      {!gesperrt ? (
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <p className="ez-eyebrow">Monat abschließen</p>
          <p style={{ marginTop: "0.4rem", fontSize: "0.92rem" }}>
            Am Monatsende prüfst du alles und unterschreibst. Danach bekommt der Kunde den Zettel zur Unterschrift. Du kannst auch zwischendurch weitermachen – die Einträge bleiben gespeichert.
          </p>
          {abschluss.gruende.length > 0 && tage.length > 0 ? (
            <div className="ez-error" style={{ marginTop: "0.7rem" }}>
              <strong>Bitte erst korrigieren:</strong>
              <ul style={{ margin: "0.3rem 0 0 1.1rem" }}>
                {abschluss.gruende.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className={`ez-check ${haken ? "is-on" : ""}`} style={{ marginTop: "0.8rem" }}>
            <input type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)} data-testid="mz-haken" />
            <span>Meine Angaben sind richtig und vollständig.</span>
          </label>
          <div style={{ marginTop: "0.8rem" }}>
            <SignaturePad ref={sig} onChange={setLeer} label="Deine Unterschrift" testId="mz-signatur" />
            <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" style={{ marginTop: "0.4rem" }} onClick={() => sig.current?.clear()}>Neu unterschreiben</button>
          </div>
          <button type="button" className="ez-btn" style={{ marginTop: "0.9rem" }} disabled={!haken || leer || !abschluss.ok || sendet} onClick={unterschreiben} data-testid="mz-abschliessen">
            {sendet ? "Wird gesendet …" : "Unterschreiben und an den Kunden weitergeben"}
          </button>
        </div>
      ) : null}

      {dialog ? (
        <TagDialog
          monat={view.monat}
          datum={dialog.datum}
          eintrag={dialog.eintrag}
          vorhanden={tage.filter((e) => e.datum === dialog.datum)}
          letzter={sortiert(tage).at(-1) ?? null}
          gesperrt={gesperrt}
          onClose={() => setDialog(null)}
          onSpeichern={async (e) => {
            const neu = tage.some((x) => x.id === e.id) ? tage.map((x) => (x.id === e.id ? e : x)) : [...tage, e];
            return speichere(neu);
          }}
          onLoeschen={async (id) => speichere(tage.filter((x) => x.id !== id))}
        />
      ) : null}
    </div>
  );
}

function TagDialog({
  monat, datum, eintrag, vorhanden, letzter, gesperrt, onClose, onSpeichern, onLoeschen,
}: {
  monat: string;
  datum: string;
  eintrag: MonatsEintrag | null;
  vorhanden: MonatsEintrag[];
  letzter: MonatsEintrag | null;
  gesperrt: boolean;
  onClose: () => void;
  onSpeichern: (e: MonatsEintrag) => Promise<boolean>;
  onLoeschen: (id: string) => Promise<boolean>;
}) {
  const [e, setE] = useState<MonatsEintrag>(() => eintrag ?? leererEintrag(datum));
  const [fehler, setFehler] = useState<string[]>([]);
  const bestehend = vorhanden.some((x) => x.id === e.id);
  const patch = (p: Partial<MonatsEintrag>) => setE((x) => ({ ...x, ...p }));
  const setzeFahrt = (i: number, p: Partial<Fahrt>) => patch({ fahrten: e.fahrten.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const zahl = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const speichern = async () => {
    const f = pruefeEintrag(e, monat);
    // Überschneidung mit einem anderen Eintrag desselben Tags
    const andere = vorhanden.filter((x) => x.id !== e.id);
    const t = kannAbschliessen(monat, [...andere, e]).gruende.filter((g) => g.includes("überschneiden"));
    const alle = [...f, ...t];
    setFehler(alle);
    if (alle.length > 0) return;
    if (await onSpeichern(e)) onClose();
  };
  const wieLetzter = () => {
    if (!letzter) return;
    setE((x) => ({ ...x, start: letzter.start, ende: letzter.ende, pauseMin: letzter.pauseMin, taetigkeit: letzter.taetigkeit, fahrten: letzter.fahrten.map((f) => ({ ...f })), pkwArt: letzter.pkwArt }));
  };

  return (
    <div className="ez-modal-hg" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="ez-modal" role="dialog" aria-modal="true" aria-label={datumAnzeige(datum)} data-testid="mz-dialog">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="ez-h1" style={{ fontSize: "1.2rem" }}>{datumAnzeige(datum)}</h2>
          <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        {vorhanden.length > 0 && !bestehend ? (
          <div className="ez-info">An diesem Tag ist schon {vorhanden.length === 1 ? "ein Eintrag" : `${vorhanden.length} Einträge`} ({vorhanden.map((v) => `${v.start}–${v.ende}`).join(", ")}). Du kannst einen weiteren Zeitraum ergänzen, zum Beispiel bei geteilter Schicht.</div>
        ) : null}
        {gesperrt ? <div className="ez-info">Der Zettel ist unterschrieben bzw. gesperrt – du kannst die Einträge nur ansehen.</div> : null}
        <fieldset disabled={gesperrt} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.8rem" }}>
          <div className="ez-row">
            <div>
              <label className="ez-label" htmlFor="mz-start">Beginn</label>
              <input id="mz-start" className="ez-input" type="time" value={e.start} onChange={(ev) => patch({ start: ev.target.value })} data-testid="mz-start" />
            </div>
            <div>
              <label className="ez-label" htmlFor="mz-ende">Ende</label>
              <input id="mz-ende" className="ez-input" type="time" value={e.ende} onChange={(ev) => patch({ ende: ev.target.value })} data-testid="mz-ende" />
            </div>
          </div>
          <div>
            <label className="ez-label" htmlFor="mz-pause">Pause (Minuten)</label>
            <input id="mz-pause" className="ez-input" type="number" min={0} step={5} inputMode="numeric" value={e.pauseMin} onChange={(ev) => patch({ pauseMin: ev.target.value === "" ? 0 : Math.max(0, Math.round(Number(ev.target.value))) })} data-testid="mz-pause" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.4rem" }}>
              {[0, 15, 30, 45, 60].map((m) => (
                <button key={m} type="button" className={`ez-pill ${e.pauseMin === m ? "ez-pill-orange" : "ez-pill-grey"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => patch({ pauseMin: m })}>{m === 0 ? "keine Pause" : `${m} min`}</button>
              ))}
              {letzter ? <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={wieLetzter} data-testid="mz-wie-letzter">Wie letzter Eintrag</button> : null}
            </div>
          </div>
          <div>
            <label className="ez-label" htmlFor="mz-taetigkeit">Tätigkeit (freiwillig)</label>
            <input id="mz-taetigkeit" className="ez-input" placeholder="z. B. Hands, Einlass, Logistik" value={e.taetigkeit} onChange={(ev) => patch({ taetigkeit: ev.target.value })} data-testid="mz-taetigkeit" />
          </div>

          <div className="ez-subcard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Fahrten</strong>
              <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => patch({ fahrten: [...e.fahrten, { von: "", nach: "", km: null }] })} data-testid="mz-fahrt-neu">+ Fahrt</button>
            </div>
            {e.fahrten.map((f, i) => (
              <div key={i} style={{ display: "grid", gap: "0.4rem", marginTop: "0.6rem" }}>
                <span className="ez-label" style={{ marginBottom: 0 }}>Fahrt {i + 1}</span>
                <input className="ez-input" placeholder="Start-Ort" aria-label={`Fahrt ${i + 1} von`} value={f.von} onChange={(ev) => setzeFahrt(i, { von: ev.target.value })} data-testid={`mz-fahrt-von-${i}`} />
                <input className="ez-input" placeholder="Ziel-Ort" aria-label={`Fahrt ${i + 1} nach`} value={f.nach} onChange={(ev) => setzeFahrt(i, { nach: ev.target.value })} data-testid={`mz-fahrt-nach-${i}`} />
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input className="ez-input" placeholder="km" inputMode="decimal" aria-label={`Fahrt ${i + 1} km`} value={f.km ?? ""} onChange={(ev) => setzeFahrt(i, { km: zahl(ev.target.value) })} data-testid={`mz-fahrt-km-${i}`} />
                  <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" aria-label={`Fahrt ${i + 1} entfernen`} onClick={() => patch({ fahrten: e.fahrten.filter((_, j) => j !== i) })}>✕</button>
                </div>
              </div>
            ))}
            {e.fahrten.length > 0 ? (
              <div style={{ marginTop: "0.7rem" }}>
                <span className="ez-label">Womit gefahren?</span>
                <div className="ez-seg">
                  <button type="button" className={e.pkwArt === "PRIVAT" ? "is-on" : ""} onClick={() => patch({ pkwArt: "PRIVAT" })} data-testid="mz-pkw-privat">Privat-PKW</button>
                  <button type="button" className={e.pkwArt === "FIRMA" ? "is-on" : ""} onClick={() => patch({ pkwArt: "FIRMA" })} data-testid="mz-pkw-firma">Firmenfahrzeug</button>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="ez-label" htmlFor="mz-spesen">Spesen in € (freiwillig)</label>
            <input id="mz-spesen" className="ez-input" inputMode="decimal" placeholder="z. B. 14,00" value={e.spesen ?? ""} onChange={(ev) => patch({ spesen: zahl(ev.target.value) })} data-testid="mz-spesen" />
          </div>
          <div>
            <label className="ez-label" htmlFor="mz-sonder">Sonderabsprache (freiwillig)</label>
            <textarea id="mz-sonder" className="ez-textarea" rows={2} placeholder="Was wurde mit dem Kunden oder FESS besonders vereinbart?" value={e.sonderabsprache} onChange={(ev) => patch({ sonderabsprache: ev.target.value })} data-testid="mz-sonderabsprache" />
          </div>
          <div>
            <label className="ez-label" htmlFor="mz-getan">Was wurde gemacht? (freiwillig)</label>
            <textarea id="mz-getan" className="ez-textarea" rows={2} value={e.getan} onChange={(ev) => patch({ getan: ev.target.value })} data-testid="mz-getan" />
          </div>
          <div>
            <label className="ez-label" htmlFor="mz-notiz">Notiz (freiwillig)</label>
            <input id="mz-notiz" className="ez-input" value={e.notiz} onChange={(ev) => patch({ notiz: ev.target.value })} data-testid="mz-notiz" />
          </div>
        </fieldset>
        {fehler.length > 0 ? (
          <div className="ez-error" role="alert" data-testid="mz-fehler">
            {fehler.map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>
        ) : null}
        <p className="ez-muted" style={{ fontSize: "0.85rem" }}>{formatKeyDE(datum)} · {formatStunden(stundenDezimal(eintragMinuten(e)))} h netto</p>
        {gesperrt ? (
          <button type="button" className="ez-btn ez-btn-ghost" onClick={onClose}>Schließen</button>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <button type="button" className="ez-btn" onClick={speichern} data-testid="mz-speichern">Speichern</button>
            {bestehend ? <button type="button" className="ez-btn ez-btn-ghost" onClick={async () => { if (await onLoeschen(e.id)) onClose(); }} data-testid="mz-loeschen">Eintrag löschen</button> : null}
            <button type="button" className="ez-btn ez-btn-ghost" onClick={onClose}>Abbrechen</button>
          </div>
        )}
      </div>
    </div>
  );
}
