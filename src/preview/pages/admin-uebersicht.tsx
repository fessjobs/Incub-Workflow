"use client";
import { useMemo } from "react";
import { useState } from "react";
import { Link } from "../nav";
import { crewNachPnr, usePv, HEUTE } from "../state/store";
import { Bar, Btn, Chip, Kopf, Karte, Stat } from "../ui/kit";
import { AuftragModal, PersonModal } from "./formulare";
import { pruefeZeilen, zaehleWarnungen } from "../logic/stunden";
import { ampelVertrag } from "../logic/grenzen";
import { formatDatumDE } from "../logic/zeit";
import { besetzt, unterweisungsStand } from "./helfer";
import { freigabeStand } from "../logic/freigabe";

export function AdminUebersicht() {
  const { s, modus, echt } = usePv();
  const [person, setPerson] = useState(false);
  const [auftrag, setAuftrag] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const warn = useMemo(() => {
    const personen = new Map([...crewNachPnr(s)].map(([pnr, c]) => [pnr, { vertraege: c.contract ? [c.contract] : [] }]));
    return zaehleWarnungen(pruefeZeilen(s.stunden, { personen }));
  }, [s]);

  const aktive = s.crew.filter((c) => c.status === "aktiv");
  const fragebogenNeu = s.crew.filter((c) => c.status === "Bewerber" && c.profile).length;
  const neueBewerbungen = s.bewerbungen.filter((a) => a.status === "neu").length;
  const vertraegeKnapp = aktive.filter((c) => c.contract && ampelVertrag(c.contract.gueltigBis, HEUTE) !== "gruen").length;
  const unterweisungAb = aktive.filter((c) => unterweisungsStand(c).abgelaufen > 0 || unterweisungsStand(c).laeuftAb > 0).length;
  const offeneZeilen = s.stunden.filter((r) => r.status === "offen").length;
  const wartenAufFreigabe = s.crew.filter((c) => c.status !== "ausgeschieden" && freigabeStand(c, s.einst.schulung, HEUTE) === "wartet").length;
  const luecken = s.jobs.reduce((n, j) => n + Math.max(0, besetzt(s, j).bedarf - besetzt(s, j).besetzt), 0);

  const aufgaben: Array<{ href: string; text: string; ton: "err" | "warn" | "info"; n: number }> = [
    { href: "/admin/bewerber", text: "neue Bewerbungen auf Jobs", ton: "info", n: neueBewerbungen },
    { href: "/admin/freigaben", text: "Personen warten auf deine Freigabe für die Aufträge", ton: "warn", n: wartenAufFreigabe },
    { href: "/admin/bewerber", text: "Fragebögen warten auf Durchsicht", ton: "info", n: fragebogenNeu },
    { href: "/admin/stunden", text: "Stundenzeilen mit Fehlern (Pflichtfeld, Doppelt, Vertrag)", ton: "err", n: warn.zeilenMitFehler },
    { href: "/admin/stunden", text: "Stundenzeilen noch nicht geprüft", ton: "warn", n: offeneZeilen },
    { href: "/admin/crew", text: "Verträge laufen aus oder sind abgelaufen", ton: "warn", n: vertraegeKnapp },
    { href: "/admin/unterweisungen", text: "Personen mit ablaufender oder abgelaufener Unterweisung", ton: "warn", n: unterweisungAb },
  ];

  return (
    <>
      <Kopf eyebrow="Dashboard" titel="Übersicht" sub={modus === "echt" ? `Stand ${formatDatumDE(HEUTE)}` : `Stand ${formatDatumDE(HEUTE)} · Beispieldaten`} aktionen={modus === "echt" ? <><Btn v="sec" onClick={() => setPerson(true)}>+ Person</Btn><Btn v="sec" onClick={() => setAuftrag(true)}>+ Auftrag</Btn></> : undefined} />
      {modus === "echt" && s.crew.length === 0 && s.jobs.length === 0 && s.stunden.length === 0 ? (
        <div className="mb-3" style={{ marginBottom: "1rem" }}>
          <Karte titel="Willkommen im neuen Dashboard">
            <p>Dieses Dashboard läuft <b>parallel</b> zum bisherigen System und hat <b>eigene Daten</b>. Das bisherige System (Belege, Einsätze, Stunden, Dokumente) wird weder gelesen noch verändert. Es ist noch leer – so geht es los:</p>
            <ol className="small mt2" style={{ paddingLeft: "1.2rem" }}>
              <li><b>Personen</b> anlegen (mit Vertrag) oder unter <Link href="/admin/import">Import</Link> den Personalstamm aus zvoove einlesen, dann unter <Link href="/admin/nachrichten">Nachrichten</Link> die Links mit vorgefertigtem Text verschicken.</li>
              <li><b>Aufträge</b> anlegen oder aus der Regio-Tabelle importieren, im Job-Board veröffentlichen und in der Disposition besetzen. Wer den Fragebogen erledigt hat, sieht Aufträge erst nach deiner Bestätigung unter <Link href="/admin/freigaben">Freigaben</Link>.</li>
              <li><b>Stunden</b> in die Stundentabelle eintragen oder aus Excel einfügen, prüfen und exportieren.</li>
            </ol>
            <div className="row wrap mt3">
              <Btn onClick={() => setPerson(true)}>Person anlegen</Btn>
              <Btn v="sec" onClick={() => setAuftrag(true)}>Auftrag anlegen</Btn>
              <Btn v="ghost" disabled={laedt} data-testid="beispieldaten-laden" onClick={async () => { setLaedt(true); await echt?.beispieldatenLaden(); setLaedt(false); }}>{laedt ? "Lädt …" : "Mit Beispieldaten ausprobieren"}</Btn>
            </div>
          </Karte>
        </div>
      ) : null}
      {person ? <PersonModal onClose={() => setPerson(false)} /> : null}
      {auftrag ? <AuftragModal onClose={() => setAuftrag(false)} /> : null}
      <div className="pva-grid c4">
        <Stat wert={aktive.length} label="aktive Crew" />
        <Stat wert={s.jobs.length} label="Aufträge in den nächsten 10 Tagen" />
        <Stat wert={luecken} label="offene Plätze in der Disposition" ton={luecken > 0 ? "warn" : "gut"} />
        <Stat wert={warn.zeilenMitFehler} label="Stundenzeilen mit Fehler" ton={warn.zeilenMitFehler > 0 ? "err" : "gut"} />
      </div>

      <div className="pva-grid c2 mt3">
        <Karte titel="Heute zu tun">
          <div className="col">
            {aufgaben
              .filter((a) => a.n > 0)
              .map((a) => (
                <Link key={a.text} href={a.href} className="row between" style={{ textDecoration: "none", padding: "0.45rem 0", borderBottom: "1px solid var(--line)" }}>
                  <span>{a.text}</span>
                  <Chip ton={a.ton === "err" ? "err" : a.ton === "warn" ? "warn" : "info"} mono>
                    {a.n}
                  </Chip>
                </Link>
              ))}
          </div>
        </Karte>
        <Karte titel="Aufträge" aktionen={<Link href="/admin/dispo" className="small">Zur Disposition →</Link>}>
          <table className="pv-table">
            <tbody>
              {s.jobs.slice(0, 6).map((j) => {
                const b = besetzt(s, j);
                return (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/admin/dispo/${j.id}`} style={{ textDecoration: "none" }}>
                        <b>{j.titel}</b>
                        <div className="small muted">
                          {j.kunde} · {formatDatumDE(j.datumVon)}
                        </div>
                      </Link>
                    </td>
                    <td style={{ width: 120 }}>
                      <Bar anteil={b.bedarf ? b.besetzt / b.bedarf : 0} ton={b.besetzt >= b.bedarf ? "gut" : b.besetzt / b.bedarf > 0.5 ? "warn" : "err"} />
                      <div className="tiny muted mono">
                        {b.besetzt} von {b.bedarf}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Karte>
      </div>
    </>
  );
}
