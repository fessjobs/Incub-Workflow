"use client";

// Crew-Gerät: Liste aller Personen des Einsatzes → jede Person prüft ihre
// Zeiten, bestätigt die Unterweisung und unterschreibt nacheinander auf
// diesem Gerät; am Ende unterschreibt der Kunde.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SafetySection } from "@/lib/einsatz/safety";
import { SafetyAccordion } from "../../safety-accordion";
import { SignaturePad, type SignaturePadHandle } from "../../signature-pad";
import { FLUSH_EVENT, isNetworkError, queueSubmission } from "../../offline";

type Person = {
  shiftAssignmentId: string;
  name: string;
  vorname: string;
  startDatum: string;
  start: string;
  endeDatum: string;
  ende: string;
  erfasst: boolean;
  eintrag: { stundenGesamt: number; start: string; ende: string; pauseMinuten: number } | null;
};

type CrewView = {
  state: "offen" | "abgelaufen";
  einsatz: { einsatznummer: string; projekt: string; artist: string | null; kunde: string; einsatzort: string; datum: string };
  schichten: Array<{ id: string; bezeichnung: string; taetigkeit: string; datumDE: string; personen: Person[] }>;
  kunde: { name: string; zeitpunkt: string } | null;
  unterweisung: { version: string; abschnitte: SafetySection[]; bestaetigung: string[] };
};

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
  const [kundeMode, setKundeMode] = useState(false);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<string | null>(null);

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
        onCancel={() => setKundeMode(false)}
        onSubmit={async (body) => {
          const res = await post(`crew:${token}:kunde`, body);
          if (res.ok) {
            setKundeMode(false);
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
        <p className="ez-eyebrow">{view.einsatz.kunde} · Crew-Gerät</p>
        <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>{view.einsatz.projekt}</h1>
        <p className="ez-muted" style={{ marginTop: "0.3rem" }}>
          {view.einsatz.einsatzort} · {view.einsatz.datum} · {view.einsatz.einsatznummer}
        </p>
        <p style={{ marginTop: "0.6rem", fontSize: "0.92rem" }}>
          Gerät an jede Person weitergeben: Zeiten prüfen, Unterweisung bestätigen, unterschreiben. Zum Schluss unterschreibt der Kunde.
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
          {s.personen.map((p) => {
            const isQueued = queued.has(`crew:${token}:${p.shiftAssignmentId}`);
            return (
              <div key={p.shiftAssignmentId} className="ez-list-item">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600 }}>{p.name}</p>
                  <p className="ez-muted" style={{ fontSize: "0.85rem" }}>
                    {p.erfasst && p.eintrag ? `${p.eintrag.start}–${p.eintrag.ende}, Pause ${p.eintrag.pauseMinuten} min, ${p.eintrag.stundenGesamt.toFixed(2).replace(".", ",")} h` : `Plan ${p.start}–${p.ende}`}
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
            );
          })}
        </div>
      ))}

      <div className="ez-card" style={{ marginTop: "0.8rem" }}>
        <p className="ez-eyebrow">Kundenbestätigung</p>
        {view.kunde ? (
          <p style={{ marginTop: "0.5rem" }}>
            <span className="ez-pill ez-pill-green">✓ {view.kunde.name}</span>
          </p>
        ) : (
          <>
            <p className="ez-muted" style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>
              Der Ansprechpartner des Kunden bestätigt die Arbeitszeiten – am besten, nachdem alle unterschrieben haben.
            </p>
            <button type="button" className="ez-btn ez-btn-ghost" style={{ marginTop: "0.6rem" }} disabled={view.state === "abgelaufen"} onClick={() => setKundeMode(true)} data-testid="crew-kunde">
              Kunde unterschreibt
            </button>
          </>
        )}
      </div>
    </>
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
  const [startDatum, setStartDatum] = useState(person.startDatum);
  const [start, setStart] = useState(person.start);
  const [endeDatum, setEndeDatum] = useState(person.endeDatum);
  const [ende, setEnde] = useState(person.ende);
  const [pause, setPause] = useState("30");
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

function CustomerForm({ view, onCancel, onSubmit }: { view: CrewView; onCancel: () => void; onSubmit: (body: unknown) => Promise<{ ok: boolean; error?: string }> }) {
  const [name, setName] = useState("");
  const [sigEmpty, setSigEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const summary = view.schichten.flatMap((s) => s.personen.filter((p) => p.erfasst && p.eintrag).map((p) => `${p.name}: ${p.eintrag!.start}–${p.eintrag!.ende} (${p.eintrag!.stundenGesamt.toFixed(2).replace(".", ",")} h)`));

  const submit = async () => {
    setError(null);
    const unterschrift = sigRef.current?.toDataUrl();
    if (!unterschrift) return setError("Bitte unterschreiben.");
    if (name.trim().length < 2) return setError("Bitte Namen eingeben.");
    setBusy(true);
    const res = await onSubmit({ kundeName: name.trim(), unterschrift });
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
          {view.einsatz.projekt} · {view.einsatz.datum}
        </p>
        <ul style={{ marginTop: "0.6rem", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
          {summary.length === 0 ? <li className="ez-muted">Noch keine Zeiten erfasst.</li> : summary.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>Mit der Unterschrift bestätigt der Entleiher die Richtigkeit der erfassten Arbeitszeiten.</p>
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
