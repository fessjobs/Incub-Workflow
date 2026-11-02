"use client";
// Kundenlink /k/:token – der Kunde sieht am Monatsende die Stundenzettel aller Personen und bestätigt sie mit einer
// Unterschrift, oder gibt einen Zettel mit Hinweis an die Person zurück.
import { useState } from "react";
import { usePv } from "../state/store";
import { Btn, Chip, Feld, Karte, Note, Offen } from "../ui/kit";
import { Signatur } from "../ui/signatur";
import { setzeMz } from "../state/monatszettel-store";
import { EintragsTabelle, NurTestversion, StatusChip, SummenLeiste, Unterschriftsbild, useMzBereit } from "./monat-teile";
import { summe, zettelStatus, type MonatsZettel } from "../logic/monatszettel";
import { formatDezimal } from "../logic/zeit";
import { monatsName } from "./helfer";

export function MonatKunde({ token }: { token: string }) {
  const mz = useMzBereit();
  const { s } = usePv();
  const [offen, setOffen] = useState<string | null>(null);
  const [rueckgabe, setRueckgabe] = useState<{ id: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [funktion, setFunktion] = useState("");
  const [haken, setHaken] = useState(false);
  const [unterschrift, setUnterschrift] = useState<string | null>(null);
  const [fertig, setFertig] = useState<number | null>(null);

  const kopf = <header className="pvc-top"><span className="pv-wordmark">fess<span style={{ color: "var(--orange)" }}>.</span>jobs</span><span className="small">Stundenbestätigung</span></header>;
  if (!mz) return <div className="pvc">{kopf}<main className="pvc-main"><div className="muted small">…</div></main></div>;
  const kunde = mz.kunden.find((k) => k.token === token);
  if (!kunde) return <div className="pvc">{kopf}<main className="pvc-main"><Karte><h2>Link nicht gefunden</h2><p className="muted mt1">Dieser Link ist ungültig oder abgelaufen.</p></Karte></main></div>;

  const zettel = mz.zettel.filter((z) => z.kunde === kunde.kunde && z.monat === kunde.monat);
  const bereit = zettel.filter((z) => zettelStatus(z) === "wartet_kunde");
  const name_von = (z: MonatsZettel) => { const c = s.crew.find((x) => x.pnr === z.pnr); return c ? `${c.vorname} ${c.nachname}` : z.pnr; };
  const aendere = (id: string, fn: (z: MonatsZettel) => MonatsZettel) => setzeMz((st) => ({ ...st, zettel: st.zettel.map((x) => (x.id === id ? fn(x) : x)) }));

  const zurueckgeben = () => {
    if (!rueckgabe || rueckgabe.text.trim() === "") return;
    aendere(rueckgabe.id, (z) => ({ ...z, kundeStatus: "zurueckgegeben", kundeHinweis: rueckgabe.text.trim(), kundeAm: new Date().toISOString(), personUnterschriftAm: null, personUnterschrift: null }));
    setRueckgabe(null);
  };
  const bestaetigen = () => {
    if (!haken || !unterschrift || name.trim() === "" || bereit.length === 0) return;
    const jetzt = new Date().toISOString();
    setzeMz((st) => ({ ...st, zettel: st.zettel.map((z) => (bereit.some((b) => b.id === z.id) ? { ...z, kundeStatus: "unterschrieben", kundeAm: jetzt, kundeName: name.trim(), kundeFunktion: funktion.trim(), kundeUnterschrift: unterschrift } : z)) }));
    setFertig(bereit.length);
  };
  const gesamtStunden = bereit.reduce((m, z) => m + summe(z).stunden, 0);

  return (
    <div className="pvc" data-testid="mz-kunde">
      {kopf}
      <main className="pvc-main" style={{ paddingBottom: "2rem", maxWidth: 900, margin: "0 auto" }}>
        <div className="col gap2">
          <div>
            <div className="eyebrow">Stundenbestätigung</div>
            <h1>{monatsName(kunde.monat)}</h1>
            <div className="small muted">{kunde.kunde} · {kunde.kontakt}</div>
          </div>
          <NurTestversion />
          <p className="small">Bitte prüfen Sie die Stunden der Mitarbeiter von FESS im {monatsName(kunde.monat)}. Mit Ihrer Unterschrift bestätigen Sie die Angaben der Personen, die schon unterschrieben haben. Stimmt bei jemandem etwas nicht, geben Sie den Zettel mit einem Hinweis zurück.</p>

          {zettel.map((z) => {
            const st = zettelStatus(z);
            const aufgeklappt = offen === z.id;
            return (
              <Karte key={z.id}>
                <div className="row between" data-testid={`mk-zettel-${z.pnr}`}>
                  <div><b>{name_von(z)}</b> <span className="muted small">· {z.pnr}</span><div className="mt1"><StatusChip z={z} /></div></div>
                  <div className="row">{st === "wartet_kunde" || st === "fertig" ? <span className="mono"><b>{formatDezimal(summe(z).stunden)} h</b></span> : null}
                    {st === "wartet_kunde" || st === "fertig" ? <Btn v="sec" groesse="sm" onClick={() => setOffen(aufgeklappt ? null : z.id)} data-testid={`mk-ansehen-${z.pnr}`}>{aufgeklappt ? "Zuklappen" : "Ansehen"}</Btn> : null}</div>
                </div>
                {st === "leer" || st === "in_arbeit" || st === "zurueck" ? <div className="small muted mt1">Noch nicht abgeschlossen – der Zettel erscheint hier zur Bestätigung, sobald {name_von(z).split(" ")[0]} unterschrieben hat.</div> : null}
                {st === "zurueck" ? <div className="small mt1">Zurückgegeben mit dem Hinweis: „{z.kundeHinweis}“</div> : null}
                {aufgeklappt ? (
                  <div className="col gap2 mt2" data-testid={`mk-detail-${z.pnr}`}>
                    <SummenLeiste s={summe(z)} />
                    <EintragsTabelle z={z} />
                    <div className="row wrap"><Unterschriftsbild bild={z.personUnterschrift} label={name_von(z)} zeit={z.personUnterschriftAm} />{st === "fertig" ? <Unterschriftsbild bild={z.kundeUnterschrift} label={`${z.kundeName}${z.kundeFunktion ? `, ${z.kundeFunktion}` : ""}`} zeit={z.kundeAm} /> : null}</div>
                    {st === "wartet_kunde" ? (
                      rueckgabe?.id === z.id ? (
                        <div className="col gap1">
                          <Feld label="Was stimmt nicht?"><textarea className="pv-textarea" rows={2} value={rueckgabe.text} onChange={(e) => setRueckgabe({ id: z.id, text: e.target.value })} data-testid={`mk-hinweis-${z.pnr}`} placeholder="z. B. Am 06.10. war Feierabend schon um 14:30." /></Feld>
                          <div className="row"><Btn onClick={zurueckgeben} disabled={rueckgabe.text.trim() === ""} data-testid={`mk-zurueck-senden-${z.pnr}`}>Zurückgeben</Btn><Btn v="ghost" onClick={() => setRueckgabe(null)}>Abbrechen</Btn></div>
                        </div>
                      ) : (
                        <div><Btn v="sec" onClick={() => setRueckgabe({ id: z.id, text: "" })} data-testid={`mk-zurueckgeben-${z.pnr}`}>Zurückgeben mit Hinweis</Btn></div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </Karte>
            );
          })}
          {zettel.length === 0 ? <Note>Für diesen Monat gibt es noch keine Zettel.</Note> : null}

          {fertig !== null ? (
            <Note ton="ok"><span data-testid="mk-fertig"><b>Danke!</b> Die Stunden von {fertig === 1 ? "einer Person" : `${fertig} Personen`} sind bestätigt. FESS hat Ihre Unterschrift erhalten.</span></Note>
          ) : (
            <Karte titel="Bestätigung" aktionen={<Offen>Frage 3 · eine Unterschrift für alle oder je Person?</Offen>}>
              {bereit.length === 0 ? (
                <p className="small muted">Es wartet kein Zettel auf Ihre Unterschrift.</p>
              ) : (
                <div className="col gap2">
                  <p className="small"><b>{bereit.length === 1 ? "1 Zettel wartet" : `${bereit.length} Zettel warten`}</b> auf Ihre Unterschrift ({formatDezimal(gesamtStunden)} Stunden insgesamt).</p>
                  <div className="pva-grid c2">
                    <Feld label="Ihr Name"><input className="pv-input" value={name} onChange={(e) => setName(e.target.value)} data-testid="mk-name" autoComplete="name" /></Feld>
                    <Feld label="Funktion (freiwillig)"><input className="pv-input" value={funktion} onChange={(e) => setFunktion(e.target.value)} data-testid="mk-funktion" placeholder="z. B. Hallenleitung" /></Feld>
                  </div>
                  <label className="pv-check"><input type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)} data-testid="mk-haken" /><span>Die oben gezeigten Stunden sind richtig.</span></label>
                  <Signatur de onChange={setUnterschrift} />
                  <Btn block disabled={!haken || !unterschrift || name.trim() === ""} onClick={bestaetigen} data-testid="mk-unterschreiben">Stunden bestätigen und unterschreiben</Btn>
                </div>
              )}
            </Karte>
          )}
          <div className="tiny muted"><Chip>fess.jobs</Chip> Dieser Link gilt nur für {kunde.kunde} und {monatsName(kunde.monat)}.</div>
        </div>
      </main>
    </div>
  );
}
