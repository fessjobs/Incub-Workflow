"use client";

// Mitarbeiter-Erfassung: eigene Schicht prüfen, Pause/PKW/Spesen ergänzen,
// Unterweisung bestätigen, unterschreiben. Nach dem Absenden gesperrt.
// Offlinefähig: Eingaben werden gepuffert und nachgesendet.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TokenView } from "@/lib/einsatz/service/public-view";
import { SafetyAccordion } from "../safety-accordion";
import { SignaturePad, type SignaturePadHandle } from "../signature-pad";
import { FLUSH_EVENT, getPending, isNetworkError, queueSubmission } from "../offline";
import { PdfKarte } from "../pdf-share";

type Trip = { von: string; nach: string; km: string };

function Wordmark() {
  return (
    <p className="ez-wordmark">
      fess<span>.</span>jobs
    </p>
  );
}

function Header({ view }: { view: TokenView }) {
  return (
    <div className="ez-card" style={{ marginTop: "1rem" }}>
      <p className="ez-eyebrow">{view.einsatz.kunde}</p>
      <h1 className="ez-h1" style={{ marginTop: "0.2rem" }}>
        {view.einsatz.projekt}
        {view.einsatz.artist && view.einsatz.artist !== view.einsatz.projekt ? ` · ${view.einsatz.artist}` : ""}
      </h1>
      <p className="ez-muted" style={{ marginTop: "0.3rem" }}>
        {view.einsatz.einsatzort} · {view.einsatz.datum}
      </p>
      <div style={{ marginTop: "0.8rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <span className="ez-pill ez-pill-orange">{view.schicht.bezeichnung}</span>
        {view.schicht.taetigkeit ? <span className="ez-pill ez-pill-grey">{view.schicht.taetigkeit}</span> : null}
        <span className="ez-pill ez-pill-grey">
          {view.schicht.datumDE} · {view.schicht.start}–{view.schicht.ende}
        </span>
      </div>
      {view.schicht.treffpunkt ? (
        <p style={{ marginTop: "0.6rem", fontSize: "0.92rem" }}>
          <strong>Treffpunkt:</strong> {view.schicht.treffpunkt}
        </p>
      ) : null}
      <p style={{ marginTop: "0.6rem", fontSize: "0.92rem" }}>
        Hallo <strong>{view.person.vorname}</strong>, bitte prüfe deine Zeiten und unterschreibe.
      </p>
    </div>
  );
}

function ReadOnly({ view, token, pending }: { view: TokenView; token: string; pending: boolean }) {
  const e = view.eintrag;
  return (
    <>
      <div className="ez-card" style={{ marginTop: "1rem" }}>
        {pending ? (
          <>
            <span className="ez-pill ez-pill-orange">Wird gesendet, sobald Netz da ist</span>
            <p style={{ marginTop: "0.6rem" }}>Deine Eingaben sind auf diesem Gerät gespeichert. Lass die Seite später kurz mit Internet geöffnet – sie sendet automatisch nach.</p>
          </>
        ) : view.state === "abgelaufen" ? (
          <>
            <span className="ez-pill ez-pill-grey">Link abgelaufen</span>
            <p style={{ marginTop: "0.6rem" }}>Dieser Link ist nicht mehr gültig. Bitte melde dich bei der Dispo, dann bekommst du einen neuen.</p>
          </>
        ) : view.state === "storniert" ? (
          <>
            <span className="ez-pill ez-pill-grey">Storniert</span>
            <p style={{ marginTop: "0.6rem" }}>Diese Einteilung wurde storniert.</p>
          </>
        ) : (
          <>
            <span className="ez-pill ez-pill-green" data-testid="state-erfasst">✓ Unterschrieben</span>
            <p style={{ marginTop: "0.6rem" }}>Danke! Dein Eintrag ist gespeichert und gesperrt. Änderungen kann nur noch die Dispo mit Begründung vornehmen.</p>
          </>
        )}
      </div>
      {e ? (
        <div className="ez-card" style={{ marginTop: "0.8rem" }}>
          <p className="ez-eyebrow">Dein Eintrag{e.version > 1 ? ` (Version ${e.version})` : ""}</p>
          <dl style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem", fontSize: "0.95rem" }}>
            <dt className="ez-muted">Start</dt>
            <dd>
              {e.startDatum.split("-").reverse().join(".")} {e.start}
            </dd>
            <dt className="ez-muted">Ende</dt>
            <dd>
              {e.endeDatum.split("-").reverse().join(".")} {e.ende}
            </dd>
            <dt className="ez-muted">Pause</dt>
            <dd>{e.pauseMinuten} min</dd>
            <dt className="ez-muted">Gesamt</dt>
            <dd>
              <strong>{e.stundenGesamt.toFixed(2).replace(".", ",")} h</strong>
            </dd>
            <dt className="ez-muted">Tätigkeit</dt>
            <dd>{e.taetigkeit || "–"}</dd>
            <dt className="ez-muted">PKW</dt>
            <dd>{e.pkw ? (e.pkwArt === "FIRMA" ? "Firmenwagen" : "privat") : "nein"}</dd>
            <dt className="ez-muted">Spesen</dt>
            <dd>{e.spesen ? (e.spesenBetrag !== null ? `${e.spesenBetrag.toFixed(2).replace(".", ",")} €` : "ja") : "nein"}</dd>
            {e.korrekturGrund ? (
              <>
                <dt className="ez-muted">Korrektur</dt>
                <dd>{e.korrekturGrund}</dd>
              </>
            ) : null}
          </dl>
          {e.fahrten.length > 0 ? (
            <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
              Fahrten: {e.fahrten.map((f) => `${f.von} → ${f.nach} (${f.km} km)`).join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.state === "erfasst" ? <PdfKarte url={`/api/e/${token}/pdf`} /> : null}
      <p className="ez-muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
        Die PDF steht bereit, sobald alle Personen des Einsatzes unterschrieben haben und der Kunde bestätigt hat.
      </p>
    </>
  );
}

export function EntryForm({ token }: { token: string }) {
  const [view, setView] = useState<TokenView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [startDatum, setStartDatum] = useState("");
  const [start, setStart] = useState("");
  const [endeDatum, setEndeDatum] = useState("");
  const [ende, setEnde] = useState("");
  const [pause, setPause] = useState("30");
  const [taetigkeit, setTaetigkeit] = useState("");
  const [notiz, setNotiz] = useState("");
  const [pkw, setPkw] = useState(false);
  const [pkwArt, setPkwArt] = useState<"PRIVAT" | "FIRMA" | null>(null);
  const [fahrten, setFahrten] = useState<Trip[]>([{ von: "", nach: "", km: "" }]);
  const [spesen, setSpesen] = useState(false);
  const [spesenBetrag, setSpesenBetrag] = useState("");
  const [unterweisung, setUnterweisung] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadError(j.error ?? `Fehler ${res.status}`);
        return;
      }
      const v = (await res.json()) as TokenView;
      setView(v);
      // Hat jemand seine Zeiten für die ganze Schicht übernommen, stehen die
      // hier schon drin – sonst die Planzeiten.
      setStartDatum(v.vorgabe?.startDatum ?? v.schicht.startDatum);
      setStart(v.vorgabe?.start ?? v.schicht.start);
      setEndeDatum(v.vorgabe?.endeDatum ?? v.schicht.endeDatum);
      setEnde(v.vorgabe?.ende ?? v.schicht.ende);
      if (v.vorgabe) setPause(String(v.vorgabe.pauseMinuten));
      setTaetigkeit(v.schicht.taetigkeit);
    } catch {
      setLoadError("Keine Verbindung. Sobald wieder Netz da ist, bitte neu laden.");
    }
  }, [token]);

  useEffect(() => {
    void load();
    getPending(`e:${token}`).then((p) => setPending(Boolean(p)));
    const onFlush = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { key: string; ok: boolean; payload: { view?: TokenView; error?: string } | null };
      if (d.key !== `e:${token}`) return;
      setPending(false);
      if (d.ok && d.payload?.view) setView(d.payload.view);
      else if (d.payload?.error) setError(`Nachsenden abgelehnt: ${d.payload.error}`);
      void load();
    };
    window.addEventListener(FLUSH_EVENT, onFlush);
    return () => window.removeEventListener(FLUSH_EVENT, onFlush);
  }, [load, token]);

  const updateTrip = (i: number, patch: Partial<Trip>) => setFahrten((list) => list.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const submit = async () => {
    setError(null);
    if (!unterweisung) return setError("Bitte die Sicherheitsunterweisung bestätigen.");
    const unterschrift = sigRef.current?.toDataUrl();
    if (!unterschrift) return setError("Bitte unterschreiben.");
    if (pkw && !pkwArt) return setError("Bitte privat oder Firmenwagen auswählen.");
    const trips = pkw ? fahrten.filter((t) => t.von.trim() || t.nach.trim() || t.km.trim()) : [];
    for (const t of trips) {
      if (!t.von.trim() || !t.nach.trim() || Number.isNaN(Number(t.km.replace(",", "."))))
        return setError("Bitte jede Fahrt vollständig mit Start, Stop und km eintragen.");
    }
    if (pkw && trips.length === 0) return setError("Bitte mindestens eine Fahrt eintragen.");
    const body = {
      startDatum,
      start,
      endeDatum,
      ende,
      pauseMinuten: Number(pause) || 0,
      taetigkeit,
      notiz,
      pkw,
      pkwArt: pkw ? pkwArt : null,
      fahrten: trips.map((t) => ({ von: t.von.trim(), nach: t.nach.trim(), km: Number(t.km.replace(",", ".")) })),
      spesen,
      spesenBetrag: spesen && spesenBetrag ? Number(spesenBetrag.replace(",", ".")) : null,
      unterweisungBestaetigt: true,
      unterschrift,
      geraet: navigator.userAgent.includes("Mobile") ? "Mobil" : "Desktop",
      erfasstAm: new Date().toISOString(),
    };
    setSubmitting(true);
    try {
      const res = await fetch(`/api/e/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? `Fehler ${res.status}`);
        if (res.status === 409) void load();
        return;
      }
      if (j.view) setView(j.view as TokenView);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (isNetworkError(err)) {
        await queueSubmission({ key: `e:${token}`, url: `/api/e/${token}`, body, createdAt: new Date().toISOString() });
        setPending(true);
        try {
          const reg = await navigator.serviceWorker?.ready;
          await (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } })?.sync?.register("fess-einsatz-flush");
        } catch {
          // Background Sync nicht verfügbar – window "online" übernimmt
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError("Senden fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <>
        <Wordmark />
        <div className="ez-card ez-error" style={{ marginTop: "1rem" }}>
          {loadError}
        </div>
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
          <p className="ez-muted">Lade deinen Einsatz …</p>
        </div>
      </>
    );
  }
  if (view.state !== "offen" || pending) {
    return (
      <>
        <Wordmark />
        <Header view={view} />
        <ReadOnly view={view} token={token} pending={pending} />
      </>
    );
  }

  return (
    <>
      <Wordmark />
      <Header view={view} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}
      >
        <div className="ez-card" style={{ display: "grid", gap: "0.7rem" }}>
          <p className="ez-eyebrow">Arbeitszeit</p>
          {view.vorgabe ? (
            <div className="ez-info" data-testid="vorgabe-hinweis">
              Zeiten von {view.vorgabe.von} übernommen: {view.vorgabe.start}–{view.vorgabe.ende} Uhr, Pause {view.vorgabe.pauseMinuten} min. Wenn es bei dir anders war, hier ändern.
            </div>
          ) : null}
          <div className="ez-row">
            <div>
              <label className="ez-label" htmlFor="startDatum">Start (Datum)</label>
              <input id="startDatum" className="ez-input" type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} required />
            </div>
            <div>
              <label className="ez-label" htmlFor="start">Start (Uhrzeit)</label>
              <input id="start" className="ez-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
          </div>
          <div className="ez-row">
            <div>
              <label className="ez-label" htmlFor="endeDatum">Ende (Datum)</label>
              <input id="endeDatum" className="ez-input" type="date" value={endeDatum} onChange={(e) => setEndeDatum(e.target.value)} required />
            </div>
            <div>
              <label className="ez-label" htmlFor="ende">Ende (Uhrzeit)</label>
              <input id="ende" className="ez-input" type="time" value={ende} onChange={(e) => setEnde(e.target.value)} required />
            </div>
          </div>
          <div className="ez-row">
            <div>
              <label className="ez-label" htmlFor="pause">Pause (Minuten)</label>
              <input id="pause" className="ez-input" type="number" inputMode="numeric" min={0} max={600} step={5} value={pause} onChange={(e) => setPause(e.target.value)} />
            </div>
            <div>
              <label className="ez-label" htmlFor="taetigkeit">Tätigkeit</label>
              <input id="taetigkeit" className="ez-input" value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)} placeholder="z. B. Hands" />
            </div>
          </div>
        </div>

        <div className="ez-card" style={{ display: "grid", gap: "0.7rem" }}>
          <p className="ez-eyebrow">PKW &amp; Spesen</p>
          <label className={`ez-check ${pkw ? "is-on" : ""}`}>
            <input type="checkbox" checked={pkw} onChange={(e) => setPkw(e.target.checked)} data-testid="pkw-check" />
            <span>Ich bin mit dem PKW gefahren</span>
          </label>
          {pkw ? (
            <>
              <div className="ez-seg">
                <button type="button" className={pkwArt === "PRIVAT" ? "is-on" : ""} onClick={() => setPkwArt("PRIVAT")}>
                  Privat-PKW
                </button>
                <button type="button" className={pkwArt === "FIRMA" ? "is-on" : ""} onClick={() => setPkwArt("FIRMA")}>
                  Firmenwagen
                </button>
              </div>
              {fahrten.map((t, i) => (
                <div key={i} style={{ display: "grid", gap: "0.4rem", padding: "0.6rem", border: "1px solid var(--ez-line)", borderRadius: 12 }}>
                  <span className="ez-label" style={{ marginBottom: 0 }}>Fahrt {i + 1}</span>
                  <input className="ez-input" placeholder="Start-Ort" value={t.von} onChange={(e) => updateTrip(i, { von: e.target.value })} />
                  <input className="ez-input" placeholder="Stop-Ort" value={t.nach} onChange={(e) => updateTrip(i, { nach: e.target.value })} />
                  <div className="ez-row">
                    <input className="ez-input" placeholder="km" inputMode="decimal" value={t.km} onChange={(e) => updateTrip(i, { km: e.target.value })} />
                    {fahrten.length > 1 ? (
                      <button type="button" className="ez-btn ez-btn-ghost" onClick={() => setFahrten((l) => l.filter((_, idx) => idx !== i))}>
                        Entfernen
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => setFahrten((l) => [...l, { von: "", nach: "", km: "" }])}>
                + Weitere Fahrt
              </button>
            </>
          ) : null}
          <label className={`ez-check ${spesen ? "is-on" : ""}`}>
            <input type="checkbox" checked={spesen} onChange={(e) => setSpesen(e.target.checked)} />
            <span>Ich hatte Spesen (Verpflegungsmehraufwand)</span>
          </label>
          {spesen ? (
            <div>
              <label className="ez-label" htmlFor="spesenBetrag">Betrag in € (optional, sonst Pauschale)</label>
              <input id="spesenBetrag" className="ez-input" inputMode="decimal" value={spesenBetrag} onChange={(e) => setSpesenBetrag(e.target.value)} placeholder="z. B. 14,00" />
            </div>
          ) : null}
          <div>
            <label className="ez-label" htmlFor="notiz">Notiz (optional)</label>
            <textarea id="notiz" className="ez-textarea" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Verspätung wegen Einlass, Zusatzaufgabe …" />
          </div>
        </div>

        <SafetyAccordion abschnitte={view.unterweisung.abschnitte} version={view.unterweisung.version} bestaetigung={view.unterweisung.bestaetigung} checked={unterweisung} onChange={setUnterweisung} />

        <div className="ez-card">
          <SignaturePad ref={sigRef} onChange={setSigEmpty} label="Deine Unterschrift" />
        </div>

        {error ? <div className="ez-error" role="alert">{error}</div> : null}

        <button type="submit" className="ez-btn" disabled={submitting || sigEmpty || !unterweisung} data-testid="submit">
          {submitting ? "Wird gesendet …" : "Zeiten bestätigen & absenden"}
        </button>
        <p className="ez-muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>
          Nach dem Absenden ist dein Eintrag gesperrt. Zeitstempel, Gerät und IP werden protokolliert.
        </p>
      </form>
    </>
  );
}
