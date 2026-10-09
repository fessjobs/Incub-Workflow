"use client";
// Beleg-Link /b/[token] im echten System: Foto oder PDF, Betrag, Datum, Personalnummer.
// Die Seite braucht keine Anmeldung; der Link gehört zu genau einem Auftrag.
import { useEffect, useRef, useState } from "react";
import { BELEGARTEN, BEIBLATT_VORLAGEN, BELEG_BEZEICHNUNG, beiblattText, type Belegart } from "@/preview/logic/beleg";
import { formatDatumDE, formatEuro, heuteBerlin } from "@/preview/logic/zeit";
import { Btn, Feld, Karte, Note } from "@/preview/ui/kit";

interface Auftrag {
  id: string;
  titel: string;
  kunde: string;
  ort: string;
}

interface Ergebnis {
  titel: string;
  betrag: number;
  ausgelesen: boolean;
  abweichungen: Array<{ feld: "betrag" | "datum" | "haendler"; eingabe: string; gelesen: string }>;
}

export function BelegEcht({ token }: { token: string }) {
  const [job, setJob] = useState<Auftrag | null>(null);
  const [ungueltig, setUngueltig] = useState(false);
  const [art, setArt] = useState<Belegart>("Tanken");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(heuteBerlin());
  const [haendler, setHaendler] = useState("");
  const [zweck, setZweck] = useState("Anfahrt zum Einsatz");
  const [pnr, setPnr] = useState("");
  const [datei, setDatei] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState<Ergebnis | null>(null);
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/neu/b/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!r.ok) return setUngueltig(true);
      const j = (await r.json()) as { job: Auftrag };
      setJob(j.job);
    })();
  }, [token]);

  const beiblatt = job ? beiblattText(BEIBLATT_VORLAGEN[art], { auftrag_id: job.id, kunde: job.kunde, ort: job.ort, datum: formatDatumDE(datum), mitarbeiter: pnr.trim() || "–", zweck }) : "";

  const absenden = async () => {
    setFehler(null);
    if (!datei) return setFehler("Bitte ein Foto oder eine PDF des Belegs auswählen.");
    if (!betrag.trim()) return setFehler("Bitte den Betrag eintragen (zum Beispiel 27,90).");
    if (!pnr.trim()) return setFehler("Bitte deine Personalnummer eintragen.");
    setLaeuft(true);
    try {
      const form = new FormData();
      form.set("art", art);
      form.set("betrag", betrag);
      form.set("datum", datum);
      form.set("haendler", haendler);
      form.set("zweck", zweck);
      form.set("pnr", pnr);
      form.set("datei", datei);
      const r = await fetch(`/api/neu/b/${encodeURIComponent(token)}`, { method: "POST", body: form });
      const j = (await r.json().catch(() => null)) as (Ergebnis & { error?: string }) | null;
      if (!r.ok || !j) return setFehler(j?.error ?? "Der Beleg konnte nicht gesendet werden. Bitte noch einmal versuchen.");
      setFertig(j);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="pv nobanner">
      <div className="pvc">
        <header className="pvc-top"><span className="pv-wordmark">fess<span style={{ color: "var(--orange)" }}>.</span>jobs</span><span className="small">Beleg einreichen</span></header>
        <main className="pvc-main" style={{ paddingBottom: "2rem" }}>
          {ungueltig ? (
            <div className="col gap2"><h1>Link abgelaufen</h1><p>Dieser Beleg-Link ist abgelaufen oder ungültig. Bitte bei FESS einen neuen Link anfordern.</p></div>
          ) : !job ? (
            <div className="muted">Lädt …</div>
          ) : (
            <div className="col gap2">
              <div><div className="eyebrow">{job.id}</div><h1>{job.titel}</h1><div className="small muted">{job.kunde} · {job.ort}</div></div>
              {fertig ? (
                <>
                  <Karte><h2>✓ Eingereicht</h2><p className="mt1">{fertig.titel} über <b>{formatEuro(fertig.betrag)}</b> ist angekommen.</p></Karte>
                  {fertig.abweichungen.length > 0 ? (
                    <Note ton="warn">
                      <b>Kleine Abweichungen beim Auslesen</b> – bitte kurz prüfen:
                      <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }} data-testid="abweichungen">
                        {fertig.abweichungen.map((a) => <li key={a.feld}>{{ betrag: "Betrag", datum: "Datum", haendler: "Händler" }[a.feld]}: du hast „{a.eingabe}“ eingegeben, auf dem Beleg steht „{a.gelesen}“.</li>)}
                      </ul>
                      <div className="small mt1">Das ist ein Hinweis, keine Ablehnung. Die Buchhaltung schaut es sich an.</div>
                    </Note>
                  ) : <Note ton="ok">{fertig.ausgelesen ? "Die Angaben passen zum Beleg." : "Dein Beleg liegt bei der Buchhaltung."}</Note>}
                  <Btn v="sec" block onClick={() => { setFertig(null); setDatei(null); setBetrag(""); setHaendler(""); if (dateiFeld.current) dateiFeld.current.value = ""; }}>Weiteren Beleg einreichen</Btn>
                </>
              ) : (
                <>
                  <Feld label="Was für ein Beleg?">
                    <div className="row wrap gap1" role="group" aria-label="Belegart">
                      {BELEGARTEN.map((b) => <button key={b} type="button" className={`pv-chip ${b === art ? "navy" : ""}`} style={{ border: 0, cursor: "pointer", padding: "0.45rem 0.8rem", fontSize: "0.85rem" }} aria-pressed={b === art} onClick={() => setArt(b)}>{BELEG_BEZEICHNUNG[b]}</button>)}
                    </div>
                  </Feld>
                  <Feld label="Foto oder PDF"><input ref={dateiFeld} className="pv-input" type="file" accept="image/*,application/pdf" capture="environment" aria-label="Beleg-Datei" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} /></Feld>
                  <div className="pva-grid c2" style={{ gap: "0.6rem" }}>
                    <Feld label="Betrag (€)"><input className="pv-input mono" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="27,90" aria-label="Betrag" /></Feld>
                    <Feld label="Datum"><input className="pv-input" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Datum" max={heuteBerlin()} /></Feld>
                  </div>
                  <Feld label="Händler (optional)"><input className="pv-input" value={haendler} onChange={(e) => setHaendler(e.target.value)} aria-label="Händler" /></Feld>
                  <Feld label="Wofür?"><input className="pv-input" value={zweck} onChange={(e) => setZweck(e.target.value)} aria-label="Zweck" /></Feld>
                  <Feld label="Deine Personalnummer" hint="Steht auf deinem Vertrag."><input className="pv-input mono" value={pnr} onChange={(e) => setPnr(e.target.value)} aria-label="Personalnummer" autoCapitalize="characters" /></Feld>
                  <Karte titel="Beiblatt (wird mitgeschickt)"><p className="small" data-testid="beiblatt">{beiblatt}</p></Karte>
                  {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
                  <Btn block groesse="lg" onClick={absenden} disabled={laeuft} data-testid="beleg-senden">{laeuft ? "Sendet …" : "Beleg einreichen"}</Btn>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
