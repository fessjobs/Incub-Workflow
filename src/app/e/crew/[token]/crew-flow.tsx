"use client";

// Gruppenlink: ein Link für alle. Jede Person öffnet ihn auf dem eigenen
// Handy (oder alle nacheinander auf einem Crew-Gerät), sucht sich in der
// Liste, prüft ihre Zeiten, bestätigt die Unterweisung und unterschreibt; am
// Ende unterschreibt der Kunde. Falsch geschriebene Namen und kurzfristig
// dazugekommene Leute korrigiert die Crew selbst – solange niemand
// unterschrieben hat und der Kunde nicht bestätigt hat.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SafetySection } from "@/lib/einsatz/safety";
import { SafetyAccordion } from "../../safety-accordion";
import { SignaturePad, type SignaturePadHandle } from "../../signature-pad";
import { FLUSH_EVENT, isNetworkError, queueSubmission } from "../../offline";
import { PdfKarte } from "../../pdf-share";

type Person = {
  shiftAssignmentId: string;
  name: string;
  vorname: string;
  startDatum: string;
  start: string;
  endeDatum: string;
  ende: string;
  erfasst: boolean;
  nameAenderbar: boolean;
  eintrag: { stundenGesamt: number; start: string; ende: string; pauseMinuten: number } | null;
};

// Zeiten, die eine Person für die ganze Schicht übernommen hat
type Zeitvorgabe = { start: string; ende: string; startDatum: string; endeDatum: string; pauseMinuten: number; von: string; am: string } | null;

type CrewView = {
  state: "offen" | "abgelaufen";
  // Gesetzt, wenn der Link nur für eine Schicht gilt (Name der Schicht)
  nurSchicht: string | null;
  // Der Kunde bestätigt den ganzen Nachweis – über einen Schichtlink geht das
  // nur, wenn der Einsatz aus dieser einen Schicht besteht.
  kundeMoeglich: boolean;
  einsatz: { einsatznummer: string; projekt: string; artist: string | null; kunde: string; einsatzort: string; datum: string };
  schichten: Array<{
    id: string;
    bezeichnung: string;
    taetigkeit: string;
    datumDE: string;
    vorgabe: Zeitvorgabe;
    personen: Person[];
    // Bestätigung des Kunden für genau diese Schicht
    kunde: { name: string; zeitpunkt: string } | null;
    kundeMoeglich: boolean;
    alleErfasst: boolean;
    korrigierbar: boolean;
  }>;
  kunde: { name: string; zeitpunkt: string } | null;
  korrigierbar: boolean;
  unterweisung: { version: string; abschnitte: SafetySection[]; bestaetigung: string[] };
};

// Ein Name, zwei Felder: die Konkretisierung nach AÜG benennt die Person
// namentlich, ein einteiliger Eintrag taugt dafür nicht.
function NameFelder({
  vorname,
  nachname,
  setVorname,
  setNachname,
  praefix,
}: {
  vorname: string;
  nachname: string;
  setVorname: (v: string) => void;
  setNachname: (v: string) => void;
  praefix: string;
}) {
  return (
    <div className="ez-row" style={{ marginTop: "0.5rem" }}>
      <div>
        <label className="ez-label" htmlFor={`${praefix}-vorname`}>
          Vorname
        </label>
        <input id={`${praefix}-vorname`} className="ez-input" value={vorname} onChange={(e) => setVorname(e.target.value)} autoComplete="given-name" data-testid={`${praefix}-vorname`} />
      </div>
      <div>
        <label className="ez-label" htmlFor={`${praefix}-nachname`}>
          Nachname
        </label>
        <input id={`${praefix}-nachname`} className="ez-input" value={nachname} onChange={(e) => setNachname(e.target.value)} autoComplete="family-name" data-testid={`${praefix}-nachname`} />
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <p className="ez-wordmark">
      fess<span>.</span>jobs
    </p>
  );
}

export function CrewFlow({ token }: { token: string }) {
  const [view, setView] = useState<CrewView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<{ person: Person; schicht: CrewView["schichten"][number] } | null>(null);
  // Kundenunterschrift: für den ganzen Einsatz (null) oder für eine Schicht
  const [kundeMode, setKundeMode] = useState<{ schicht: CrewView["schichten"][number] | null } | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<string | null>(null);
  // offene Korrektur: entweder ein Name (shiftAssignmentId) oder eine neue
  // Person auf einer Schicht (shiftId)
  const [nameOffen, setNameOffen] = useState<string | null>(null);
  const [personOffen, setPersonOffen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/crew/${token}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadError(j.error ?? `Fehler ${res.status}`);
        return;
      }
      setView((await res.json()) as CrewView);
    } catch {
      setLoadError("Keine Verbindung. Sobald wieder Netz da ist, bitte neu laden.");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const onFlush = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { key: string; ok: boolean; payload: { view?: CrewView; error?: string } | null };
      if (!d.key.startsWith(`crew:${token}:`)) return;
      setQueued((s) => {
        const n = new Set(s);
        n.delete(d.key);
        return n;
      });
      if (d.ok && d.payload?.view) setView(d.payload.view);
      else if (d.payload?.error) setInfo(`Nachsenden abgelehnt: ${d.payload.error}`);
    };
    window.addEventListener(FLUSH_EVENT, onFlush);
    return () => window.removeEventListener(FLUSH_EVENT, onFlush);
  }, [load, token]);

  const post = async (key: string, body: unknown): Promise<{ ok: boolean; error?: string; queued?: boolean }> => {
    try {
      const res = await fetch(`/api/e/crew/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error ?? `Fehler ${res.status}` };
      if (j.view) setView(j.view as CrewView);
      return { ok: true };
    } catch (err) {
      if (isNetworkError(err)) {
        await queueSubmission({ key, url: `/api/e/crew/${token}`, body, createdAt: new Date().toISOString() });
        setQueued((s) => new Set(s).add(key));
        return { ok: true, queued: true };
      }
      return { ok: false, error: "Senden fehlgeschlagen. Bitte erneut versuchen." };
    }
  };

  if (loadError) {
    return (
      <>
        <Wordmark />
        <div className="ez-card ez-error" style={{ marginTop: "1rem" }}>{loadError}</div>
        <button type="button" className="ez-btn ez-btn-ghost" style={{ marginTop: "0.8rem" }} onClick={() => { setLoadError(null); void load(); }}>
          Neu laden
        </button>
      </>
    );
  }
  if (!view) {
    return (
      <>
        <Wordmark />
        <div className="ez-card" style={{ marginTop: "1rem" }}>
          <p className="ez-muted">Lade Einsatz …</p>
        </div>
      </>
    );
  }

  const allPersons = view.schichten.flatMap((s) => s.personen);
  const offen = allPersons.filter((p) => !p.erfasst && !queued.has(`crew:${token}:${p.shiftAssignmentId}`));

  if (active) {
    return (
      <PersonForm
        token={token}
        person={active.person}
        schicht={active.schicht}
        view={view}
        onCancel={() => setActive(null)}
        onSubmit={async (body) => {
          const res = await post(`crew:${token}:${active.person.shiftAssignmentId}`, { shiftAssignmentId: active.person.shiftAssignmentId, eintrag: body });
          if (res.ok) {
            setActive(null);
            if (res.queued) setInfo("Offline gespeichert – wird gesendet, sobald Netz da ist.");
          }
          return res;
        }}
      />
    );
  }

  if (kundeMode) {
    return (
      <CustomerForm
        view={view}
        schicht={kundeMode.schicht}
        onCancel={() => setKundeMode(null)}
        onSubmit={async (body) => {
          const res = await post(`crew:${token}:kunde:${kundeMode.schicht?.id ?? "alle"}`, body);
          if (res.ok) {
            setKundeMode(null);
            if (res.queued) setInfo("Offline gespeichert – wird gesendet, sobald Netz da ist.");
          }
          return res;
        }}
      />
    );
  }

  return (
    <>
      <Wordmark />
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow">{view.einsatz.kunde} · Stundennachweis</p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{view.einsatz.projekt}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem" }}>
          {view.einsatz.einsatzort} · {view.einsatz.datum} · {view.einsatz.einsatznummer}
        </p>
        {view.nurSchicht ? (
          <p className="ez-muted" style={{ marginTop: "0.4rem", fontSize: "0.88rem" }} data-testid="nur-schicht">
            Dieser Link gilt nur für die Schicht <strong>{view.nurSchicht}</strong>.
          </p>
        ) : null}
        <p style={{ marginTop: "0.6rem", fontSize: "0.92rem" }}>
          Eigenen Namen antippen, Zeiten prüfen, Unterweisung bestätigen, unterschreiben. Das geht auf dem eigenen Handy oder nacheinander auf einem Gerät.
          {view.kundeMoeglich ? " Zum Schluss unterschreibt der Kunde." : ""}
        </p>
        <div style={{ marginTop: "0.6rem" }}>
          <span className={`ez-pill ${offen.length === 0 ? "ez-pill-green" : "ez-pill-orange"}`}>
            {allPersons.length - offen.length} von {allPersons.length} unterschrieben
          </span>
        </div>
      </div>

      {info ? <div className="ez-info" style={{ marginTop: "0.8rem" }}>{info}</div> : null}
      {view.state === "abgelaufen" ? <div className="ez-error" style={{ marginTop: "0.8rem" }}>Dieser Crew-Link ist abgelaufen. Bitte Dispo kontaktieren.</div> : null}

      {view.schichten.map((s) => (
        <div key={s.id} className="ez-card" style={{ marginTop: "0.8rem" }}>
          <p className="ez-eyebrow">
            {s.bezeichnung} · {s.datumDE}
            {s.taetigkeit ? ` · ${s.taetigkeit}` : ""}
          </p>
          {s.kunde ? (
            <p style={{ marginTop: "0.4rem" }} data-testid={`schicht-kunde-${s.id}`}>
              <span className="ez-pill ez-pill-green">✓ Kunde: {s.kunde.name}</span>
            </p>
          ) : null}
          {s.personen.map((p) => {
            const isQueued = queued.has(`crew:${token}:${p.shiftAssignmentId}`);
            return (
              <div key={p.shiftAssignmentId}>
                <div className="ez-list-item">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600 }}>{p.name}</p>
                    <p className="ez-muted" style={{ fontSize: "0.85rem" }}>
                      {p.erfasst && p.eintrag ? `${p.eintrag.start}–${p.eintrag.ende}, Pause ${p.eintrag.pauseMinuten} min, ${p.eintrag.stundenGesamt.toFixed(2).replace(".", ",")} h` : `Plan ${p.start}–${p.ende}`}
                      {s.korrigierbar && p.nameAenderbar && !isQueued ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="ez-linkbtn"
                            onClick={() => {
                              setPersonOffen(null);
                              setNameOffen(nameOffen === p.shiftAssignmentId ? null : p.shiftAssignmentId);
                            }}
                            data-testid={`crew-name-${p.shiftAssignmentId}`}
                          >
                            Name falsch?
                          </button>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {p.erfasst ? (
                    <span className="ez-pill ez-pill-green">✓ unterschrieben</span>
                  ) : isQueued ? (
                    <span className="ez-pill ez-pill-orange">wartet auf Netz</span>
                  ) : (
                    <button type="button" className="ez-btn ez-btn-small" disabled={view.state === "abgelaufen"} onClick={() => setActive({ person: p, schicht: s })} data-testid={`crew-sign-${p.shiftAssignmentId}`}>
                      Unterschreiben
                    </button>
                  )}
                </div>
                {nameOffen === p.shiftAssignmentId ? (
                  <NameKorrektur
                    person={p}
                    onCancel={() => setNameOffen(null)}
                    onSubmit={async (vorname, nachname) => {
                      const res = await post(`crew:${token}:name:${p.shiftAssignmentId}`, { aktion: "name-korrigieren", shiftAssignmentId: p.shiftAssignmentId, vorname, nachname });
                      if (res.ok) {
                        setNameOffen(null);
                        setInfo(res.queued ? `Ohne Netz gespeichert – „${vorname} ${nachname}“ wird übernommen, sobald wieder Empfang da ist.` : `Name geändert: ${vorname} ${nachname}`);
                      }
                      return res;
                    }}
                  />
                ) : null}
              </div>
            );
          })}
          {s.korrigierbar ? (
            personOffen === s.id ? (
              <PersonErgaenzen
                onCancel={() => setPersonOffen(null)}
                onSubmit={async (vorname, nachname) => {
                  const res = await post(`crew:${token}:person:${s.id}:${vorname}${nachname}`, { aktion: "person-ergaenzen", shiftId: s.id, vorname, nachname });
                  if (res.ok) {
                    setPersonOffen(null);
                    setInfo(res.queued ? `Ohne Netz gespeichert – ${vorname} ${nachname} wird eingetragen, sobald wieder Empfang da ist.` : `${vorname} ${nachname} steht jetzt auf „${s.bezeichnung}“.`);
                  }
                  return res;
                }}
              />
            ) : (
              <button
                type="button"
                className="ez-btn ez-btn-ghost ez-btn-small"
                style={{ marginTop: "0.6rem" }}
                onClick={() => {
                  setNameOffen(null);
                  setPersonOffen(s.id);
                }}
                data-testid={`crew-add-${s.id}`}
              >
                + Person ergänzen
              </button>
            )
          ) : null}

          <ZeitenFuerAlle
            schicht={s}
            token={token}
            gesperrt={view.state === "abgelaufen" || view.kunde !== null || s.kunde !== null}
            onUebernehmen={async (shiftAssignmentId) => {
              const res = await post(`crew:${token}:zeiten:${s.id}`, { aktion: "zeiten-fuer-alle", shiftAssignmentId });
              if (res.ok && !res.queued) setInfo(`Zeiten für „${s.bezeichnung}“ übernommen – bei den Übrigen sind sie vorausgefüllt.`);
              return res;
            }}
          />

          {/* Der Kunde zeichnet diese Schicht ab – danach entsteht ihr eigener
              Stundennachweis, den die Crew hier gleich ansehen kann. */}
          {s.kunde ? (
            <PdfKarte url={`/api/e/crew/${token}/pdf?shift=${s.id}`} />
          ) : s.kundeMoeglich ? (
            <button
              type="button"
              className="ez-btn ez-btn-ghost ez-btn-small"
              style={{ marginTop: "0.6rem" }}
              disabled={view.state === "abgelaufen"}
              onClick={() => setKundeMode({ schicht: s })}
              data-testid={`schicht-kunde-unterschreibt-${s.id}`}
            >
              Kunde unterschreibt „{s.bezeichnung}“
            </button>
          ) : null}
        </div>
      ))}

      <div className="ez-card" style={{ marginTop: "0.8rem" }}>
        <p className="ez-eyebrow">Kundenbestätigung{view.schichten.length > 1 ? " für den ganzen Einsatz" : ""}</p>
        {!view.kundeMoeglich && !view.kunde ? (
          <p className="ez-muted" style={{ marginTop: "0.4rem", fontSize: "0.9rem" }} data-testid="kunde-je-schicht">
            Dieser Einsatz wird je Schicht bestätigt – der Knopf steht oben bei der jeweiligen Schicht. Je Schicht entsteht dann ein eigener Stundennachweis.
          </p>
        ) : view.kunde ? (
          <>
            <p style={{ marginTop: "0.5rem" }}>
              <span className="ez-pill ez-pill-green">✓ {view.kunde.name}</span>
            </p>
            <PdfKarte url={`/api/e/crew/${token}/pdf`} />
          </>
        ) : (
          <>
            <p className="ez-muted" style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>
              Der Ansprechpartner des Kunden bestätigt die Arbeitszeiten – am besten, nachdem alle unterschrieben haben.
              {view.schichten.length > 1 ? " Für einen Nachweis je Schicht stattdessen oben die einzelne Schicht abzeichnen." : ""}
            </p>
            <button type="button" className="ez-btn ez-btn-ghost" style={{ marginTop: "0.6rem" }} disabled={view.state === "abgelaufen"} onClick={() => setKundeMode({ schicht: null })} data-testid="crew-kunde">
              Kunde unterschreibt
            </button>
          </>
        )}
      </div>
    </>
  );
}

// Bei einem Einsatz arbeiten fast alle dieselbe Schicht. Hat die erste Person
// ihre Zeiten eingetragen, lassen sie sich für alle übrigen übernehmen: die
// Formulare sind dann vorausgefüllt. Unterschreiben muss jede selbst.
function ZeitenFuerAlle({
  schicht,
  token,
  gesperrt,
  onUebernehmen,
}: {
  schicht: CrewView["schichten"][number];
  token: string;
  gesperrt: boolean;
  onUebernehmen: (shiftAssignmentId: string) => Promise<{ ok: boolean; error?: string; queued?: boolean }>;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  void token;

  const erfasst = schicht.personen.filter((p) => p.erfasst && p.eintrag);
  const offen = schicht.personen.filter((p) => !p.erfasst);
  const v = schicht.vorgabe;

  if (v) {
    return (
      <p className="ez-muted" style={{ marginTop: "0.6rem", fontSize: "0.85rem" }} data-testid={`zeiten-uebernommen-${schicht.id}`}>
        Zeiten von {v.von} gelten für diese Schicht: {v.start}–{v.ende} Uhr, Pause {v.pauseMinuten} min. Sie sind bei allen vorausgefüllt und lassen sich einzeln ändern.
      </p>
    );
  }
  // Erst anbieten, wenn jemand erfasst hat und noch jemand offen ist
  if (gesperrt || erfasst.length === 0 || offen.length === 0) return null;

  const quelle = erfasst[0];
  const e = quelle.eintrag!;

  return (
    <div style={{ marginTop: "0.6rem" }}>
      <button
        type="button"
        className="ez-btn ez-btn-ghost ez-btn-small"
        disabled={busy}
        data-testid={`zeiten-fuer-alle-${schicht.id}`}
        onClick={async () => {
          setFehler(null);
          setBusy(true);
          const res = await onUebernehmen(quelle.shiftAssignmentId);
          setBusy(false);
          if (!res.ok) setFehler(res.error ?? "Fehler");
        }}
      >
        {busy ? "Übernimmt …" : `Zeiten von ${quelle.vorname} für alle ${offen.length} Übrigen übernehmen`}
      </button>
      <p className="ez-muted" style={{ marginTop: "0.3rem", fontSize: "0.82rem" }}>
        {e.start}–{e.ende} Uhr, Pause {e.pauseMinuten} min. Jede Person prüft und unterschreibt weiterhin selbst.
      </p>
      {fehler ? <p className="ez-error" style={{ marginTop: "0.4rem" }}>{fehler}</p> : null}
    </div>
  );
}

type KorrekturErgebnis = { ok: boolean; error?: string };

function NameKorrektur({ person, onCancel, onSubmit }: { person: Person; onCancel: () => void; onSubmit: (vorname: string, nachname: string) => Promise<KorrekturErgebnis> }) {
  // Der bisherige Name steht drin: meist ist nur ein Buchstabe falsch.
  const teile = person.name.trim().split(/\s+/);
  const [vorname, setVorname] = useState(teile.slice(0, -1).join(" ") || person.vorname);
  const [nachname, setNachname] = useState(teile.length > 1 ? teile[teile.length - 1] : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="ez-subcard" data-testid="crew-name-form">
      <p className="ez-muted" style={{ fontSize: "0.85rem" }}>
        Richtige Schreibweise eintragen. Der Name steht später auf dem Stundennachweis und in der Konkretisierung.
      </p>
      <NameFelder vorname={vorname} nachname={nachname} setVorname={setVorname} setNachname={setNachname} praefix="crew-name" />
      {error ? <p className="ez-error" style={{ marginTop: "0.5rem" }}>{error}</p> : null}
      <div className="ez-row" style={{ marginTop: "0.6rem" }}>
        <button
          type="button"
          className="ez-btn ez-btn-small"
          disabled={busy}
          data-testid="crew-name-speichern"
          onClick={async () => {
            setError(null);
            setBusy(true);
            const res = await onSubmit(vorname.trim(), nachname.trim());
            setBusy(false);
            if (!res.ok) setError(res.error ?? "Fehler");
          }}
        >
          {busy ? "Speichert …" : "Name übernehmen"}
        </button>
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function PersonErgaenzen({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (vorname: string, nachname: string) => Promise<KorrekturErgebnis> }) {
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="ez-subcard" data-testid="crew-add-form">
      <p className="ez-muted" style={{ fontSize: "0.85rem" }}>
        Jemand ist kurzfristig mitgekommen? Hier eintragen – die Person kann dann direkt unterschreiben.
      </p>
      <NameFelder vorname={vorname} nachname={nachname} setVorname={setVorname} setNachname={setNachname} praefix="crew-add" />
      {error ? <p className="ez-error" style={{ marginTop: "0.5rem" }}>{error}</p> : null}
      <div className="ez-row" style={{ marginTop: "0.6rem" }}>
        <button
          type="button"
          className="ez-btn ez-btn-small"
          disabled={busy}
          data-testid="crew-add-speichern"
          onClick={async () => {
            setError(null);
            setBusy(true);
            const res = await onSubmit(vorname.trim(), nachname.trim());
            setBusy(false);
            if (!res.ok) setError(res.error ?? "Fehler");
          }}
        >
          {busy ? "Speichert …" : "Person hinzufügen"}
        </button>
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function PersonForm({
  person,
  schicht,
  view,
  onCancel,
  onSubmit,
}: {
  token: string;
  person: Person;
  schicht: CrewView["schichten"][number];
  view: CrewView;
  onCancel: () => void;
  onSubmit: (body: unknown) => Promise<{ ok: boolean; error?: string }>;
}) {
  // Hat jemand seine Zeiten für die Schicht übernommen, stehen die hier
  // schon drin – sonst die Planzeiten.
  const v = schicht.vorgabe;
  const [startDatum, setStartDatum] = useState(v?.startDatum ?? person.startDatum);
  const [start, setStart] = useState(v?.start ?? person.start);
  const [endeDatum, setEndeDatum] = useState(v?.endeDatum ?? person.endeDatum);
  const [ende, setEnde] = useState(v?.ende ?? person.ende);
  const [pause, setPause] = useState(String(v?.pauseMinuten ?? 30));
  const [pkw, setPkw] = useState(false);
  const [pkwArt, setPkwArt] = useState<"PRIVAT" | "FIRMA" | null>(null);
  const [km, setKm] = useState("");
  const [von, setVon] = useState("");
  const [nach, setNach] = useState("");
  const [spesen, setSpesen] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [unterweisung, setUnterweisung] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);

  const submit = async () => {
    setError(null);
    const unterschrift = sigRef.current?.toDataUrl();
    if (!unterschrift) return setError("Bitte unterschreiben.");
    if (pkw && (!pkwArt || !von.trim() || !nach.trim() || !km.trim())) return setError("Bitte Fahrzeugart und Fahrt (Start, Stop, km) angeben.");
    setBusy(true);
    const res = await onSubmit({
      startDatum,
      start,
      endeDatum,
      ende,
      pauseMinuten: Number(pause) || 0,
      taetigkeit: schicht.taetigkeit,
      notiz,
      pkw,
      pkwArt: pkw ? pkwArt : null,
      fahrten: pkw ? [{ von: von.trim(), nach: nach.trim(), km: Number(km.replace(",", ".")) }] : [],
      spesen,
      spesenBetrag: null,
      unterweisungBestaetigt: true,
      unterschrift,
      geraet: "Crew-Gerät",
      erfasstAm: new Date().toISOString(),
    });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Fehler");
  };

  return (
    <>
      <Wordmark />
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow">
          {schicht.bezeichnung} · {schicht.datumDE}
        </p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{person.name}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem", fontSize: "0.92rem" }}>
          {view.einsatz.projekt} · {view.einsatz.kunde}
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}>
        <div className="ez-card" style={{ display: "grid", gap: "0.7rem" }}>
          {v ? (
            <div className="ez-info" data-testid="vorgabe-hinweis">
              Zeiten von {v.von} übernommen: {v.start}–{v.ende} Uhr, Pause {v.pauseMinuten} min. Wenn es bei dir anders war, hier ändern.
            </div>
          ) : null}
          <div className="ez-row">
            <div>
              <label className="ez-label">Start (Datum)</label>
              <input className="ez-input" type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} required />
            </div>
            <div>
              <label className="ez-label">Start</label>
              <input className="ez-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
          </div>
          <div className="ez-row">
            <div>
              <label className="ez-label">Ende (Datum)</label>
              <input className="ez-input" type="date" value={endeDatum} onChange={(e) => setEndeDatum(e.target.value)} required />
            </div>
            <div>
              <label className="ez-label">Ende</label>
              <input className="ez-input" type="time" value={ende} onChange={(e) => setEnde(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="ez-label">Pause (Minuten)</label>
            <input className="ez-input" type="number" inputMode="numeric" min={0} step={5} value={pause} onChange={(e) => setPause(e.target.value)} />
          </div>
          <label className={`ez-check ${pkw ? "is-on" : ""}`}>
            <input type="checkbox" checked={pkw} onChange={(e) => setPkw(e.target.checked)} />
            <span>Mit PKW gefahren</span>
          </label>
          {pkw ? (
            <>
              <div className="ez-seg">
                <button type="button" className={pkwArt === "PRIVAT" ? "is-on" : ""} onClick={() => setPkwArt("PRIVAT")}>Privat-PKW</button>
                <button type="button" className={pkwArt === "FIRMA" ? "is-on" : ""} onClick={() => setPkwArt("FIRMA")}>Firmenwagen</button>
              </div>
              <input className="ez-input" placeholder="Start-Ort" value={von} onChange={(e) => setVon(e.target.value)} />
              <input className="ez-input" placeholder="Stop-Ort" value={nach} onChange={(e) => setNach(e.target.value)} />
              <input className="ez-input" placeholder="km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
            </>
          ) : null}
          <label className={`ez-check ${spesen ? "is-on" : ""}`}>
            <input type="checkbox" checked={spesen} onChange={(e) => setSpesen(e.target.checked)} />
            <span>Spesen</span>
          </label>
          <textarea className="ez-textarea" placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
        <SafetyAccordion abschnitte={view.unterweisung.abschnitte} version={view.unterweisung.version} bestaetigung={view.unterweisung.bestaetigung} checked={unterweisung} onChange={setUnterweisung} />
        <div className="ez-card">
          <SignaturePad ref={sigRef} onChange={setSigEmpty} label={`Unterschrift ${person.name}`} />
        </div>
        {error ? <div className="ez-error" role="alert">{error}</div> : null}
        <button type="submit" className="ez-btn" disabled={busy || sigEmpty || !unterweisung} data-testid="crew-submit">
          {busy ? "Wird gespeichert …" : "Bestätigen & weiter"}
        </button>
        <button type="button" className="ez-btn ez-btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </form>
    </>
  );
}

function CustomerForm({
  view,
  schicht,
  onCancel,
  onSubmit,
}: {
  view: CrewView;
  // Gesetzt, wenn nur diese Schicht bestätigt wird
  schicht: CrewView["schichten"][number] | null;
  onCancel: () => void;
  onSubmit: (body: unknown) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [sigEmpty, setSigEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  // Unterschrieben wird genau das, was hier steht: bei einer Schicht nur deren
  // Zeilen, sonst alle.
  const gezeigt = schicht ? [schicht] : view.schichten;
  const summary = gezeigt.flatMap((s) => s.personen.filter((p) => p.erfasst && p.eintrag).map((p) => `${p.name}: ${p.eintrag!.start}–${p.eintrag!.ende} (${p.eintrag!.stundenGesamt.toFixed(2).replace(".", ",")} h)`));

  const submit = async () => {
    setError(null);
    const unterschrift = sigRef.current?.toDataUrl();
    if (!unterschrift) return setError("Bitte unterschreiben.");
    if (name.trim().length < 2) return setError("Bitte Namen eingeben.");
    setBusy(true);
    const res = await onSubmit({ kundeName: name.trim(), unterschrift, shiftId: schicht?.id ?? null });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Fehler");
  };

  return (
    <>
      <Wordmark />
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        <p className="ez-eyebrow">Bestätigung des Kunden</p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{view.einsatz.kunde}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem", fontSize: "0.92rem" }}>
          {view.einsatz.projekt} · {schicht ? `${schicht.bezeichnung}, ${schicht.datumDE}` : view.einsatz.datum}
        </p>
        <ul style={{ marginTop: "0.6rem", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
          {summary.length === 0 ? <li className="ez-muted">Noch keine Zeiten erfasst.</li> : summary.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
          Mit der Unterschrift bestätigt der Entleiher die Richtigkeit der erfassten Arbeitszeiten
          {schicht ? ` der Schicht ${schicht.bezeichnung}` : ""}.
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}>
        <div className="ez-card" style={{ display: "grid", gap: "0.7rem" }}>
          <div>
            <label className="ez-label" htmlFor="kundeName">Name des Unterzeichnenden</label>
            <input id="kundeName" className="ez-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" data-testid="kunde-name" />
          </div>
          <SignaturePad ref={sigRef} onChange={setSigEmpty} label="Unterschrift Kunde" testId="kunde-signature" />
        </div>
        {error ? <div className="ez-error" role="alert">{error}</div> : null}
        <button type="submit" className="ez-btn" disabled={busy || sigEmpty} data-testid="kunde-submit">
          {busy ? "Wird gespeichert …" : "Bestätigen"}
        </button>
        <button type="button" className="ez-btn ez-btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </form>
    </>
  );
}
