"use client";
// Beleg-Link /b/:token (Modul A): ohne Anmeldung ein Beleg einreichen – Foto,
// Betrag, Datum, Beiblatt. Die „Auslesung“ ist im Prototyp simuliert, Abweichungen
// zwischen Eingabe und Beleg werden gelb markiert (Hinweis, keine Ablehnung).
import { useState } from "react";
import { usePv, HEUTE } from "../state/store";
import { Btn, Chip, Feld, Karte, Note, Offen } from "../ui/kit";
import { BELEGARTEN, BELEG_BEZEICHNUNG, BEIBLATT_VORLAGEN, beiblattText, belegAbweichungen, belegDateiNameOk, simuliereAuslesung, type Belegart } from "../logic/beleg";
import { formatDatumDE, formatEuro } from "../logic/zeit";
import { parseZahl } from "../logic/stundentabelle";

export function BelegLink({ token }: { token: string }) {
  const { s, set, melde } = usePv();
  const jobId = token.startsWith("demo-") && token !== "demo-token" ? token.slice(5) : s.jobs[0].id;
  const job = s.jobs.find((j) => j.id === jobId) ?? s.jobs[0];
  const [art, setArt] = useState<Belegart>("Tanken");
  const [datei, setDatei] = useState<string>("");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(HEUTE);
  const [haendler, setHaendler] = useState("");
  const [zweck, setZweck] = useState("Anfahrt zum Einsatz");
  const [pnr, setPnr] = useState("P9001");
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<null | { abweichungen: ReturnType<typeof belegAbweichungen>; betrag: number; id: string }>(null);

  const person = s.crew.find((c) => c.pnr === pnr.trim().toUpperCase());
  const beiblatt = beiblattText(BEIBLATT_VORLAGEN[art], { auftrag_id: job.id, kunde: job.kunde, ort: job.ort, datum: formatDatumDE(datum), mitarbeiter: person ? `${person.vorname} ${person.nachname}` : pnr, zweck });

  const absenden = () => {
    const b = parseZahl(betrag);
    if (!datei) return setFehler("Bitte ein Foto oder eine PDF des Belegs auswählen.");
    if (!belegDateiNameOk(datei)) return setFehler("Dieses Dateiformat kennen wir nicht. Bitte ein Foto (JPG, PNG, HEIC) oder eine PDF.");
    if (b === null || b <= 0) return setFehler("Bitte den Betrag eintragen (zum Beispiel 27,90).");
    if (!person) return setFehler("Diese Personalnummer kennen wir nicht. Im Prototyp zum Beispiel P9001.");
    setFehler(null);
    const gelesen = simuliereAuslesung(datei, art, datum);
    // Zur Vorführung weicht der Betrag ab, wenn der Dateiname „abweichung“ enthält
    const gelesenAngepasst = /abweichung/i.test(datei) ? { ...gelesen, betrag: Math.round((b + 4.2) * 100) / 100 } : /passt/i.test(datei) ? { ...gelesen, betrag: b, datum, haendler: haendler || gelesen.haendler } : gelesen;
    const abw = belegAbweichungen({ betrag: b, datum, haendler }, gelesenAngepasst);
    const id = `bel-${s.belege.length + 1}`;
    set((st) => ({ ...st, belege: [...st.belege, { id, zeit: new Date().toISOString(), pnr: person.pnr, art, betrag: b, datum, haendler, zweck, auftragId: job.id, dateiname: datei, gelesen: gelesenAngepasst, abweichungen: abw, beiblatt }] }));
    setFertig({ abweichungen: abw, betrag: b, id });
    melde("Beleg eingereicht.");
  };

  return (
    <div className="pvc">
      <header className="pvc-top"><span className="pv-wordmark">fess<span style={{ color: "var(--orange)" }}>.</span>jobs</span><span className="small">Beleg einreichen</span></header>
      <main className="pvc-main" style={{ paddingBottom: "2rem" }}>
        <div className="col gap2">
          <div><div className="eyebrow">{job.id}</div><h1>{job.titel}</h1><div className="small muted">{job.kunde} · {job.ort}</div></div>

          {fertig ? (
            <>
              <Karte>
                <h2>✓ Eingereicht</h2>
                <p className="mt1">{BELEG_BEZEICHNUNG[art]} über <b>{formatEuro(fertig.betrag)}</b> ist angekommen und liegt im Unterlagen-Archiv.</p>
              </Karte>
              {fertig.abweichungen.length > 0 ? (
                <Note ton="warn" >
                  <b>Kleine Abweichungen beim Auslesen</b> – bitte kurz prüfen:
                  <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }} data-testid="abweichungen">
                    {fertig.abweichungen.map((a) => <li key={a.feld}>{{ betrag: "Betrag", datum: "Datum", haendler: "Händler" }[a.feld]}: du hast „{a.eingabe}“ eingegeben, auf dem Beleg steht „{a.gelesen}“.</li>)}
                  </ul>
                  <div className="small mt1">Das ist ein Hinweis, keine Ablehnung. Die Buchhaltung schaut es sich an.</div>
                </Note>
              ) : <Note ton="ok">Die Angaben passen zum Beleg.</Note>}
              <Btn v="sec" block onClick={() => { setFertig(null); setDatei(""); setBetrag(""); setHaendler(""); }}>Weiteren Beleg einreichen</Btn>
            </>
          ) : (
            <>
              <Feld label="Was für ein Beleg?">
                <div className="row wrap gap1" role="group" aria-label="Belegart">
                  {BELEGARTEN.map((b) => <button key={b} type="button" className={`pv-chip ${b === art ? "navy" : ""}`} style={{ border: 0, cursor: "pointer", padding: "0.45rem 0.8rem", fontSize: "0.85rem" }} aria-pressed={b === art} onClick={() => setArt(b)}>{b}</button>)}
                </div>
              </Feld>
              <Feld label="Foto oder PDF" hint="Im Prototyp wird nichts hochgeladen – es zählt nur der Dateiname.">
                <input className="pv-input" type="file" accept="image/*,application/pdf" capture="environment" aria-label="Beleg-Datei" onChange={(e) => setDatei(e.target.files?.[0]?.name ?? "")} />
                <div className="row wrap mt1">
                  <Btn v="sec" groesse="sm" onClick={() => setDatei("beleg-demo.jpg")} data-testid="beispielfoto">Beispielfoto verwenden</Btn>
                  <Btn v="sec" groesse="sm" onClick={() => setDatei("beleg-abweichung.jpg")} data-testid="beispielfoto-abweichung">Beispiel mit Abweichung</Btn>
                  {datei ? <Chip ton="info">{datei}</Chip> : null}
                </div>
              </Feld>
              <div className="pva-grid c2" style={{ gap: "0.6rem" }}>
                <Feld label="Betrag (€)"><input className="pv-input mono" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="27,90" aria-label="Betrag" /></Feld>
                <Feld label="Datum"><input className="pv-input" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Datum" max={HEUTE} /></Feld>
              </div>
              <Feld label="Händler (optional)"><input className="pv-input" value={haendler} onChange={(e) => setHaendler(e.target.value)} aria-label="Händler" /></Feld>
              <Feld label="Wofür?"><input className="pv-input" value={zweck} onChange={(e) => setZweck(e.target.value)} aria-label="Zweck" /></Feld>
              <Feld label="Deine Personalnummer" hint="Steht auf deinem Vertrag. Im Prototyp: P9001.">
                <input className="pv-input mono" value={pnr} onChange={(e) => setPnr(e.target.value)} aria-label="Personalnummer" />
                {person ? <div className="tiny muted mt1">{person.vorname} {person.nachname}</div> : null}
              </Feld>
              <Karte titel="Beiblatt (wird mitgeschickt)"><p className="small" data-testid="beiblatt">{beiblatt}</p></Karte>
              {fehler ? <div className="pv-error" role="alert">{fehler}</div> : null}
              <Btn block groesse="lg" onClick={absenden} data-testid="beleg-senden">Beleg einreichen</Btn>
              <div className="tiny muted"><Offen>Das Auslesen des Belegs ist im Prototyp simuliert; im echten System liest Claude Betrag, Datum und Händler.</Offen></div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
