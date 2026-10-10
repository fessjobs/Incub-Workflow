"use client";
// Freigaben: Wer den Fragebogen und die Grund-Unterweisung erledigt hat, sieht die
// Aufträge erst, wenn das Team bestätigt hat. Hier bestätigt das Team (einzeln oder gesammelt).
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, neueAudit, HEUTE } from "../state/store";
import { Btn, Chip, Initialen, Karte, Kopf, Note, Stat, Tabs } from "../ui/kit";
import { freigabeStand, freigabeText, type FreigabeAnzeige } from "../logic/freigabe";
import { fehlendeModule } from "../logic/unterweisung";
import { MODULE, t } from "../data/trainings";
import { formatDatumDE, formatDezimal } from "../logic/zeit";
import { bewertung, vollName } from "./helfer";
import { bearbeiter } from "./stunden-aktionen";

type Tab = "wartet" | "offen" | "entschieden";

export function AdminFreigaben() {
  const { s, set, melde, echt, modus } = usePv();
  const [tab, setTab] = useState<Tab>("wartet");
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const darfAendern = modus !== "echt" || echt?.rolle === "admin" || echt?.rolle === "dispo";
  const regeln = s.einst.schulung;

  const stand = useMemo(() => {
    const m = new Map<string, FreigabeAnzeige>();
    for (const c of s.crew) m.set(c.id, freigabeStand(c, regeln, HEUTE));
    return m;
  }, [s.crew, regeln]);
  // Nur Menschen, die überhaupt Crew werden können (keine gesperrten oder ausgeschiedenen)
  const personen = s.crew.filter((c) => c.status !== "ausgeschieden" && c.status !== "gesperrt");
  const liste = (st: FreigabeAnzeige[]) => personen.filter((c) => st.includes(stand.get(c.id) ?? "offen"));
  const wartet = liste(["wartet"]);
  const offen = liste(["offen"]);
  const entschieden = liste(["freigegeben", "abgelehnt"]);
  const angezeigt = tab === "wartet" ? wartet : tab === "offen" ? offen : entschieden;

  const entscheide = (ids: string[], status: "bestaetigt" | "abgelehnt" | null) => {
    if (!darfAendern || ids.length === 0) return;
    const wer = echt?.benutzer ?? bearbeiter();
    set((st) => ({
      ...st,
      crew: st.crew.map((c) => {
        if (!ids.includes(c.id)) return c;
        if (status === null) {
          const { freigabe: _f, ...rest } = c;
          void _f;
          return rest;
        }
        return { ...c, freigabe: { status, am: HEUTE, von: wer, notiz: "" } };
      }),
      audit: [
        ...ids.map((id) => {
          const c = st.crew.find((x) => x.id === id);
          return neueAudit(wer, "crew", id, "freigabe", c ? freigabeText(freigabeStand(c, st.einst.schulung, HEUTE)) : "", status === "bestaetigt" ? "freigegeben" : status === "abgelehnt" ? "nicht freigegeben" : "zurückgenommen", null);
        }),
        ...st.audit,
      ],
    }));
    setGewaehlt(new Set());
    melde(status === "bestaetigt" ? `${ids.length} ${ids.length === 1 ? "Person" : "Personen"} freigegeben – sie sehen jetzt die Aufträge.` : status === "abgelehnt" ? `${ids.length} nicht freigegeben.` : "Freigabe zurückgenommen.");
  };

  const umschalten = (id: string) => setGewaehlt((g) => {
    const n = new Set(g);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const alle = angezeigt.length > 0 && angezeigt.every((c) => gewaehlt.has(c.id));

  return (
    <>
      <Kopf eyebrow="Betrieb" titel="Freigaben" sub="Wer den Fragebogen und die Grund-Unterweisung erledigt hat, sieht die Aufträge erst nach deiner Bestätigung." />
      <div className="pva-grid c4">
        <Stat wert={wartet.length} label="warten auf Bestätigung" ton={wartet.length ? "warn" : "gut"} />
        <Stat wert={offen.length} label="noch nicht fertig" />
        <Stat wert={entschieden.filter((c) => stand.get(c.id) === "freigegeben").length} label="freigegeben" ton="gut" />
        <Stat wert={entschieden.filter((c) => stand.get(c.id) === "abgelehnt").length} label="nicht freigegeben" />
      </div>
      <div className="mt2"><Note>Voraussetzung vor der Bestätigung: Fragebogen abgeschickt und {regeln.freigabeModule.length === 0 ? "keine Pflicht-Unterweisung" : regeln.freigabeModule.map((m) => t(MODULE.find((x) => x.id === m)?.titel ?? { de: m, en: m }, "de")).join(" und ")} gültig. Das lässt sich unter Unterweisungen → Pflicht &amp; Videos ändern.</Note></div>
      <div className="mt3"><Tabs wert={tab} onChange={(x) => { setTab(x); setGewaehlt(new Set()); }} tabs={[{ id: "wartet", label: "Warten auf Bestätigung", n: wartet.length }, { id: "offen", label: "Noch nicht fertig", n: offen.length }, { id: "entschieden", label: "Entschieden", n: entschieden.length }]} /></div>

      {tab === "wartet" && wartet.length > 0 && darfAendern ? (
        <div className="row wrap mt2">
          <Btn onClick={() => entscheide([...gewaehlt], "bestaetigt")} disabled={gewaehlt.size === 0} data-testid="freigabe-auswahl">Ausgewählte freigeben ({gewaehlt.size})</Btn>
          <Btn v="sec" onClick={() => entscheide(wartet.map((c) => c.id), "bestaetigt")} data-testid="freigabe-alle">Alle {wartet.length} freigeben</Btn>
        </div>
      ) : null}

      <Karte>
        {angezeigt.length === 0 ? <div className="muted">{tab === "wartet" ? "Niemand wartet auf eine Bestätigung." : tab === "offen" ? "Alle haben Fragebogen und Grund-Unterweisung erledigt." : "Noch nichts entschieden."}</div> : null}
        {angezeigt.length > 0 ? (
          <div className="pv-scroll" style={{ margin: "-0.2rem" }}>
            <table className="pv-table" data-testid="freigaben-tabelle">
              <thead>
                <tr>
                  {tab === "wartet" && darfAendern ? <th style={{ width: 32 }}><input type="checkbox" checked={alle} aria-label="Alle auswählen" onChange={() => setGewaehlt(alle ? new Set() : new Set(angezeigt.map((c) => c.id)))} /></th> : null}
                  <th>Person</th>
                  <th>Ort</th>
                  <th>{tab === "offen" ? "Was fehlt" : "Fragebogen"}</th>
                  <th>{tab === "entschieden" ? "Entscheidung" : "Kategorie"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {angezeigt.map((c) => {
                  const b = bewertung(c, s.einst);
                  const fehlt = fehlendeModule(regeln.freigabeModule, c.unterweisungen, HEUTE);
                  const st = stand.get(c.id);
                  return (
                    <tr key={c.id}>
                      {tab === "wartet" && darfAendern ? <td><input type="checkbox" checked={gewaehlt.has(c.id)} aria-label={`${vollName(c)} auswählen`} onChange={() => umschalten(c.id)} /></td> : null}
                      <td>
                        <Link href={`/admin/crew/${c.id}`} className="row" style={{ textDecoration: "none" }}>
                          <Initialen name={vollName(c)} />
                          <span><b>{vollName(c)}</b><div className="tiny muted mono">{c.pnr} · {c.telefon}</div></span>
                        </Link>
                      </td>
                      <td>{c.plz} {c.wohnort}<div className="tiny muted">{c.pool}</div></td>
                      <td>
                        {tab === "offen" ? (
                          <div className="col gap1">
                            {c.profile === null ? <Chip ton="warn">Fragebogen fehlt</Chip> : null}
                            {fehlt.map((m) => <Chip key={m} ton="warn">{t(MODULE.find((x) => x.id === m)?.titel ?? { de: m, en: m }, "de")}</Chip>)}
                          </div>
                        ) : c.profile ? <Chip ton="gut">abgeschickt</Chip> : <Chip>–</Chip>}
                      </td>
                      <td>
                        {tab === "entschieden" && c.freigabe ? (
                          <span><Chip ton={st === "freigegeben" ? "gut" : "err"}>{freigabeText(st ?? "offen")}</Chip><div className="tiny muted">{formatDatumDE(c.freigabe.am)} · {c.freigabe.von}</div></span>
                        ) : b ? (
                          <span><Chip ton={b.kategorie === "A" ? "gut" : b.kategorie === "B" ? "info" : "warn"}>Kategorie {b.kategorie}</Chip><div className="tiny muted mono">{formatDezimal(b.score, 1)} Punkte</div></span>
                        ) : "–"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {darfAendern && tab === "wartet" ? <><Btn groesse="sm" onClick={() => entscheide([c.id], "bestaetigt")} data-testid={`freigeben-${c.pnr}`}>Freigeben</Btn>{" "}<Btn groesse="sm" v="ghost" onClick={() => entscheide([c.id], "abgelehnt")}>Nicht freigeben</Btn></> : null}
                        {darfAendern && tab === "offen" ? <Btn groesse="sm" v="sec" onClick={() => entscheide([c.id], "bestaetigt")}>Trotzdem freigeben</Btn> : null}
                        {darfAendern && tab === "entschieden" ? <Btn groesse="sm" v="sec" onClick={() => entscheide([c.id], null)}>Zurücknehmen</Btn> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Karte>
      <div className="small muted mt2">„Zurücknehmen“ stellt den Stand wieder her, der sich aus Fragebogen und Unterweisung ergibt. Bereits eingegangene Bewerbungen bleiben bestehen.</div>
    </>
  );
}
