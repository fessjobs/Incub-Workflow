"use client";
import { useMemo, useState } from "react";
import { Link, gehe } from "../nav";
import { usePv, sichtbareCrew, neueAudit, HEUTE } from "../state/store";
import { AmpelPunkt, Bar, Chip, Initialen, Kopf, Karte, Modal, Offen, Stat, Tabs, Btn, Note } from "../ui/kit";
import { POOLS, geocodePlz } from "../logic/geo";
import { levelFuer } from "../logic/xp";
import { formatDatumDE, formatDezimal, formatEuro } from "../logic/zeit";

import { MODULE, t } from "../data/trainings";
import { statusFuer, ablaufDatum } from "../logic/unterweisung";
import type { Crew, Pool, Vertragsart } from "../logic/types";
import { TAETIGKEITEN } from "../logic/types";
import { SITUATIONSFRAGEN } from "../logic/fragen";
import { EinladungModal, PersonModal } from "./formulare";
import { ampelTon, bewertung, grenzenFuer, monateListe, unterweisungsStand, vollName } from "./helfer";

const POOL_LISTE = Object.keys(POOLS) as Pool[];

export function AdminCrew() {
  const { s } = usePv();
  const [neuePerson, setNeuePerson] = useState(false);
  const [ansicht, setAnsicht] = useState<"liste" | "karte">("liste");
  const [suche, setSuche] = useState("");
  const [pool, setPool] = useState("");
  const [art, setArt] = useState("");
  const [ampel, setAmpel] = useState("");
  const [monat, setMonat] = useState(() => monateListe()[0].wert);

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return sichtbareCrew(s)
      .filter((c) => c.status !== "Bewerber")
      .filter((c) => !q || `${vollName(c)} ${c.pnr} ${c.wohnort}`.toLowerCase().includes(q))
      .filter((c) => !pool || c.pool === pool)
      .filter((c) => !art || c.contract?.vertragsart === art)
      .map((c) => ({ c, g: grenzenFuer(s, c, monat) }))
      .filter((x) => !ampel || x.g.gesamt === ampel);
  }, [s, suche, pool, art, ampel, monat]);

  const rot = liste.filter((x) => x.g.gesamt === "rot").length;
  const gelb = liste.filter((x) => x.g.gesamt === "gelb").length;

  return (
    <>
      <Kopf eyebrow="Personal" titel="Crew" sub="Alle Personen mit Vertrag, Grenzen und Unterweisung auf einen Blick." aktionen={<Btn onClick={() => setNeuePerson(true)} data-testid="person-anlegen">+ Person anlegen</Btn>} />
      {neuePerson ? <PersonModal onClose={() => setNeuePerson(false)} /> : null}
      <div className="pva-grid c4">
        <Stat wert={liste.length} label="Personen in der Auswahl" />
        <Stat wert={rot} label="Grenze überschritten oder Vertrag abgelaufen" ton={rot ? "err" : "gut"} />
        <Stat wert={gelb} label="Grenze knapp oder Vertrag läuft bald aus" ton={gelb ? "warn" : "gut"} />
        <Stat wert={liste.filter((x) => x.c.contract?.vertragsart === "kurzfristig").length} label="kurzfristig Beschäftigte (70-Tage-Grenze)" />
      </div>

      <div className="row wrap mt3">
        <input className="pv-input" style={{ maxWidth: 240 }} placeholder="Name, Personalnummer, Ort" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Suche" />
        <select className="pv-select" style={{ maxWidth: 170 }} value={pool} onChange={(e) => setPool(e.target.value)} aria-label="Pool">
          <option value="">Alle Pools</option>
          {POOL_LISTE.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="pv-select" style={{ maxWidth: 170 }} value={art} onChange={(e) => setArt(e.target.value)} aria-label="Vertragsart">
          <option value="">Alle Verträge</option>
          {(["Minijob", "kurzfristig", "Werkstudent", "TZ", "VZ"] as Vertragsart[]).map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select className="pv-select" style={{ maxWidth: 170 }} value={ampel} onChange={(e) => setAmpel(e.target.value)} aria-label="Ampel">
          <option value="">Alle Ampeln</option>
          <option value="rot">rot</option>
          <option value="gelb">gelb</option>
          <option value="gruen">grün</option>
        </select>
        <select className="pv-select" style={{ maxWidth: 220 }} value={monat} onChange={(e) => setMonat(e.target.value)} aria-label="Monat">
          {monateListe().map((m) => (
            <option key={m.wert} value={m.wert}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt2">
        <Tabs wert={ansicht} onChange={setAnsicht} tabs={[{ id: "liste", label: "Liste", n: liste.length }, { id: "karte", label: "Karte" }]} />
      </div>

      {ansicht === "liste" ? (
        <div className="pv-card mt2 pv-scroll" style={{ padding: 0 }}>
          <table className="pv-table" data-testid="crew-tabelle">
            <thead>
              <tr>
                <th>Person</th>
                <th>Pool</th>
                <th>Vertrag</th>
                <th>Stunden im Monat</th>
                <th>Vertrag bis</th>
                <th>Tage / Verdienst</th>
                <th>Unterweisung</th>
                <th>Level</th>
                <th>Ampel</th>
              </tr>
            </thead>
            <tbody>
              {liste.map(({ c, g }) => {
                const v = c.contract;
                const u = unterweisungsStand(c);
                const lv = levelFuer(c.xp, s.einst.xp);
                return (
                  <tr key={c.id} className="click">
                    <td>
                      <Link href={`/admin/crew/${c.id}`} style={{ textDecoration: "none" }} className="row">
                        <Initialen name={vollName(c)} />
                        <span>
                          <b>{vollName(c)}</b>
                          <div className="tiny muted mono">
                            {c.pnr} · {c.wohnort}
                          </div>
                        </span>
                      </Link>
                    </td>
                    <td>{c.pool}</td>
                    <td>{v ? <Chip>{v.vertragsart}</Chip> : <Chip ton="warn">kein Vertrag</Chip>}</td>
                    <td style={{ minWidth: 140 }}>
                      {v ? (
                        <>
                          <div className="mono small">
                            {formatDezimal(g.stunden, 1)} h{v.monatsgrenzeStd ? ` / ${v.monatsgrenzeStd} h` : ""}
                          </div>
                          {v.monatsgrenzeStd ? <Bar anteil={g.stunden / v.monatsgrenzeStd} ton={ampelTon(g.auslastung)} /> : null}
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>
                      {v ? (
                        <span className="row gap1">
                          <AmpelPunkt a={g.vertrag} />
                          <span className="small">{v.gueltigBis ? formatDatumDE(v.gueltigBis) : "unbefristet"}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>
                      {g.tage70 ? (
                        <span className="row gap1">
                          <AmpelPunkt a={g.tage70} />
                          <span className="small mono">{c.arbeitstageJahr} / 70 Tage</span>
                        </span>
                      ) : g.minijob ? (
                        <span className="row gap1">
                          <AmpelPunkt a={g.minijob} />
                          <span className="small mono">
                            {formatEuro(g.verdienst)} / {formatEuro(s.einst.minijobEur)}
                          </span>
                        </span>
                      ) : (
                        <span className="muted small">–</span>
                      )}
                    </td>
                    <td>
                      <Chip ton={u.abgelaufen ? "err" : u.laeuftAb ? "warn" : u.gueltig === u.gesamt ? "gut" : undefined} mono>
                        {u.gueltig}/{u.gesamt}
                      </Chip>
                    </td>
                    <td>
                      <span className="small">{lv.name}</span>
                      <div className="tiny muted mono">{c.xp} XP</div>
                    </td>
                    <td>
                      <AmpelPunkt a={g.gesamt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Karte>
          <KartePools personen={liste.map((x) => x.c)} />
        </Karte>
      )}
      <div className="row wrap mt2">
        <Offen nr={0}>Minijob-Grenze (603 €) ist ein einstellbarer Wert und vor dem Einsatz zu prüfen</Offen>
        <span className="small muted">Die 70-Tage-Grenze gilt nur für kurzfristig Beschäftigte und zählt Arbeitstage im Kalenderjahr.</span>
      </div>
    </>
  );
}

function KartePools({ personen }: { personen: Crew[] }) {
  const [gewaehlt, setGewaehlt] = useState<Crew | null>(null);
  const W = 760;
  const H = 520;
  const latMin = 48.3;
  const latMax = 51.6;
  const lngMin = 6.2;
  const lngMax = 9.8;
  const kx = Math.cos((50 * Math.PI) / 180);
  const spanX = (lngMax - lngMin) * kx;
  const spanY = latMax - latMin;
  const sk = Math.min(W / spanX, H / spanY);
  const proj = (lat: number, lng: number) => ({ x: (lng - lngMin) * kx * sk, y: (latMax - lat) * sk });
  const farbe: Record<Pool, string> = { Stuttgart: "#ff5a00", Mannheim: "#1f5fbf", Frankfurt: "#0f8a4f", "Idar-Oberstein": "#8a3ffc", NRW: "#c62828" };
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: "0.6rem" }}>
        {POOL_LISTE.map((p) => (
          <span key={p} className="row gap1 small">
            <i style={{ width: 10, height: 10, borderRadius: "50%", background: farbe[p], display: "inline-block" }} />
            {p} ({personen.filter((c) => c.pool === p).length})
          </span>
        ))}
        <span className="small muted">Kreise: ca. 60 Minuten Fahrzeit (grob, Luftlinie × 1,25)</span>
      </div>
      <svg className="pv-map" viewBox={`0 0 ${spanX * sk} ${spanY * sk}`} role="img" aria-label="Karte der Pools und Crew">
        {POOL_LISTE.map((p) => {
          const o = POOLS[p];
          const { x, y } = proj(o.lat, o.lng);
          const r = ((60 - 4) / 60) * 85 * (1 / 1.25) * (1 / 111) * sk;
          return (
            <g key={p}>
              <circle cx={x} cy={y} r={r} fill={farbe[p]} opacity={0.08} stroke={farbe[p]} strokeDasharray="4 4" />
              <rect x={x - 6} y={y - 6} width={12} height={12} fill={farbe[p]} />
              <text x={x + 10} y={y + 4} fontSize={13} fontWeight={700} fill="#0a1a2f">
                {p}
              </text>
            </g>
          );
        })}
        {personen.map((c) => {
          const o = geocodePlz(c.plz);
          if (!o) return null;
          const jitterX = (c.id.charCodeAt(c.id.length - 1) % 7) - 3;
          const jitterY = (c.pnr.charCodeAt(c.pnr.length - 1) % 7) - 3;
          const { x, y } = proj(o.lat, o.lng);
          return <circle key={c.id} cx={x + jitterX} cy={y + jitterY} r={4.5} fill={farbe[c.pool]} stroke="#fff" strokeWidth={1.2} style={{ cursor: "pointer" }} onClick={() => setGewaehlt(c)} />;
        })}
      </svg>
      {gewaehlt ? (
        <div className="pv-note mt2 row between">
          <span>
            <b>{vollName(gewaehlt)}</b> · {gewaehlt.wohnort} · Pool {gewaehlt.pool}
          </span>
          <Link href={`/admin/crew/${gewaehlt.id}`}>Profil öffnen →</Link>
        </div>
      ) : (
        <div className="small muted mt2">Punkt anklicken für Details.</div>
      )}
    </div>
  );
}

export function AdminCrewDetail({ id }: { id: string }) {
  const { s, set, melde, modus, echt } = usePv();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [einladung, setEinladung] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const c = s.crew.find((x) => x.id === id);
  const [tab, setTab] = useState<"ueberblick" | "fragebogen" | "unterweisung" | "stunden" | "bewertung">("ueberblick");
  const [monat, setMonat] = useState(() => monateListe()[0].wert);
  if (!c) return <Note ton="err">Person nicht gefunden.</Note>;
  const b = bewertung(c, s.einst);
  const g = grenzenFuer(s, c, monat);
  const lv = levelFuer(c.xp, s.einst.xp);
  const zeilen = s.stunden.filter((r) => r.pnr === c.pnr).slice(-14).reverse();
  return (
    <>
      <Kopf
        eyebrow={`${c.pnr} · ${c.pool}`}
        titel={vollName(c)}
        sub={
          <span className="row wrap">
            <Chip ton={c.status === "aktiv" ? "gut" : c.status === "gesperrt" ? "err" : "info"}>{c.status}</Chip>
            <span>{c.plz} {c.wohnort}</span>
            <span className="mono small">{c.telefon}</span>
          </span>
        }
        aktionen={
          <>
            {modus === "echt" ? <Btn v="sec" groesse="sm" onClick={() => setBearbeiten(true)} data-testid="person-bearbeiten">Bearbeiten</Btn> : null}
            {modus === "echt" ? <Btn v="sec" groesse="sm" onClick={() => setEinladung(true)} data-testid="einladung-oeffnen">Einladungslink</Btn> : null}
            <Link href="/admin/crew" className="pv-btn sec sm">← Alle Crew</Link>
          </>
        }
      />
      {bearbeiten ? <PersonModal person={c} onClose={() => setBearbeiten(false)} /> : null}
      {einladung ? <EinladungModal person={c} onClose={() => setEinladung(false)} /> : null}
      {loeschen ? (
        <Modal titel="Person und Daten löschen?" onClose={() => setLoeschen(false)} fuss={<><Btn v="sec" onClick={() => setLoeschen(false)}>Abbrechen</Btn><Btn v="danger" data-testid="loeschen-bestaetigen" onClick={() => {
          set((st) => ({
            ...st,
            crew: st.crew.filter((x) => x.id !== c.id),
            bewerbungen: st.bewerbungen.filter((b) => b.pnr !== c.pnr),
            zuweisung: Object.fromEntries(Object.entries(st.zuweisung).map(([k, v]) => [k, v.filter((z) => z.pnr !== c.pnr)])),
            audit: [neueAudit(echt?.benutzer ?? "Admin", "crew", c.id, "loeschung", vollName(c), "gelöscht (DSGVO)", null), ...st.audit],
          }));
          melde(`${vollName(c)} gelöscht.`);
          gehe("/admin/crew");
        }}>Ja, löschen</Btn></>}>
          <p>Profil, Fragebogen, Unterweisungen und Bewerbungen von {vollName(c)} werden aus dem neuen System entfernt. Das geht nicht rückgängig.</p>
          <div className="small muted mt2">Stundenzeilen bleiben (Aufbewahrungspflicht) und zeigen weiter die Personalnummer.</div>
        </Modal>
      ) : null}
      <Tabs
        wert={tab}
        onChange={setTab}
        tabs={[
          { id: "ueberblick", label: "Überblick" },
          { id: "fragebogen", label: "Fragebogen und Score" },
          { id: "unterweisung", label: "Unterweisungen" },
          { id: "stunden", label: "Stunden", n: zeilen.length },
          { id: "bewertung", label: "Bewertungen", n: c.ratings.length },
        ]}
      />
      <div className="mt3" />
      {tab === "ueberblick" ? (
        <div className="pva-grid c2">
          <Karte titel="Vertrag und Grenzen">
            {c.contract ? (
              <table className="pv-table">
                <tbody>
                  <tr><td>Vertragsart</td><td><b>{c.contract.vertragsart}</b> · {c.contract.wochenstunden} h/Woche</td></tr>
                  <tr><td>Stundenlohn</td><td className="mono">{formatEuro(c.contract.stundenlohn)}</td></tr>
                  <tr><td>Gültig</td><td>{formatDatumDE(c.contract.gueltigVon)} – {c.contract.gueltigBis ? formatDatumDE(c.contract.gueltigBis) : "unbefristet"} <AmpelPunkt a={g.vertrag} /></td></tr>
                  <tr><td>DocuSign</td><td className="mono small">{c.contract.docusignId}</td></tr>
                  <tr>
                    <td>Stunden im Monat</td>
                    <td>
                      <select className="pv-select sm" style={{ width: "auto" }} value={monat} onChange={(e) => setMonat(e.target.value)}>
                        {monateListe().map((m) => <option key={m.wert} value={m.wert}>{m.label}</option>)}
                      </select>{" "}
                      <b className="mono">{formatDezimal(g.stunden, 1)} h</b>{c.contract.monatsgrenzeStd ? ` von ${c.contract.monatsgrenzeStd} h` : ""} <AmpelPunkt a={g.auslastung} mitText />
                    </td>
                  </tr>
                  {g.tage70 ? <tr><td>70-Tage-Grenze</td><td className="mono">{c.arbeitstageJahr} / 70 Tage <AmpelPunkt a={g.tage70} mitText /></td></tr> : null}
                  {g.minijob ? <tr><td>Minijob-Verdienst</td><td className="mono">{formatEuro(g.verdienst)} / {formatEuro(s.einst.minijobEur)} <AmpelPunkt a={g.minijob} mitText /></td></tr> : null}
                </tbody>
              </table>
            ) : (
              <Note ton="warn">Noch kein Vertrag hinterlegt. Einplanen ist erst mit gültigem Vertrag möglich.</Note>
            )}
          </Karte>
          <Karte titel="Level und Einsätze">
            <div className="row gap3">
              <div>
                <div className="eyebrow">Level</div>
                <div className="pvd-score" style={{ textAlign: "left", fontSize: "2rem" }}>{lv.name}</div>
              </div>
              <div className="grow">
                <div className="mono small">{c.xp} XP · {c.einsaetze} Einsätze</div>
                <Bar anteil={lv.fortschritt} />
                <div className="tiny muted">{lv.naechstes ? `noch ${lv.naechstes.fehlend} XP bis ${lv.naechstes.name}` : "höchstes Level"}</div>
              </div>
            </div>
            <div className="mt2 small">Kategorie und Score sieht nur das Dashboard – die Person selbst sieht nur Level und XP.</div>
            {b ? (
              <div className="row mt2">
                <span className="pv-chip navy">Kategorie {b.kategorie}</span>
                <span className="mono small">Score {formatDezimal(b.score, 1)} ({Math.round(b.anteilLeistung * 100)} % aus echten Einsätzen)</span>
              </div>
            ) : null}
          </Karte>
          <Karte titel="Notiz (intern)">
            <textarea
              className="pv-textarea"
              value={c.notizen}
              onChange={(e) => set((x) => ({ ...x, crew: x.crew.map((p) => (p.id === c.id ? { ...p, notizen: e.target.value } : p)) }))}
              placeholder="Interne Notiz zur Person"
            />
            {modus === "demo" ? <div className="pv-hint">Wird im Prototyp nur im Browser gehalten.</div> : null}
          </Karte>
          <Karte titel="Aktionen">
            <div className="row wrap">
              <Btn v="sec" data-testid="sperren" onClick={() => {
                const neu = c.status === "gesperrt" ? "aktiv" : "gesperrt";
                set((st) => ({ ...st, crew: st.crew.map((x) => (x.id === c.id ? { ...x, status: neu } : x)), audit: [neueAudit(echt?.benutzer ?? "Admin", "crew", c.id, "status", c.status, neu, null), ...st.audit] }));
                melde(neu === "gesperrt" ? `${vollName(c)} ist gesperrt und wird nicht mehr eingeplant.` : `${vollName(c)} ist wieder aktiv.`);
              }}>{c.status === "gesperrt" ? "Entsperren" : "Sperren"}</Btn>
              <Btn v="sec" onClick={() => (modus === "echt" ? setBearbeiten(true) : melde("Prototyp: Vertragsverlängerung läuft über DocuSign (bleibt wie bisher)."))}>Vertrag bearbeiten</Btn>
              <Btn v="danger" onClick={() => (modus === "echt" ? setLoeschen(true) : melde("Prototyp: Löschen nach DSGVO – mit Bestätigung und Eintrag im Audit-Log."))}>Daten löschen</Btn>
            </div>
          </Karte>
        </div>
      ) : null}
      {tab === "fragebogen" ? (
        b && c.profile ? (
          <div className="pva-grid c2">
            <Karte titel="Score je Block">
              <div className="col">
                {b.frage.blocks.map((bl) => (
                  <div key={bl.key}>
                    <div className="row between">
                      <b>{bl.label}</b>
                      <span className="mono small">{formatDezimal(bl.punkte, 1)} / {formatDezimal(bl.maximal, 1)}</span>
                    </div>
                    <Bar anteil={bl.quote} ton={bl.quote >= 0.7 ? "gut" : bl.quote >= 0.4 ? "warn" : "err"} />
                    <ul className="small muted" style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }}>
                      {bl.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                ))}
                <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: "0.5rem" }}>
                  <b>Fragebogen gesamt</b>
                  <span className="mono"><b>{formatDezimal(b.frage.gesamt, 1)}</b> → Kategorie {b.frage.kategorie}</span>
                </div>
              </div>
            </Karte>
            <Karte titel="Angaben">
              <table className="pv-table">
                <tbody>
                  <tr><td>Anfahrt max.</td><td>{c.profile.maxAnfahrtMin} min {c.profile.eigenesAuto ? "· eigenes Auto" : ""} {c.profile.fahrgemeinschaft ? "· Fahrgemeinschaft ok" : ""}</td></tr>
                  <tr><td>Größte Veranstaltung</td><td className="mono">{c.profile.groessteVeranstaltung.toLocaleString("de-DE")} Besucher</td></tr>
                  <tr><td>Erfahrung</td><td>{TAETIGKEITEN.filter((x) => c.profile && (c.profile.erfahrung[x].einsaetze > 0 || c.profile.erfahrung[x].jahre > 0)).map((x) => `${x} (${c.profile?.erfahrung[x].einsaetze}×)`).join(", ") || "keine angegeben"}</td></tr>
                  <tr><td>Nachweise</td><td>{Object.entries(c.profile.nachweise).map(([k, v]) => `${k}: ${v === "geprueft" ? "geprüft" : v === "angegeben" ? "angegeben" : "–"}`).join(" · ")}</td></tr>
                  <tr><td>Wunsch</td><td>{c.profile.wunschVertrag}, ca. {c.profile.wunschStundenMonat} h/Monat</td></tr>
                  <tr><td>Situationsfragen</td><td>{c.profile.situation.map((o, i) => `${SITUATIONSFRAGEN[i].optionen[o]?.punkte ?? 0}/5`).join(" · ")}</td></tr>
                </tbody>
              </table>
              <Note>Nachweise „angegeben“ zählen halb, von FESS „geprüft“ voll. Geprüft wird mit Sichtung des Originals.</Note>
            </Karte>
          </div>
        ) : (
          <Note>Kein Fragebogen vorhanden.</Note>
        )
      ) : null}
      {tab === "unterweisung" ? (
        <Karte>
          <table className="pv-table">
            <thead><tr><th>Modul</th><th>Status</th><th>Bestätigt am</th><th>Gültig bis</th><th>Quiz</th></tr></thead>
            <tbody>
              {MODULE.map((m) => {
                const ack = c.unterweisungen[m.id];
                const st = statusFuer(ack, HEUTE);
                return (
                  <tr key={m.id}>
                    <td>{t(m.titel, "de")}</td>
                    <td><Chip ton={st === "gueltig" ? "gut" : st === "laeuftBaldAb" ? "warn" : st === "abgelaufen" ? "err" : undefined}>{{ gueltig: "gültig", laeuftBaldAb: "läuft bald ab", abgelaufen: "abgelaufen", fehlt: "fehlt" }[st]}</Chip></td>
                    <td>{ack ? formatDatumDE(ack.bestaetigtAm) : "–"}</td>
                    <td>{ack ? formatDatumDE(ablaufDatum(ack.bestaetigtAm)) : "–"}</td>
                    <td className="mono">{ack ? `${Math.round(ack.quizScore * 100)} %` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Karte>
      ) : null}
      {tab === "stunden" ? (
        <Karte titel="Letzte Stundenzeilen" aktionen={<Link href="/admin/stunden" className="small">Zur Stundentabelle →</Link>}>
          <table className="pv-table">
            <thead><tr><th>Datum</th><th>Von–Bis</th><th>Auftrag</th><th>Status</th></tr></thead>
            <tbody>
              {zeilen.map((r) => (
                <tr key={r.id}><td>{formatDatumDE(r.datum)}</td><td className="mono">{r.start}–{r.ende}</td><td>{r.auftrag}</td><td><Chip>{r.status}</Chip></td></tr>
              ))}
              {zeilen.length === 0 ? <tr><td colSpan={4} className="muted">Noch keine Zeilen.</td></tr> : null}
            </tbody>
          </table>
        </Karte>
      ) : null}
      {tab === "bewertung" ? (
        <Karte>
          {c.ratings.length === 0 ? <div className="muted">Noch keine Bewertungen.</div> : null}
          <table className="pv-table">
            <thead><tr><th>Auftrag</th><th>Von</th><th>Pünktlich</th><th>Einsatz</th><th>Teamwork</th><th>Kommentar</th></tr></thead>
            <tbody>
              {c.ratings.map((r, i) => (
                <tr key={i}><td className="mono small">{r.jobId}</td><td>{r.von}</td><td className="mono">{r.puenktlich}</td><td className="mono">{r.einsatz}</td><td className="mono">{r.teamwork}</td><td>{r.kommentar || "–"}</td></tr>
              ))}
            </tbody>
          </table>
        </Karte>
      ) : null}
    </>
  );
}

