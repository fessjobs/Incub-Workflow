"use client";
import { useState } from "react";
import { Link } from "../nav";
import { usePv } from "../state/store";
import { Btn, Karte, LinkBtn, Note, Offen, kopiere, ladeTextHerunter } from "../ui/kit";

const RUNDGANG: Array<{ bereich: string; titel: string; wo: string; href: string; probier: string }> = [
  { bereich: "C", titel: "Mitarbeiter bewirbt sich", wo: "Mitarbeiterlink", href: "/crew", probier: "Anmelden → Fragebogen → Job → Bewerben (mit Unterweisung und Quiz)." },
  { bereich: "D", titel: "Crew-Fragebogen", wo: "Mitarbeiterlink", href: "/crew/fragebogen", probier: "6 Etappen, Zwischenspeichern, Deutsch/Englisch. Danach siehst du Mara im Dashboard unter Bewerber – mit Score." },
  { bereich: "G", titel: "Disposition", wo: "Dashboard", href: "/admin/dispo", probier: "Auftrag öffnen, Bewerber auf Schichten ziehen, Konflikt mit Begründung, „Automatisch füllen“, Briefing." },
  { bereich: "E", titel: "Stundentabelle", wo: "Dashboard", href: "/admin/stunden", probier: "Ein Monat Beispieldaten. Zellen bearbeiten (Tab/Enter), aus Excel einfügen, filtern, freigeben, exportieren." },
  { bereich: "F", titel: "Crew-Übersicht und Grenzen", wo: "Dashboard", href: "/admin/crew", probier: "Ampeln für Minijob, 70 Tage, Vertragsende; Karte; Profil einer Person." },
  { bereich: "B", titel: "Unterlagen-Archiv", wo: "Dashboard", href: "/admin/unterlagen", probier: "Alle Dokumente je Person und Auftrag, Suche, Filter." },
  { bereich: "A", titel: "Beleg-Link", wo: "Handy-Link", href: "/b/demo-token", probier: "Foto wählen, Betrag und Datum eintragen, Beiblatt prüfen, absenden – gelb markierte Abweichungen sehen." },
  { bereich: "C", titel: "Unterweisungen verwalten", wo: "Dashboard", href: "/admin/unterweisungen", probier: "Wer ist gültig, wer läuft ab, Texte (Entwurf) in Deutsch und Englisch." },
];

const OFFENE_PUNKTE: Array<{ nr: number; titel: string; annahme: string }> = [
  { nr: 12, titel: "Fragebogen-Link", annahme: "Merle verschickt den Link per WhatsApp an Bewerber; Text ist einstellbar." },
  { nr: 14, titel: "Papierzettel und Foto", annahme: "Vorerst weiter möglich: Zettel wird fotografiert und von der Dispo in die Tabelle übertragen (Quelle „Zettel“)." },
  { nr: 16, titel: "Kundenfreigabe (Phase 2)", annahme: "Nicht Teil dieses Prototyps. Die Spalte Status ist so angelegt, dass sie später ergänzt werden kann." },
  { nr: 17, titel: "Löschfrist Bewerber", annahme: "6 Monate nach der letzten Aktivität, danach Löschhinweis an den Admin (nicht automatisch)." },
  { nr: 18, titel: "Repo und Push-Rechte", annahme: "Arbeit nur auf dem Arbeitszweig; Veröffentlichung erst nach Freigabe je Bereich." },
];

export function Start() {
  const { s } = usePv();
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "1.4rem 1rem 4rem" }}>
      <div className="pv-hero">
        <div className="eyebrow">Phase 2 · Klick-Prototyp</div>
        <h1 className="mt1">So könnte es aussehen</h1>
        <p className="mt2" style={{ maxWidth: 560, opacity: 0.9 }}>
          Alles hier ist Beispiel: erfundene Personen, erfundene Aufträge, nichts wird gespeichert oder verschickt. Dein laufendes System ist nicht berührt. Schau dich um, klick alles an – und sag mir morgen, was bleibt, was anders soll.
        </p>
        <div className="row wrap mt3">
          <LinkBtn href="/admin" groesse="lg" data-testid="start-admin">
            Dashboard ansehen
          </LinkBtn>
          <LinkBtn href="/crew" v="sec" groesse="lg" className="" data-testid="start-crew">
            Mitarbeiterlink ansehen
          </LinkBtn>
        </div>
      </div>

      <h2 className="mt4">Rundgang in 8 Stationen</h2>
      <p className="muted mt1">Die Reihenfolge ist ein Vorschlag. Die Buchstaben sind die Bereiche A–G aus dem Ausbauplan.</p>
      <div className="pva-grid c2 mt2">
        {RUNDGANG.map((r, i) => (
          <Link key={i} href={r.href} className="pv-card" style={{ textDecoration: "none", display: "block" }}>
            <div className="row between">
              <h3>
                {i + 1}. {r.titel}
              </h3>
              <span className="pv-chip navy">Bereich {r.bereich}</span>
            </div>
            <div className="small muted mt1">{r.wo}</div>
            <div className="mt1" style={{ fontSize: "0.92rem" }}>
              {r.probier}
            </div>
          </Link>
        ))}
      </div>

      <h2 className="mt4">Was Annahme ist</h2>
      <p className="muted mt1">
        Wo der Plan etwas offen lässt, habe ich eine Annahme getroffen und sie so markiert: <Offen />. Die offenen Punkte aus dem Plan:
      </p>
      <div className="pv-card mt2">
        <table className="pv-table">
          <tbody>
            {OFFENE_PUNKTE.map((o) => (
              <tr key={o.nr}>
                <td style={{ width: 90 }}>
                  <Offen nr={o.nr} />
                </td>
                <td style={{ width: 200 }}>
                  <b>{o.titel}</b>
                </td>
                <td>{o.annahme}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pva-grid c2 mt3">
        <Note ton="warn">
          <b>Unterweisungstexte sind Entwürfe.</b> Sie sind nicht von einer Fachkraft für Arbeitssicherheit freigegeben und ersetzen weder die Unterweisung vor Ort noch beim Stapler den Fahrausweis.
        </Note>
        <Note>
          <b>Zu prüfen:</b> Minijob-Verdienstgrenze (hier 603 € als einstellbarer Wert), Lohnart für Bonus und Abzug (mit Daniel abstimmen), Level-Schwellen der XP.
        </Note>
      </div>
      <p className="small muted mt3">Stand der Beispieldaten: 09.10.2026 · {s.crew.length} Personen · {s.jobs.length} Aufträge · {s.stunden.length.toLocaleString("de-DE")} Stundenzeilen</p>
    </div>
  );
}

export function Notizen() {
  const { s, set, melde } = usePv();
  const [text, setText] = useState("");
  const [bereich, setBereich] = useState("Allgemein");
  const bereiche = ["Allgemein", "A Beleg-Link", "B Unterlagen", "C Job-Board/Unterweisung", "D Fragebogen", "E Stundentabelle", "F Crew-Übersicht", "G Disposition", "Design"];
  const alsText = () => s.notizen.map((n) => `[${n.bereich}] ${n.text}`).join("\n");
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.4rem 1rem 4rem" }}>
      <h1>Notizen</h1>
      <p className="muted mt1">Stichpunkte beim Durchklicken. Sie bleiben nur in diesem Browser-Tab – kopier sie am Ende raus und schick sie mir.</p>
      <Karte>
        <label className="pv-label" htmlFor="notiz-bereich">
          Bereich
        </label>
        <select id="notiz-bereich" className="pv-select" value={bereich} onChange={(e) => setBereich(e.target.value)}>
          {bereiche.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <label className="pv-label mt2" htmlFor="notiz-text">
          Notiz
        </label>
        <textarea id="notiz-text" className="pv-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Zum Beispiel: Spalte Bonus gehört vor Spesen." />
        <div className="row mt2">
          <Btn
            disabled={!text.trim()}
            onClick={() => {
              set((x) => ({ ...x, notizen: [...x.notizen, { id: `n${x.notizen.length + 1}`, zeit: new Date().toISOString(), bereich, text: text.trim() }] }));
              setText("");
              melde("Notiz gespeichert (nur in diesem Tab).");
            }}
          >
            Notiz hinzufügen
          </Btn>
        </div>
      </Karte>
      <div className="row between mt3">
        <h2>{s.notizen.length} Notizen</h2>
        <div className="row">
          <Btn
            v="sec"
            groesse="sm"
            disabled={!s.notizen.length}
            onClick={async () => melde((await kopiere(alsText())) ? "In die Zwischenablage kopiert." : "Kopieren nicht möglich – bitte per Hand markieren.")}
          >
            Alle kopieren
          </Btn>
          <Btn v="sec" groesse="sm" disabled={!s.notizen.length} onClick={() => ladeTextHerunter("notizen-testversion.txt", alsText(), "text/plain;charset=utf-8")}>
            Als Datei
          </Btn>
        </div>
      </div>
      <div className="col mt2">
        {s.notizen.length === 0 ? <div className="muted">Noch keine Notizen.</div> : null}
        {s.notizen.map((n) => (
          <div key={n.id} className="pv-card">
            <div className="row between">
              <span className="pv-chip navy">{n.bereich}</span>
              <Btn v="ghost" groesse="sm" onClick={() => set((x) => ({ ...x, notizen: x.notizen.filter((y) => y.id !== n.id) }))}>
                Löschen
              </Btn>
            </div>
            <p className="mt1" style={{ whiteSpace: "pre-wrap" }}>
              {n.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
