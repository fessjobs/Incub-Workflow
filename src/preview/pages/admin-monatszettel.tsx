"use client";
// Dashboard: Monatsstundenzettel für Personen, die dauerhaft für einen Kunden arbeiten (ohne Auftrag je Einsatz).
// Kunde und Monat wählen, Personen ankreuzen, Links erstellen und als Nachricht verschicken; Stand je Person und Kunde.
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, HEUTE, neueAudit } from "../state/store";
import { Btn, Chip, Feld, Kopf, Karte, Note, Offen, Stat, kopiere } from "../ui/kit";
import { initialisiereMz, setzeMz } from "../state/monatszettel-store";
import { NurTestversion, StatusChip, SummenLeiste, EintragsTabelle, Unterschriftsbild, useMzBereit } from "./monat-teile";
import { STANDARD_VORLAGE, alsStundenZeilen, beispielToken, fuelleVorlage, kundenLink, monatListeUm, personenLink, summe, waLink, zettelStatus, type MonatsKunde, type MonatsZettel } from "../logic/monatszettel";
import { formatDezimal } from "../logic/zeit";
import { monatsName, vollName } from "./helfer";
import { bearbeiter } from "./stunden-aktionen";
import type { Crew } from "../logic/types";

export function AdminMonatszettel() {
  const mz = useMzBereit();
  const { s, melde } = usePv();
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [vorlageOffen, setVorlageOffen] = useState(false);

  const kundenListe = useMemo(() => [...new Set([...s.jobs.map((j) => j.kunde), ...s.auftraege.map((a) => a.kunde), ...(mz?.zettel.map((z) => z.kunde) ?? [])])].sort((a, b) => a.localeCompare(b, "de")), [s.jobs, s.auftraege, mz?.zettel]);
  const personen = useMemo(() => s.crew.filter((c) => c.status === "aktiv").sort((a, b) => a.nachname.localeCompare(b.nachname, "de")), [s.crew]);

  if (!mz) return <div className="muted small">…</div>;
  const { auswahlKunde: kunde, auswahlMonat: monat } = mz;
  const monate = monatListeUm(HEUTE);
  const zettel = mz.zettel.filter((z) => z.kunde === kunde && z.monat === monat);
  const kundenInfo = mz.kunden.find((k) => k.kunde === kunde && k.monat === monat);
  const sichtbar = personen.filter((c) => !suche.trim() || `${vollName(c)} ${c.pnr}`.toLowerCase().includes(suche.trim().toLowerCase()));
  const crewVon = (pnr: string): Crew | undefined => s.crew.find((c) => c.pnr === pnr);
  const stundenBeiKunde = (pnr: string) => s.stunden.filter((r) => r.pnr === pnr && r.kunde === kunde).length;

  const setzeAuswahl = (p: { auswahlKunde?: string; auswahlMonat?: string }) => setzeMz((st) => ({ ...st, ...p }));
  const umschalten = (pnr: string) => setGewaehlt((g) => (g.includes(pnr) ? g.filter((x) => x !== pnr) : [...g, pnr]));

  const linksErstellen = () => {
    if (!kunde.trim() || gewaehlt.length === 0) return;
    const neu = gewaehlt.filter((pnr) => !zettel.some((z) => z.pnr === pnr));
    setzeMz((st) => {
      const start = st.zettel.length;
      const neueZettel: MonatsZettel[] = neu.map((pnr, i) => ({
        id: `MZ-${monat.replace("-", "")}-${String(start + i + 1).padStart(2, "0")}`, token: beispielToken("m", start + i + 10), pnr, kunde: kunde.trim(), monat, eintraege: [], gesendetAm: null,
        personUnterschriftAm: null, personUnterschrift: null, kundeStatus: "offen", kundeAm: null, kundeName: "", kundeFunktion: "", kundeHinweis: "", kundeUnterschrift: null, inStundentabelle: false,
      }));
      const kundenNeu: MonatsKunde[] = st.kunden.some((k) => k.kunde === kunde.trim() && k.monat === monat) ? st.kunden : [...st.kunden, { kunde: kunde.trim(), monat, token: beispielToken("k", st.kunden.length + 10), kontakt: "" }];
      return { ...st, auswahlKunde: kunde.trim(), zettel: [...st.zettel, ...neueZettel], kunden: kundenNeu };
    });
    melde(neu.length > 0 ? `${neu.length} Monatslink${neu.length === 1 ? "" : "s"} erstellt.` : "Für alle Gewählten gibt es schon einen Link.");
    setGewaehlt([]);
  };

  const nachricht = (z: MonatsZettel): string => {
    const c = crewVon(z.pnr);
    return fuelleVorlage(mz.vorlage, { vorname: c?.vorname ?? "", kunde: z.kunde, monat: monatsName(z.monat), link: personenLink(z.token) });
  };
  const alsGesendet = (id: string) => setzeMz((st) => ({ ...st, zettel: st.zettel.map((z) => (z.id === id ? { ...z, gesendetAm: z.gesendetAm ?? new Date().toISOString() } : z)) }));

  const zaehler = {
    gesamt: zettel.length,
    gesendet: zettel.filter((z) => z.gesendetAm).length,
    wartetKunde: zettel.filter((z) => zettelStatus(z) === "wartet_kunde").length,
    fertig: zettel.filter((z) => zettelStatus(z) === "fertig").length,
    offen: zettel.filter((z) => ["leer", "in_arbeit", "zurueck"].includes(zettelStatus(z))).length,
  };
  const stunden = zettel.reduce((m, z) => m + summe(z).stunden, 0);

  return (
    <div className="col gap3" data-testid="admin-monatszettel">
      <Kopf eyebrow="Abrechnung" titel="Monatszettel" sub="Für Personen, die laufend für einen Kunden arbeiten: ein Zettel pro Person und Monat, ausgefüllt am Handy, unterschrieben von der Person und vom Kunden." aktionen={<Btn v="ghost" onClick={() => { initialisiereMz(s.crew, HEUTE, true); setGewaehlt([]); melde("Beispiel zurückgesetzt."); }} data-testid="mz-zuruecksetzen">Beispiel zurücksetzen</Btn>} />
      <NurTestversion />
      <Note>Das ist ein Klick-Prototyp mit Beispieldaten: Mit „Als Person öffnen“ siehst du den Zettel am Handy, mit „Kundenlink öffnen“ die Seite des Kunden. Gelbe <Offen /> Markierungen sind offene Entscheidungen – „Frage 1–5“ entsprechen den fünf Rückfragen.</Note>

      <Karte titel="1 · Kunde und Monat" aktionen={<Offen>Frage 4 · Auswahl, Link pro Monat</Offen>}>
        <div className="pva-grid c2">
          <Feld label="Kunde" hint="Aus deinen Aufträgen, oder einen neuen Namen eintippen."><input className="pv-input" list="mz-kunden" value={kunde} onChange={(e) => setzeAuswahl({ auswahlKunde: e.target.value })} data-testid="mz-kunde-wahl" /></Feld>
          <Feld label="Monat"><select className="pv-select" value={monat} onChange={(e) => setzeAuswahl({ auswahlMonat: e.target.value })} data-testid="mz-monat-wahl">{monate.map((m) => <option key={m.wert} value={m.wert}>{m.label}</option>)}</select></Feld>
        </div>
        <datalist id="mz-kunden">{kundenListe.map((k) => <option key={k} value={k} />)}</datalist>
      </Karte>

      <Karte titel="2 · Personen auswählen">
        <div className="row wrap">
          <input className="pv-input" style={{ maxWidth: 260 }} placeholder="Name oder Personalnummer" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Person suchen" />
          <Btn v="sec" groesse="sm" onClick={() => setGewaehlt(sichtbar.map((c) => c.pnr))}>Alle {sichtbar.length} anzeigen auswählen</Btn>
          <Btn v="ghost" groesse="sm" onClick={() => setGewaehlt([])}>Auswahl leeren</Btn>
        </div>
        <div className="mz-personen mt2" data-testid="mz-personen">
          {sichtbar.slice(0, 60).map((c) => {
            const hat = zettel.find((z) => z.pnr === c.pnr);
            const frueher = stundenBeiKunde(c.pnr);
            return (
              <label key={c.pnr} className="pv-check mz-person-zeile">
                <input type="checkbox" checked={gewaehlt.includes(c.pnr)} onChange={() => umschalten(c.pnr)} disabled={Boolean(hat)} data-testid={`mz-wahl-${c.pnr}`} />
                <span className="grow"><b>{vollName(c)}</b> <span className="muted small">· {c.pnr}</span>{frueher > 0 ? <span className="tiny muted"> · {frueher} Zeilen bei diesem Kunden</span> : null}</span>
                {hat ? <Chip ton="info">hat Link</Chip> : null}
              </label>
            );
          })}
          {sichtbar.length === 0 ? <div className="muted small">Niemand gefunden.</div> : null}
        </div>
        <div className="row mt2">
          <Btn onClick={linksErstellen} disabled={!kunde.trim() || gewaehlt.length === 0} data-testid="mz-links-erstellen">Monatslinks erstellen{gewaehlt.length > 0 ? ` (${gewaehlt.length})` : ""}</Btn>
          <span className="small muted">Jede Person bekommt einen eigenen Link für {kunde.trim() || "den Kunden"} im {monatsName(monat)}.</span>
        </div>
      </Karte>

      <div className="pva-grid c4">
        <Stat wert={zaehler.gesamt} label="Zettel in dieser Auswahl" />
        <Stat wert={zaehler.offen} label="noch offen" ton={zaehler.offen ? "warn" : "gut"} />
        <Stat wert={zaehler.wartetKunde} label="warten auf den Kunden" ton={zaehler.wartetKunde ? "warn" : undefined} />
        <Stat wert={zaehler.fertig} label="von beiden unterschrieben" ton={zaehler.fertig ? "gut" : undefined} />
      </div>

      <Karte titel={`3 · Übersicht ${kunde.trim() || "–"} · ${monatsName(monat)}`} aktionen={<Offen>Frage 5 · Ergebnis und Prüfung</Offen>}>
        {zettel.length === 0 ? (
          <p className="muted">Noch keine Zettel für diese Auswahl. Wähle oben Personen und erstelle die Links.</p>
        ) : (
          <>
            {zaehler.offen === 0 && zaehler.wartetKunde > 0 ? <Note ton="warn"><b>Alle Personen haben unterschrieben.</b> Jetzt kannst du den Kundenlink verschicken.</Note> : null}
            {zaehler.offen > 0 && monat < HEUTE.slice(0, 7) ? <Note ton="warn"><b>Der Monat ist vorbei, aber {zaehler.offen} {zaehler.offen === 1 ? "Zettel ist" : "Zettel sind"} noch offen.</b> Erinnere die Personen mit einer Nachricht.</Note> : null}
            <div className="pv-scroll mt2">
              <table className="pv-table" data-testid="mz-tabelle">
                <thead><tr><th>Person</th><th>Stand</th><th>Tage / Stunden</th><th>Nachricht</th><th>Ansehen</th></tr></thead>
                <tbody>
                  {zettel.map((z) => {
                    const c = crewVon(z.pnr);
                    const su = summe(z);
                    return (
                      <tr key={z.id} data-testid={`mz-zeile-${z.pnr}`}>
                        <td><b>{c ? vollName(c) : z.pnr}</b><div className="tiny muted mono">{z.pnr}</div></td>
                        <td><StatusChip z={z} />{z.gesendetAm ? <div className="tiny muted mt1">Link versendet</div> : <div className="tiny muted mt1">Link noch nicht versendet</div>}</td>
                        <td className="mono">{su.tage} / {formatDezimal(su.stunden)} h</td>
                        <td>
                          <div className="row wrap">
                            <Btn v="sec" groesse="sm" onClick={async () => { melde((await kopiere(nachricht(z))) ? "Nachricht kopiert." : "Kopieren nicht möglich."); alsGesendet(z.id); }} data-testid={`mz-kopieren-${z.pnr}`}>Kopieren</Btn>
                            {c?.telefon ? <a className="pv-btn sec sm" href={waLink(c.telefon, nachricht(z))} target="_blank" rel="noreferrer" onClick={() => alsGesendet(z.id)} data-testid={`mz-wa-${z.pnr}`}>WhatsApp</a> : null}
                          </div>
                        </td>
                        <td>
                          <div className="row wrap">
                            <Link href={`/m/${z.token}`} className="pv-btn sec sm" data-testid={`mz-person-oeffnen-${z.pnr}`}>Als Person öffnen</Link>
                            <Link href={`/admin/monatszettel/${z.id}`} className="pv-btn ghost sm" data-testid={`mz-detail-${z.pnr}`}>Details / PDF</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pv-card flat mt3" style={{ background: "var(--mist)" }} data-testid="mz-kundenbox">
              <div className="row between wrap"><h3>Link für den Kunden</h3><Chip ton={zaehler.fertig === zaehler.gesamt && zaehler.gesamt > 0 ? "gut" : zaehler.wartetKunde > 0 ? "warn" : undefined}>{zaehler.fertig} von {zaehler.gesamt} bestätigt</Chip></div>
              <p className="small mt1">Der Kunde sieht alle Personen dieses Monats auf einer Seite und unterschreibt einmal. Es zählen nur Zettel, die die Person schon unterschrieben hat ({formatDezimal(stunden)} Stunden insgesamt).</p>
              {kundenInfo ? (
                <div className="col gap1 mt2">
                  <Feld label="Ansprechpartner beim Kunden (nur zur Information)"><input className="pv-input" value={kundenInfo.kontakt} onChange={(e) => setzeMz((st) => ({ ...st, kunden: st.kunden.map((k) => (k === kundenInfo || (k.kunde === kunde && k.monat === monat) ? { ...k, kontakt: e.target.value } : k)) }))} placeholder="z. B. Frau Berger, Hallenleitung" data-testid="mz-kontakt" /></Feld>
                  <div className="mono small" data-testid="mz-kundenlink" style={{ wordBreak: "break-all" }}>{kundenLink(kundenInfo.token)}</div>
                  <div className="row wrap">
                    <Btn v="sec" groesse="sm" onClick={async () => melde((await kopiere(`Guten Tag${kundenInfo.kontakt ? ` ${kundenInfo.kontakt.split(" (")[0]}` : ""}, hier sind die Stunden unserer Mitarbeiter für ${monatsName(monat)}. Bitte kurz prüfen und unterschreiben: ${kundenLink(kundenInfo.token)}`)) ? "Nachricht an den Kunden kopiert." : "Kopieren nicht möglich.")} data-testid="mz-kundenlink-kopieren">Nachricht an den Kunden kopieren</Btn>
                    <Link href={`/k/${kundenInfo.token}`} className="pv-btn sm" data-testid="mz-kundenlink-oeffnen">Kundenlink öffnen</Link>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Karte>

      <Karte titel="Nachrichtentext" aktionen={<Btn v="ghost" groesse="sm" onClick={() => setVorlageOffen(!vorlageOffen)}>{vorlageOffen ? "Zuklappen" : "Ansehen und ändern"}</Btn>}>
        {vorlageOffen ? (
          <div className="col gap1">
            <textarea className="pv-textarea" rows={5} value={mz.vorlage} onChange={(e) => setzeMz((st) => ({ ...st, vorlage: e.target.value }))} aria-label="Nachrichtentext" data-testid="mz-vorlage" />
            <div className="pv-hint">Platzhalter: {"{vorname}"}, {"{kunde}"}, {"{monat}"}, {"{link}"}.</div>
            <div><Btn v="ghost" groesse="sm" onClick={() => setzeMz((st) => ({ ...st, vorlage: STANDARD_VORLAGE }))}>Standardtext</Btn></div>
          </div>
        ) : (
          <div className="small" style={{ whiteSpace: "pre-wrap" }}>{zettel[0] ? nachricht(zettel[0]) : fuelleVorlage(mz.vorlage, { vorname: "Anna", kunde: kunde || "Kunde", monat: monatsName(monat), link: personenLink("m-beispiel") })}</div>
        )}
      </Karte>

      <Karte titel="Wohin die Stunden gehen"><Offen>Frage 1 · neues System, nichts im bisherigen Einsatzmodul</Offen>
        <p className="small mt1">Nach der Unterschrift des Kunden übernimmst du den Zettel mit einem Klick in die <Link href="/admin/stunden">Stundentabelle</Link> (Status „offen“, Quelle „App“). Das bisherige Einsatzmodul bleibt unberührt.</p>
      </Karte>
    </div>
  );
}

export function AdminMonatszettelDetail({ id }: { id: string }) {
  const mz = useMzBereit();
  const { s, set, melde } = usePv();
  if (!mz) return <div className="muted small">…</div>;
  const z = mz.zettel.find((x) => x.id === id);
  if (!z) return <Note ton="err">Zettel nicht gefunden. <Link href="/admin/monatszettel">Zur Übersicht</Link></Note>;
  const c = s.crew.find((x) => x.pnr === z.pnr);
  const kundenInfo = mz.kunden.find((k) => k.kunde === z.kunde && k.monat === z.monat);
  const st = zettelStatus(z);
  const su = summe(z);

  const uebernehmen = () => {
    if (z.inStundentabelle || st !== "fertig") return;
    const zeilen = alsStundenZeilen(z);
    set((p) => ({ ...p, stunden: [...p.stunden, ...zeilen], audit: [neueAudit(bearbeiter(), "time_entries", z.id, "Monatszettel", "", `${zeilen.length} Zeilen aus ${z.id} übernommen`, `${z.kunde}, ${monatsName(z.monat)}`), ...p.audit] }));
    setzeMz((m) => ({ ...m, zettel: m.zettel.map((x) => (x.id === z.id ? { ...x, inStundentabelle: true } : x)) }));
    melde(`${zeilen.length} Zeilen in die Stundentabelle übernommen.`);
  };

  return (
    <div className="col gap3" data-testid="mz-detail">
      <div className="pv-noprint"><Link href="/admin/monatszettel" className="small">← Alle Monatszettel</Link></div>
      <Kopf eyebrow={z.id} titel={`${c ? vollName(c) : z.pnr} · ${monatsName(z.monat)}`} sub={z.kunde} aktionen={
        <div className="row wrap pv-noprint">
          <StatusChip z={z} />
          <Link href={`/m/${z.token}`} className="pv-btn sec sm">Als Person öffnen</Link>
          {kundenInfo ? <Link href={`/k/${kundenInfo.token}`} className="pv-btn sec sm">Kundenlink öffnen</Link> : null}
          <Btn groesse="sm" onClick={() => window.print()} data-testid="mz-pdf">Als PDF speichern</Btn>
        </div>
      } />
      <NurTestversion />

      <div className="pv-noprint">
        <Karte titel="In die Stundentabelle übernehmen" aktionen={<Offen>Frage 5 · Prüfung durch dich / Buchhaltung, Zuschläge</Offen>}>
          {z.inStundentabelle ? (
            <Note ton="ok"><span data-testid="mz-uebernommen">✓ Die {z.eintraege.length} Zeilen stehen in der <Link href="/admin/stunden">Stundentabelle</Link> (Status „offen“). Dort prüfst und gibst du sie wie gewohnt frei.</span></Note>
          ) : st === "fertig" ? (
            <div className="row"><Btn onClick={uebernehmen} data-testid="mz-uebernehmen">{z.eintraege.length} Zeilen in die Stundentabelle übernehmen</Btn><span className="small muted">Beide Unterschriften liegen vor.</span></div>
          ) : (
            <p className="small muted">Erst wenn Person und Kunde unterschrieben haben, lässt sich der Zettel übernehmen.</p>
          )}
        </Karte>
      </div>

      <div className="pv-card mz-blatt" data-testid="mz-blatt">
        <div className="row between"><div><div className="eyebrow">fess.jobs · FESS recruitment GmbH &amp; Co. KG</div><h2>Monatsstundenzettel {monatsName(z.monat)}</h2></div><div className="mono small" style={{ textAlign: "right" }}>{z.id}</div></div>
        <div className="pva-grid c3 mt2">
          <div><div className="tiny muted">Mitarbeiter</div><b>{c ? vollName(c) : z.pnr}</b> <span className="mono small">({z.pnr})</span></div>
          <div><div className="tiny muted">Kunde</div><b>{z.kunde}</b></div>
          <div><div className="tiny muted">Summe</div><b className="mono">{formatDezimal(su.stunden)} h</b> <span className="small muted">an {su.tage} Tagen</span></div>
        </div>
        <div className="mt2"><EintragsTabelle z={z} /></div>
        <div className="mt2 pv-noprint"><SummenLeiste s={su} /></div>
        <div className="row wrap mt3" style={{ gap: "2rem", alignItems: "flex-end" }}>
          <Unterschriftsbild bild={z.personUnterschrift} label={`${c ? vollName(c) : z.pnr} (Mitarbeiter)`} zeit={z.personUnterschriftAm} />
          <Unterschriftsbild bild={z.kundeUnterschrift} label={z.kundeName ? `${z.kundeName}${z.kundeFunktion ? `, ${z.kundeFunktion}` : ""} (${z.kunde})` : `${z.kunde} (Kunde)`} zeit={z.kundeAm} />
        </div>
        <div className="tiny muted mt2">Erzeugt aus den Angaben der Person; die Unterschriften wurden im Browser geleistet. Im echten System entsteht daraus ein unveränderliches PDF mit Prüfsumme.</div>
      </div>
    </div>
  );
}
