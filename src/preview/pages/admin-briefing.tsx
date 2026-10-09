"use client";
import { useMemo, useState } from "react";
import { Link } from "../nav";
import { usePv, crewNachPnr } from "../state/store";
import { Btn, Chip, Karte, Kopf, Note, kopiere } from "../ui/kit";
import { neueZeile } from "../logic/stundentabelle";
import { neueAudit } from "../state/store";
import { bearbeiter } from "./stunden-aktionen";
import { fahrgemeinschaftsVorschlaege } from "../logic/passung";
import { formatDatumDE } from "../logic/zeit";
import type { Crew, Job, Schicht } from "../logic/types";
import { vollName } from "./helfer";
import { wochentag } from "./dispo-aktionen";

const VORLAGE = `Hallo {vorname}, du bist für „{titel}“ eingeplant. 🎉

📅 {datum}
⏰ {schicht}: {start}–{ende} Uhr (bitte 15 Minuten früher da sein)
📍 {ort}
🚪 Treffpunkt: {treffpunkt}
👕 {dresscode}
🦺 Mitbringen: {psa}
🅿️ {parken}
🍽️ {verpflegung}
{fahrt}
Bitte Handy dabei haben und den Stundenzettel am Ende der Schicht ausfüllen lassen. Bei Verspätung oder Ausfall sofort bei der Dispo melden.`;

function text(vorlage: string, c: Crew, job: Job, sch: Schicht, fahrt: string): string {
  return vorlage
    .replace("{vorname}", c.vorname).replace("{titel}", job.titel).replace("{datum}", `${wochentag(sch.datum)}, ${formatDatumDE(sch.datum)}`)
    .replace("{schicht}", sch.bezeichnung).replace("{start}", sch.start).replace("{ende}", sch.ende).replace("{ort}", job.ort)
    .replace("{treffpunkt}", job.treffpunkt).replace("{dresscode}", job.dresscode).replace("{psa}", job.psa.join(", ") || "nichts Besonderes")
    .replace("{parken}", job.parken).replace("{verpflegung}", job.verpflegung).replace("{fahrt}", fahrt);
}

export function AdminBriefing({ id }: { id: string }) {
  const { s, set, melde, modus } = usePv();
  const job = s.jobs.find((j) => j.id === id);
  const [vorlage, setVorlage] = useState(VORLAGE);
  const crewMap = useMemo(() => crewNachPnr(s), [s]);
  const eingeplant = useMemo(() => {
    if (!job) return [];
    return job.schichten.flatMap((sch) => (s.zuweisung[sch.id] ?? []).map((z) => ({ c: crewMap.get(z.pnr), sch }))).filter((x): x is { c: Crew; sch: Schicht } => Boolean(x.c));
  }, [s.zuweisung, job, crewMap]);
  const [auswahl, setAuswahl] = useState(0);
  if (!job) return <Note ton="err">Auftrag nicht gefunden.</Note>;

  const vorschlaege = fahrgemeinschaftsVorschlaege(eingeplant.map((x) => x.c));
  const fahrtFuer = (c: Crew): string => {
    const v = vorschlaege.find((x) => x.a.pnr === c.pnr || x.b.pnr === c.pnr);
    if (!v) return "";
    const partner = v.a.pnr === c.pnr ? v.b : v.a;
    return `🚗 Fahrgemeinschaft: ${partner.vorname} ${partner.nachname.charAt(0)}. wohnt ${v.minuten} Minuten von dir (${partner.wohnort}) – meldet euch gern bei der Dispo für die Nummer.`;
  };
  const gewaehlt = eingeplant[Math.min(auswahl, eingeplant.length - 1)];
  const gesendet = s.briefingGesendet[job.id];

  return (
    <>
      <Kopf eyebrow={job.id} titel="Briefing an die Crew" sub={`${job.titel} · ${eingeplant.length} Personen eingeplant`} aktionen={<Link href={`/admin/dispo/${job.id}`} className="pv-btn sec sm">← Disposition</Link>} />
      {eingeplant.length === 0 ? <Note>Noch niemand eingeplant. Erst in der Disposition einteilen.</Note> : (
        <div className="pva-grid c2">
          <Karte titel="Nachricht">
            <textarea className="pv-textarea" style={{ minHeight: 300, fontFamily: "var(--body)" }} value={vorlage} onChange={(e) => setVorlage(e.target.value)} aria-label="Vorlage" />
            <div className="pv-hint">Platzhalter: {"{vorname} {titel} {datum} {schicht} {start} {ende} {ort} {treffpunkt} {dresscode} {psa} {parken} {verpflegung} {fahrt}"}</div>
            <div className="row mt2">
              <Btn data-testid="briefing-senden" onClick={() => { set((st) => ({ ...st, briefingGesendet: { ...st.briefingGesendet, [job.id]: new Date().toISOString() } })); melde(modus === "demo" ? `Briefing an ${eingeplant.length} Personen vorbereitet. Im echten System geht es per WhatsApp raus – hier wird nichts verschickt.` : `Briefing für ${eingeplant.length} Personen als vorbereitet markiert. Der Versand per WhatsApp folgt – bis dahin den Text je Person kopieren.`); }}>{modus === "demo" ? `An alle ${eingeplant.length} senden` : "Als vorbereitet markieren"}</Btn>
              {gesendet ? <Chip ton="gut">vorbereitet</Chip> : null}
            </div>
          </Karte>
          <Karte titel="Vorschau je Person">
            <select className="pv-select" value={Math.min(auswahl, eingeplant.length - 1)} onChange={(e) => setAuswahl(Number(e.target.value))} aria-label="Person">
              {eingeplant.map((x, i) => <option key={x.c.pnr + x.sch.id} value={i}>{vollName(x.c)} – {x.sch.bezeichnung}</option>)}
            </select>
            {gewaehlt ? <pre className="pv-card flat mt2" style={{ background: "var(--mist)", whiteSpace: "pre-wrap", fontFamily: "var(--body)", margin: "0.6rem 0 0" }} data-testid="briefing-vorschau">{text(vorlage, gewaehlt.c, job, gewaehlt.sch, fahrtFuer(gewaehlt.c))}</pre> : null}
            {gewaehlt ? <div className="row mt2"><Btn v="sec" groesse="sm" onClick={async () => melde((await kopiere(text(vorlage, gewaehlt.c, job, gewaehlt.sch, fahrtFuer(gewaehlt.c)))) ? "Text kopiert." : "Kopieren nicht möglich.")}>Text kopieren</Btn></div> : null}
          </Karte>
          <Karte titel="Stundenzettel-Vorlage">
            <p className="small">Für jede eingeplante Person und Schicht entsteht eine vorbereitete Zeile in der Stundentabelle – mit den geplanten Zeiten, Status „offen“. Die echten Zeiten trägt die Dispo nach dem Einsatz ein (Papierzettel plus Foto).</p>
            <div className="row mt2">
              <Btn v="sec" data-testid="vorlage-anlegen" onClick={() => {
                const vorhanden = new Set(s.stunden.filter((r) => r.auftrag === job.id).map((r) => `${r.pnr}|${r.datum}|${r.start}`));
                const neue = eingeplant
                  .filter((x) => !vorhanden.has(`${x.c.pnr}|${x.sch.datum}|${x.sch.start}`))
                  .map((x, i) => ({ ...neueZeile(`z-vorlage-${job.id}-${s.stunden.length + i}`, x.sch.datum), pnr: x.c.pnr, start: x.sch.start, ende: x.sch.ende, kunde: job.kunde, auftrag: job.id, bemerkung: "Vorlage aus der Disposition" }));
                if (neue.length === 0) return melde("Die Vorlage ist schon angelegt.");
                set((st) => {
                  const auftraege = st.auftraege.some((a) => a.id === job.id) ? st.auftraege : [...st.auftraege, { id: job.id, kunde: job.kunde, titel: job.titel, taetigkeit: job.schichten[0].taetigkeit }];
                  return { ...st, auftraege, stunden: [...st.stunden, ...neue], audit: [neueAudit(bearbeiter(), "time_entries", job.id, "vorlage", "", `${neue.length} Zeilen vorbereitet`, null), ...st.audit] };
                });
                melde(`${neue.length} Zeilen in der Stundentabelle vorbereitet.`);
              }}>Zeilen in der Stundentabelle vorbereiten</Btn>
              <Link href="/admin/stunden" className="pv-btn ghost sm">Stundentabelle öffnen →</Link>
            </div>
          </Karte>
          <Karte titel="Fahrgemeinschaften (Vorschlag)">
            {vorschlaege.length === 0 ? <div className="muted small">Keine Paare in der Nähe gefunden (bis 25 Minuten Fahrzeit, mindestens ein Auto).</div> : null}
            <table className="pv-table"><tbody>{vorschlaege.slice(0, 8).map((v, i) => <tr key={i}><td>{vollName(v.a)}<div className="tiny muted">{v.a.wohnort}</div></td><td>↔</td><td>{vollName(v.b)}<div className="tiny muted">{v.b.wohnort}</div></td><td className="mono small">{v.minuten} min</td></tr>)}</tbody></table>
          </Karte>
        </div>
      )}
    </>
  );
}
