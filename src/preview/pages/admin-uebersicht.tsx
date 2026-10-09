"use client";
import { useMemo } from "react";
import { Link } from "../nav";
import { crewNachPnr, usePv, HEUTE } from "../state/store";
import { Bar, Chip, Kopf, Karte, Stat } from "../ui/kit";
import { pruefeZeilen, zaehleWarnungen } from "../logic/stunden";
import { ampelVertrag } from "../logic/grenzen";
import { formatDatumDE } from "../logic/zeit";
import { besetzt, unterweisungsStand } from "./helfer";

export function AdminUebersicht() {
  const { s } = usePv();
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
  const luecken = s.jobs.reduce((n, j) => n + Math.max(0, besetzt(s, j).bedarf - besetzt(s, j).besetzt), 0);

  const aufgaben: Array<{ href: string; text: string; ton: "err" | "warn" | "info"; n: number }> = [
    { href: "/admin/bewerber", text: "neue Bewerbungen auf Jobs", ton: "info", n: neueBewerbungen },
    { href: "/admin/bewerber", text: "Fragebögen warten auf Durchsicht", ton: "info", n: fragebogenNeu },
    { href: "/admin/stunden", text: "Stundenzeilen mit Fehlern (Pflichtfeld, Doppelt, Vertrag)", ton: "err", n: warn.zeilenMitFehler },
    { href: "/admin/stunden", text: "Stundenzeilen noch nicht geprüft", ton: "warn", n: offeneZeilen },
    { href: "/admin/crew", text: "Verträge laufen aus oder sind abgelaufen", ton: "warn", n: vertraegeKnapp },
    { href: "/admin/unterweisungen", text: "Personen mit ablaufender oder abgelaufener Unterweisung", ton: "warn", n: unterweisungAb },
  ];

  return (
    <>
      <Kopf eyebrow="Dashboard" titel="Übersicht" sub={`Stand ${formatDatumDE(HEUTE)} · Beispieldaten`} />
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
