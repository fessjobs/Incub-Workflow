"use client";
// Personenlink /m/:token – der Monatsstundenzettel einer Person für einen Kunden. Die Person tippt auf einen Tag,
// trägt Zeiten, Fahrten und Besonderheiten ein (alles außer Beginn und Ende ist freiwillig) und unterschreibt am Monatsende.
import { useState } from "react";
import { usePv, HEUTE } from "../state/store";
import { Btn, Chip, Feld, Karte, Modal, Note, Offen } from "../ui/kit";
import { Signatur } from "../ui/signatur";
import { setzeMz } from "../state/monatszettel-store";
import { NurTestversion, StatusChip, SummenLeiste, useMzBereit } from "./monat-teile";
import { datumAnzeige, eintragMinuten, kalenderWochen, kannAbschliessen, leererEintrag, pruefeEintrag, sortiert, stundenMinuten, summe, type Fahrt, type MonatsEintrag, type MonatsZettel } from "../logic/monatszettel";
import { dezimal, formatDatumDE, formatDezimal } from "../logic/zeit";
import { monatsName } from "./helfer";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function MonatPerson({ token }: { token: string }) {
  const mz = useMzBereit();
  const { s } = usePv();
  const [bearbeitet, setBearbeitet] = useState<{ tag: string; eintrag: MonatsEintrag | null } | null>(null);
  const [haken, setHaken] = useState(false);
  const [unterschrift, setUnterschrift] = useState<string | null>(null);

  const kopf = (
    <header className="pvc-top"><span className="pv-wordmark">fess<span style={{ color: "var(--orange)" }}>.</span>jobs</span><span className="small">Stundenzettel</span></header>
  );
  if (!mz) return <div className="pvc">{kopf}<main className="pvc-main"><div className="muted small">…</div></main></div>;
  const z = mz.zettel.find((x) => x.token === token);
  if (!z) {
    return <div className="pvc">{kopf}<main className="pvc-main"><Karte><h2>Link nicht gefunden</h2><p className="muted mt1">Dieser Link ist ungültig oder abgelaufen. Bitte melde dich bei FESS.</p></Karte></main></div>;
  }
  const person = s.crew.find((c) => c.pnr === z.pnr);
  const gesperrt = z.personUnterschriftAm !== null;
  const su = summe(z);
  const abschluss = kannAbschliessen(z);
  const aendere = (fn: (x: MonatsZettel) => MonatsZettel) => setzeMz((st) => ({ ...st, zettel: st.zettel.map((x) => (x.id === z.id ? fn(x) : x)) }));

  const speichereEintrag = (e: MonatsEintrag) => aendere((x) => ({ ...x, eintraege: x.eintraege.some((y) => y.id === e.id) ? x.eintraege.map((y) => (y.id === e.id ? e : y)) : [...x.eintraege, e] }));
  const loescheEintrag = (id: string) => aendere((x) => ({ ...x, eintraege: x.eintraege.filter((y) => y.id !== id) }));
  const letzter = sortiert(z.eintraege).at(-1) ?? null;

  const unterschreiben = () => {
    if (!unterschrift || !haken || !abschluss.ok) return;
    aendere((x) => ({ ...x, personUnterschriftAm: new Date().toISOString(), personUnterschrift: unterschrift, kundeStatus: "offen", kundeHinweis: x.kundeStatus === "zurueckgegeben" ? x.kundeHinweis : "" }));
    setHaken(false);
    setUnterschrift(null);
  };
  const wiederOeffnen = () => aendere((x) => ({ ...x, personUnterschriftAm: null, personUnterschrift: null }));

  return (
    <div className="pvc" data-testid="mz-person">
      {kopf}
      <main className="pvc-main" style={{ paddingBottom: "2rem" }}>
        <div className="col gap2">
          <div>
            <div className="eyebrow">Monatsstundenzettel</div>
            <h1>{monatsName(z.monat)}</h1>
            <div className="small muted">{z.kunde}</div>
            <div className="row mt1"><b>{person ? `${person.vorname} ${person.nachname}` : z.pnr}</b><Chip mono>{z.pnr}</Chip><StatusChip z={z} /></div>
          </div>
          <NurTestversion />

          {z.kundeStatus === "zurueckgegeben" && !gesperrt ? (
            <Note ton="err"><b>Der Kunde hat den Zettel zurückgegeben.</b> <span data-testid="mz-rueckgabe-hinweis">„{z.kundeHinweis}“</span><div className="small mt1">Bitte korrigiere die Einträge und unterschreibe noch einmal.</div></Note>
          ) : null}
          {z.kundeStatus === "unterschrieben" ? (
            <Note ton="ok"><b>Fertig.</b> {z.kundeName}{z.kundeFunktion ? ` (${z.kundeFunktion})` : ""} hat den Monat bestätigt. Danke!</Note>
          ) : gesperrt ? (
            <Note><b>Du hast unterschrieben.</b> Jetzt ist der Kunde dran. Änderungen sind nicht mehr möglich{" "}<Btn v="ghost" groesse="sm" onClick={wiederOeffnen} data-testid="mz-wieder-oeffnen">Doch noch etwas ändern</Btn></Note>
          ) : (
            <Note>Tippe auf einen Tag, an dem du gearbeitet hast. Nur Beginn und Ende sind Pflicht – alles andere ist freiwillig. Tage in der Zukunft sind gesperrt.</Note>
          )}

          <Karte titel="Tage eintragen" aktionen={<Offen>Frage 2</Offen>}>
            <div className="mz-kal" role="grid" aria-label={`Kalender ${monatsName(z.monat)}`}>
              {WOCHENTAGE.map((w) => <div key={w} className="mz-kopf" role="columnheader">{w}</div>)}
              {kalenderWochen(z.monat).flat().map((d, i) => {
                if (!d) return <div key={`leer-${i}`} />;
                const tagesEintraege = z.eintraege.filter((e) => e.datum === d);
                const min = tagesEintraege.reduce((m, e) => m + eintragMinuten(e), 0);
                const zukunft = d > HEUTE;
                const sperre = zukunft || (gesperrt && tagesEintraege.length === 0);
                return (
                  <button
                    key={d}
                    type="button"
                    data-testid={`mz-tag-${d}`}
                    className={`mz-tag ${tagesEintraege.length > 0 ? "belegt" : ""} ${d === HEUTE ? "heute" : ""} ${["Sa", "So"].includes(datumAnzeige(d).slice(0, 2)) ? "we" : ""}`}
                    disabled={sperre}
                    title={zukunft ? "Dieser Tag liegt in der Zukunft." : datumAnzeige(d)}
                    onClick={() => setBearbeitet({ tag: d, eintrag: null })}
                  >
                    <span className="nr">{Number(d.slice(8))}</span>
                    {tagesEintraege.length > 0 ? <span className="std">{stundenMinuten(min)}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt2"><SummenLeiste s={su} /></div>
          </Karte>

          {z.eintraege.length > 0 ? (
            <Karte titel="Deine Einträge">
              <div className="col">
                {sortiert(z.eintraege).map((e) => (
                  <button key={e.id} type="button" className="mz-zeile" data-testid={`mz-eintrag-${e.id}`} onClick={() => setBearbeitet({ tag: e.datum, eintrag: e })}>
                    <span><b>{datumAnzeige(e.datum)}</b><div className="tiny muted">{[e.taetigkeit, e.fahrten.length > 0 ? `${e.fahrten.length} Fahrt` : "", e.sonderabsprache ? "Absprache" : "", e.getan ? "Beschreibung" : ""].filter(Boolean).join(" · ") || "ohne Zusatzangaben"}</div></span>
                    <span className="mono">{e.start}–{e.ende} · {formatDezimal(dezimal(eintragMinuten(e)))} h</span>
                  </button>
                ))}
              </div>
            </Karte>
          ) : null}

          {!gesperrt ? (
            <Karte titel="Monat abschließen" aktionen={<Offen>Frage 3</Offen>}>
              <p className="small">Am Monatsende prüfst du alles und unterschreibst. Danach bekommt der Kunde den Zettel zur Unterschrift. Du kannst auch zwischendurch hier weitermachen – die Einträge bleiben gespeichert.</p>
              {abschluss.gruende.length > 0 && z.eintraege.length > 0 ? <Note ton="warn"><b>Bitte erst korrigieren:</b><ul style={{ margin: "0.3rem 0 0 1rem" }}>{abschluss.gruende.map((g) => <li key={g}>{g}</li>)}</ul></Note> : null}
              <label className="pv-check mt2"><input type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)} data-testid="mz-haken" /><span>Meine Angaben sind richtig und vollständig.</span></label>
              <div className="mt2"><Signatur de onChange={setUnterschrift} /></div>
              <div className="mt2"><Btn block disabled={!haken || !unterschrift || !abschluss.ok} onClick={unterschreiben} data-testid="mz-abschliessen">Unterschreiben und an den Kunden weitergeben</Btn></div>
            </Karte>
          ) : null}
        </div>
      </main>

      {bearbeitet ? <TagDialog z={z} tag={bearbeitet.tag} eintrag={bearbeitet.eintrag} letzter={letzter} gesperrt={gesperrt} onClose={() => setBearbeitet(null)} onSpeichern={speichereEintrag} onLoeschen={loescheEintrag} /> : null}
    </div>
  );
}

function TagDialog({ z, tag, eintrag, letzter, gesperrt, onClose, onSpeichern, onLoeschen }: { z: MonatsZettel; tag: string; eintrag: MonatsEintrag | null; letzter: MonatsEintrag | null; gesperrt: boolean; onClose: () => void; onSpeichern: (e: MonatsEintrag) => void; onLoeschen: (id: string) => void }) {
  const vorhanden = z.eintraege.filter((e) => e.datum === tag);
  const [e, setE] = useState<MonatsEintrag>(() => eintrag ?? leererEintrag(tag));
  const [fehler, setFehler] = useState<string[]>([]);
  const bestehend = z.eintraege.some((x) => x.id === e.id);
  const patch = (p: Partial<MonatsEintrag>) => setE((x) => ({ ...x, ...p }));
  const setzeFahrt = (i: number, p: Partial<Fahrt>) => patch({ fahrten: e.fahrten.map((f, j) => (j === i ? { ...f, ...p } : f)) });

  const speichern = () => {
    const f = pruefeEintrag(e, z.monat);
    setFehler(f);
    if (f.length > 0) return;
    onSpeichern(e);
    onClose();
  };
  const wieLetzter = () => {
    if (!letzter) return;
    setE((x) => ({ ...x, start: letzter.start, ende: letzter.ende, pauseMin: letzter.pauseMin, taetigkeit: letzter.taetigkeit, fahrten: letzter.fahrten.map((f) => ({ ...f })), privatPkw: letzter.privatPkw }));
  };

  return (
    <Modal
      titel={datumAnzeige(tag)}
      onClose={onClose}
      fuss={
        gesperrt ? (
          <Btn v="sec" onClick={onClose}>Schließen</Btn>
        ) : (
          <>
            {bestehend ? <Btn v="ghost" onClick={() => { onLoeschen(e.id); onClose(); }} data-testid="mz-loeschen">Eintrag löschen</Btn> : null}
            <Btn v="sec" onClick={onClose}>Abbrechen</Btn>
            <Btn onClick={speichern} data-testid="mz-speichern">Speichern</Btn>
          </>
        )
      }
    >
      <div className="col gap2" data-testid="mz-dialog">
        {vorhanden.length > 0 && !bestehend ? (
          <Note>An diesem Tag ist schon {vorhanden.length === 1 ? "ein Eintrag" : `${vorhanden.length} Einträge`} ({vorhanden.map((v) => `${v.start}–${v.ende}`).join(", ")}). Du kannst einen weiteren Zeitraum ergänzen, zum Beispiel bei geteilter Schicht.</Note>
        ) : null}
        {gesperrt ? <Note>Du hast unterschrieben – die Einträge sind gesperrt.</Note> : null}
        <fieldset disabled={gesperrt} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="col gap2">
            <div className="pva-grid c3">
              <Feld label="Beginn"><input className="pv-input" type="time" value={e.start} onChange={(ev) => patch({ start: ev.target.value })} data-testid="mz-start" /></Feld>
              <Feld label="Ende"><input className="pv-input" type="time" value={e.ende} onChange={(ev) => patch({ ende: ev.target.value })} data-testid="mz-ende" /></Feld>
              <Feld label="Pause (Min.)"><input className="pv-input" type="number" min={0} step={5} inputMode="numeric" value={Number.isFinite(e.pauseMin) ? e.pauseMin : ""} onChange={(ev) => patch({ pauseMin: ev.target.value === "" ? 0 : Number(ev.target.value) })} data-testid="mz-pause" /></Feld>
            </div>
            <div className="row wrap">{[0, 15, 30, 45, 60].map((m) => <button key={m} type="button" className={`pv-chip ${e.pauseMin === m ? "navy" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => patch({ pauseMin: m })}>{m === 0 ? "keine Pause" : `${m} min`}</button>)}
              {letzter ? <Btn v="ghost" groesse="sm" onClick={wieLetzter} data-testid="mz-wie-letzter">Wie letzter Eintrag</Btn> : null}</div>
            <Feld label="Tätigkeit (freiwillig)"><input className="pv-input" placeholder="z. B. Stagehand, Einlass, Logistik" value={e.taetigkeit} onChange={(ev) => patch({ taetigkeit: ev.target.value })} data-testid="mz-taetigkeit" /></Feld>

            <div className="pv-card flat" style={{ background: "var(--mist)" }}>
              <div className="row between"><b>Fahrten</b><Btn v="sec" groesse="sm" onClick={() => patch({ fahrten: [...e.fahrten, { von: "", nach: "", km: null }] })} data-testid="mz-fahrt-neu">+ Fahrt</Btn></div>
              {e.fahrten.map((f, i) => (
                <div key={i} className="pva-grid c3 mt1">
                  <input className="pv-input sm" placeholder="Start-Ort" aria-label={`Fahrt ${i + 1} von`} value={f.von} onChange={(ev) => setzeFahrt(i, { von: ev.target.value })} data-testid={`mz-fahrt-von-${i}`} />
                  <input className="pv-input sm" placeholder="Ziel-Ort" aria-label={`Fahrt ${i + 1} nach`} value={f.nach} onChange={(ev) => setzeFahrt(i, { nach: ev.target.value })} data-testid={`mz-fahrt-nach-${i}`} />
                  <div className="row"><input className="pv-input sm" placeholder="km" inputMode="decimal" aria-label={`Fahrt ${i + 1} km`} value={f.km ?? ""} onChange={(ev) => setzeFahrt(i, { km: ev.target.value === "" ? null : Number(ev.target.value.replace(",", ".")) })} data-testid={`mz-fahrt-km-${i}`} /><Btn v="ghost" groesse="sm" aria-label={`Fahrt ${i + 1} entfernen`} onClick={() => patch({ fahrten: e.fahrten.filter((_, j) => j !== i) })}>✕</Btn></div>
                </div>
              ))}
              {e.fahrten.length > 0 ? <label className="pv-check mt2"><input type="checkbox" checked={e.privatPkw} onChange={(ev) => patch({ privatPkw: ev.target.checked })} data-testid="mz-privat-pkw" /><span>Mit meinem privaten PKW gefahren</span></label> : null}
            </div>

            <Feld label="Spesen in € (freiwillig)"><input className="pv-input" inputMode="decimal" placeholder="z. B. 14,00" value={e.spesen ?? ""} onChange={(ev) => patch({ spesen: ev.target.value === "" ? null : Number(ev.target.value.replace(",", ".")) })} data-testid="mz-spesen" /></Feld>
            <Feld label="Sonderabsprache (freiwillig)" hint="Alles, was mit dem Kunden oder FESS besonders vereinbart wurde."><textarea className="pv-textarea" rows={2} value={e.sonderabsprache} onChange={(ev) => patch({ sonderabsprache: ev.target.value })} data-testid="mz-sonderabsprache" /></Feld>
            <Feld label="Was wurde gemacht? (freiwillig)"><textarea className="pv-textarea" rows={2} value={e.getan} onChange={(ev) => patch({ getan: ev.target.value })} data-testid="mz-getan" /></Feld>
            <Feld label="Notiz (freiwillig)"><input className="pv-input" value={e.notiz} onChange={(ev) => patch({ notiz: ev.target.value })} data-testid="mz-notiz" /></Feld>
          </div>
        </fieldset>
        {fehler.length > 0 ? <div className="pv-error" role="alert" data-testid="mz-fehler">{fehler.map((f) => <div key={f}>{f}</div>)}</div> : null}
        <div className="tiny muted">{formatDatumDE(tag)} · {formatDezimal(dezimal(eintragMinuten(e)))} h netto</div>
      </div>
    </Modal>
  );
}
