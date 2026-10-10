"use client";
// Pflicht & Videos: welche Schulung für was nötig ist, und das Video je Modul.
// Die Regeln gelten sofort für Bewerbungen (Crew-Seite) und die Passung in der Disposition.
import { useMemo, useState } from "react";
import { usePv } from "../state/store";
import { Btn, Chip, Feld, Karte, Note, kopiere } from "../ui/kit";
import { MODULE, t } from "../data/trainings";
import { MODUL_IDS, standardSchulung, standardVideos, type ModulId, type SchulungRegeln, type VideoEintrag } from "../logic/unterweisung";
import { TAETIGKEITEN, type Taetigkeit } from "../logic/types";
import { videoEinbettung } from "../logic/video";

export function drehbuch(modulId: string, sprache: "de" | "en"): string {
  const m = MODULE.find((x) => x.id === modulId);
  if (!m) return "";
  const de = sprache === "de";
  const zeilen = [
    de ? `DREHBUCH – ${t(m.titel, "de")} (Entwurf, ca. ${m.karten.length * 25} Sekunden)` : `SCRIPT – ${t(m.titel, "en")} (draft, about ${m.karten.length * 25} seconds)`,
    de ? "Format: Hochkant (9:16) fürs Handy, Untertitel immer an, ruhige Sprecherstimme, keine Musik mit Text." : "Format: vertical (9:16) for phones, subtitles always on, calm voice-over, no music with lyrics.",
    "",
  ];
  m.karten.forEach((k, i) => {
    zeilen.push(de ? `Szene ${i + 1} – ${t(k.titel, "de")}` : `Scene ${i + 1} – ${t(k.titel, "en")}`);
    zeilen.push(de ? `  Sprecher: ${t(k.text, "de")}` : `  Voice-over: ${t(k.text, "en")}`);
    zeilen.push(de ? `  Bild: Kurze Szene auf einer echten Veranstaltung, die „${t(k.titel, "de")}“ zeigt (richtig gemacht, danach kurz der typische Fehler durchgestrichen).` : `  Picture: short scene at a real event showing “${t(k.titel, "en")}” (done right, then the typical mistake crossed out).`);
    zeilen.push(de ? `  Einblendung: ${t(k.titel, "de")}` : `  On screen: ${t(k.titel, "en")}`);
    zeilen.push("");
  });
  zeilen.push(de ? "Schluss: „Gleich folgt das kurze Quiz.“ – Logo fess.jobs, 3 Sekunden." : "End: “The short quiz follows.” – fess.jobs logo, 3 seconds.");
  if (m.hinweis) zeilen.push("", (de ? "Pflichthinweis im Bild: " : "Required note on screen: ") + t(m.hinweis, sprache));
  return zeilen.join("\n");
}

export function PflichtUndVideos() {
  const { s, set, melde, echt } = usePv();
  const r = s.einst.schulung;
  const istAdmin = !echt || echt.rolle === "admin";
  const [offenVideo, setOffenVideo] = useState<string | null>(null);
  const kunden = useMemo(() => [...new Set([...s.jobs.map((j) => j.kunde), ...s.auftraege.map((a) => a.kunde)])].sort(), [s.jobs, s.auftraege]);
  const aendere = (fn: (x: SchulungRegeln) => SchulungRegeln) => set((st) => ({ ...st, einst: { ...st.einst, schulung: fn(st.einst.schulung) } }));
  const umschalten = (liste: ModulId[], m: ModulId) => (liste.includes(m) ? liste.filter((x) => x !== m) : MODUL_IDS.filter((x) => x === m || liste.includes(x)));
  const kurz = (id: ModulId) => t(MODULE.find((x) => x.id === id)?.titel ?? { de: id, en: id }, "de");

  const Zeile = ({ label, liste, onChange, testid }: { label: string; liste: ModulId[]; onChange: (l: ModulId[]) => void; testid: string }) => (
    <tr data-testid={testid}>
      <td><b>{label}</b></td>
      {MODUL_IDS.map((m) => (
        <td key={m} style={{ textAlign: "center" }}>
          <input type="checkbox" disabled={!istAdmin} checked={liste.includes(m)} aria-label={`${label}: ${kurz(m)}`} onChange={() => onChange(umschalten(liste, m))} />
        </td>
      ))}
    </tr>
  );

  return (
    <div className="col gap2" data-testid="pflicht-videos">
      <Karte titel="Welche Schulung ist für was nötig?" aktionen={istAdmin ? <Btn v="ghost" groesse="sm" onClick={() => { aendere((x) => ({ ...standardSchulung(), video: x.video })); melde("Pflicht auf Standard zurückgesetzt (Videos bleiben)."); }}>Auf Standard</Btn> : undefined}>
        <p className="small">Ein Haken heißt: Diese Schulung muss gültig sein, bevor sich jemand für einen Auftrag bewerben kann. Die Regeln zählen zusammen (Auftrag + Tätigkeit + Höhe + Kunde + Zusatz im Auftrag).</p>
        <div className="pv-scroll mt2">
          <table className="pv-table">
            <thead><tr><th>Gilt für …</th>{MODUL_IDS.map((m) => <th key={m} title={kurz(m)} style={{ textAlign: "center" }}>{m}</th>)}</tr></thead>
            <tbody>
              <Zeile label="Jeden Auftrag" liste={r.pflichtAlle} onChange={(l) => aendere((x) => ({ ...x, pflichtAlle: l }))} testid="regel-alle" />
              {TAETIGKEITEN.map((tk: Taetigkeit) => <Zeile key={tk} label={`Tätigkeit ${tk}`} liste={r.pflichtJeTaetigkeit[tk] ?? []} onChange={(l) => aendere((x) => ({ ...x, pflichtJeTaetigkeit: { ...x.pflichtJeTaetigkeit, [tk]: l } }))} testid={`regel-${tk}`} />)}
              <Zeile label="Arbeiten in der Höhe" liste={r.pflichtHoehe} onChange={(l) => aendere((x) => ({ ...x, pflichtHoehe: l }))} testid="regel-hoehe" />
              <Zeile label="Vor der Freigabe (Aufträge sehen)" liste={r.freigabeModule} onChange={(l) => aendere((x) => ({ ...x, freigabeModule: l }))} testid="regel-freigabe" />
            </tbody>
          </table>
        </div>
        <div className="small muted mt2">Module: {MODUL_IDS.map((m) => `${m} = ${kurz(m)}`).join(" · ")}</div>
      </Karte>

      <Karte titel="Zusätzlich für bestimmte Kunden">
        <p className="small">Manche Kunden verlangen eine bestimmte Schulung (z. B. Höhe auf einer Messe). Für ihre Aufträge gilt sie zusätzlich.</p>
        <div className="col mt2">
          {r.jeKunde.map((k, i) => (
            <div key={i} className="pv-card flat" style={{ background: "var(--mist)" }}>
              <div className="row between">
                <input className="pv-input sm" style={{ maxWidth: 280 }} list="kunden-liste" placeholder="Kunde" aria-label={`Kunde ${i + 1}`} disabled={!istAdmin} value={k.kunde} onChange={(e) => aendere((x) => ({ ...x, jeKunde: x.jeKunde.map((y, j) => (j === i ? { ...y, kunde: e.target.value } : y)) }))} />
                {istAdmin ? <Btn v="ghost" groesse="sm" aria-label="Regel entfernen" onClick={() => aendere((x) => ({ ...x, jeKunde: x.jeKunde.filter((_, j) => j !== i) }))}>✕</Btn> : null}
              </div>
              <div className="row wrap mt1">
                {MODUL_IDS.map((m) => (
                  <button key={m} type="button" disabled={!istAdmin} className={`pv-chip ${k.module.includes(m) ? "navy" : ""}`} style={{ border: 0, cursor: istAdmin ? "pointer" : "default" }} aria-pressed={k.module.includes(m)} title={kurz(m)} onClick={() => aendere((x) => ({ ...x, jeKunde: x.jeKunde.map((y, j) => (j === i ? { ...y, module: umschalten(y.module, m) } : y)) }))}>{m}</button>
                ))}
              </div>
            </div>
          ))}
          <datalist id="kunden-liste">{kunden.map((k) => <option key={k} value={k} />)}</datalist>
          {istAdmin ? <div><Btn v="sec" groesse="sm" onClick={() => aendere((x) => ({ ...x, jeKunde: [...x.jeKunde, { kunde: "", module: [] }] }))} data-testid="kundenregel-neu">+ Kundenregel</Btn></div> : null}
        </div>
        <div className="pv-hint">Auch einzelne Aufträge können zusätzliche Schulungen verlangen – das stellst du beim Anlegen des Auftrags ein.</div>
      </Karte>

      <Karte titel="Videos zu den Schulungen" aktionen={istAdmin ? <Btn v="ghost" groesse="sm" onClick={() => { aendere((x) => ({ ...x, video: standardVideos() })); melde("Alle Videos auf die mitgelieferten zurückgesetzt."); }} data-testid="videos-standard-alle">Alle auf Standard</Btn> : undefined}>
        <p className="small">Die acht mitgelieferten Videos (Deutsch) sind schon eingetragen. Wer die Schulung macht, sieht zuerst das Video – es muss bis zum Ende laufen (Vorspulen ist gesperrt), danach folgen Lernkarten, Quiz und die Unterschrift. Du kannst pro Modul eine andere Adresse eintragen (YouTube, Vimeo oder eine Videodatei, immer <b>https</b>) oder das Video entfernen.</p>
        <div className="small muted mt1">Eigene Videos liegen im Ordner <code>public/videos</code> und werden nur an angemeldete Personen ausgeliefert. Der Dateiname entspricht dem Modul (z. B. <code>grund.de.mp4</code>); ein ausgetauschtes Video bekommt einen neuen Dateinamen (z. B. <code>grund.de.v2.mp4</code>), sonst zeigen Handys eventuell noch die alte Version. Bei YouTube/Vimeo kann der Player nicht prüfen, ob bis zum Ende geschaut wurde – dort bestätigt die Person es selbst. YouTube wird ohne Cookies (youtube-nocookie.com) eingebunden, lädt aber trotzdem von Google.</div>
        <div className="col mt2">
          {MODULE.map((m) => {
            const std = standardVideos()[m.id];
            const v: VideoEintrag | undefined = r.video[m.id];
            const istStandard = !!v && v.url === std.url && !v.urlEn;
            const emb = v?.url ? videoEinbettung(v.url) : null;
            const setzeVideo = (patch: Partial<VideoEintrag>) => aendere((x) => {
              const neu: VideoEintrag = { ...(x.video[m.id] ?? { url: "", titel: "", pflicht: false }), ...patch };
              // Leere Adresse = absichtlich kein Video; sonst die Markierung wieder weg
              if (neu.url.trim() === "") neu.entfernt = true;
              else delete neu.entfernt;
              return { ...x, video: { ...x.video, [m.id]: neu } };
            });
            const eigenes = emb?.art === "video";
            return (
              <div key={m.id} className="pv-card flat" style={{ background: "var(--mist)" }} data-testid={`video-${m.id}`}>
                <div className="row between"><b>{t(m.titel, "de")}</b>{v?.url ? (emb ? <Chip ton="gut">{istStandard ? "Mitgeliefertes Video" : emb.art === "iframe" ? "YouTube/Vimeo erkannt" : emb.art === "video" ? "Videodatei erkannt" : "Link"}</Chip> : <Chip ton="err">Adresse ungültig (nur https oder eigene Datei)</Chip>) : <Chip>Kein Video</Chip>}</div>
                <div className="pva-grid c2 mt1">
                  <Feld label="Adresse des Videos (Deutsch)"><input className="pv-input sm" aria-label={`Video-Adresse ${m.id}`} disabled={!istAdmin} placeholder="https://youtu.be/…" value={v?.url ?? ""} onChange={(e) => setzeVideo({ url: e.target.value })} /></Feld>
                  <Feld label="Titel (optional)"><input className="pv-input sm" aria-label={`Video-Titel ${m.id}`} disabled={!istAdmin} value={v?.titel ?? ""} onChange={(e) => setzeVideo({ titel: e.target.value })} /></Feld>
                </div>
                <div className="pva-grid c2">
                  <Feld label="Adresse der englischen Fassung (optional)"><input className="pv-input sm" aria-label={`Video-Adresse Englisch ${m.id}`} disabled={!istAdmin} placeholder={`${std.url.replace(".de.mp4", ".en.mp4")}`} value={v?.urlEn ?? ""} onChange={(e) => setzeVideo({ urlEn: e.target.value })} /></Feld>
                </div>
                <div className="row wrap">
                  <label className="pv-check"><input type="checkbox" disabled={!istAdmin || !v?.url} checked={v?.pflicht ?? false} onChange={(e) => setzeVideo({ pflicht: e.target.checked })} aria-label={`Video Pflicht ${m.id}`} />{eigenes ? "Pflicht: Video muss vollständig abgespielt werden" : "Pflicht: Person bestätigt „Video angesehen“"}</label>
                  <Btn v="ghost" groesse="sm" onClick={() => setOffenVideo(offenVideo === m.id ? null : m.id)}>{offenVideo === m.id ? "Drehbuch zuklappen" : "Drehbuch-Entwurf"}</Btn>
                  {istAdmin && !istStandard ? <Btn v="ghost" groesse="sm" onClick={() => { aendere((x) => ({ ...x, video: { ...x.video, [m.id]: std } })); melde("Mitgeliefertes Video wieder eingetragen."); }} data-testid={`video-standard-${m.id}`}>Standard wiederherstellen</Btn> : null}
                  {istAdmin && v?.url ? <Btn v="ghost" groesse="sm" onClick={() => aendere((x) => ({ ...x, video: { ...x.video, [m.id]: { url: "", titel: "", pflicht: false, entfernt: true } } }))} data-testid={`video-entfernen-${m.id}`}>Video entfernen</Btn> : null}
                </div>
                {offenVideo === m.id ? (
                  <div className="mt2">
                    <pre className="small" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--body)", margin: 0 }}>{drehbuch(m.id, "de")}</pre>
                    <div className="row mt1">
                      <Btn v="sec" groesse="sm" onClick={async () => melde((await kopiere(drehbuch(m.id, "de"))) ? "Drehbuch (Deutsch) kopiert." : "Kopieren nicht möglich.")}>Deutsch kopieren</Btn>
                      <Btn v="sec" groesse="sm" onClick={async () => melde((await kopiere(drehbuch(m.id, "en"))) ? "Script (English) copied." : "Kopieren nicht möglich.")}>English kopieren</Btn>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt2"><Note>Die Texte der Videos und die Drehbücher sind Entwürfe nach den Lernkarten – sie sind nicht von einer Fachkraft für Arbeitssicherheit freigegeben. Die Sprecherstimme der mitgelieferten Videos ist eine KI-Stimme; bitte vor dem Livegang prüfen, ob sie gekennzeichnet werden muss.</Note></div>
      </Karte>
    </div>
  );
}

export type { SchulungRegeln };
