"use client";
// Crew-Fragebogen (Modul D): 6 Etappen und ein Kurz-Check mit Situationsfragen,
// jede Antwort wird sofort gespeichert („Zwischenspeichern“), DE/EN.
import { useEffect, useState } from "react";
import { Link } from "../nav";
import { usePv, selbst } from "../state/store";
import { Bar, Btn, Chip, Feld, JaNein, Karte, LinkBtn, Note } from "../ui/kit";
import { ETAPPEN, SITUATIONSFRAGEN, fragenDerEtappe, type Frage } from "../logic/fragen";
import { antwortenZuProfil, fortschritt, handyGueltig, kleidungFehler, plzGueltig, situationVollstaendig, type Antworten } from "../logic/profil";
import { HOSEN_GROESSEN } from "../logic/fragen";
import { formatEuro } from "../logic/zeit";
import { TAETIGKEITEN, type NachweisStatus, type Taetigkeit } from "../logic/types";
import { geocodePlz, naechsterPool, POOLS } from "../logic/geo";
import { SpracheSchalter, CrewGate } from "./crew-start";

const NIVEAUS: Array<{ wert: "Grundkenntnisse" | "gut" | "fließend" | "Muttersprache"; de: string; en: string }> = [
  { wert: "Grundkenntnisse", de: "Grundkenntnisse", en: "Basic" },
  { wert: "gut", de: "gut", en: "good" },
  { wert: "fließend", de: "fließend", en: "fluent" },
  { wert: "Muttersprache", de: "Muttersprache", en: "native" },
];
const ANZAHL_ETAPPEN = ETAPPEN.length + 1;

export function CrewFragebogen() {
  return (
    <CrewGate>
      <Inhalt />
    </CrewGate>
  );
}

function Inhalt() {
  const { s, set, melde } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const a = s.antworten;
  const etappe = s.etappe;
  const [zeigeFehler, setZeigeFehler] = useState(false);

  // Beim ersten Öffnen mit dem vorbelegen, was wir schon wissen
  useEffect(() => {
    if (a.vorname === "" && a.handy === "") setA({ vorname: ich.vorname, nachname: ich.nachname, handy: ich.telefon, email: ich.email });
  }, []);

  const setA = (patch: Partial<Antworten>) => set((st) => ({ ...st, antworten: { ...st.antworten, ...patch } }));
  const gehZu = (n: number) => set((st) => ({ ...st, etappe: n }));

  const fehlerFuer = (f: Frage): string | null => {
    if (f.typ === "kleidung") {
      if (!s.einst.kleidung.aktiv) return null;
      const k = kleidungFehler(a, s.einst.kleidung.artikel);
      return k ? (de ? k : "Please complete your clothing choice (items and sizes).") : null;
    }
    const wert = (a as unknown as Record<string, unknown>)[f.id];
    if (f.pflicht && (wert === null || wert === undefined || wert === "")) return de ? "Bitte ausfüllen." : "Please fill in.";
    if (f.typ === "plz" && wert && !plzGueltig(String(wert))) return de ? "Bitte eine 5-stellige Postleitzahl." : "Please enter a 5-digit postcode.";
    if (f.typ === "tel" && wert && !handyGueltig(String(wert))) return de ? "Bitte eine gültige Handynummer." : "Please enter a valid mobile number.";
    if (f.id === "volljaehrig" && wert === false) return de ? "Für Einsätze musst du volljährig sein." : "You must be of legal age.";
    return null;
  };
  const etappenFehler = (n: number): string[] => (n <= ETAPPEN.length ? fragenDerEtappe(n).filter((f) => fehlerFuer(f) !== null).map((f) => f.id) : situationVollstaendig(a) ? [] : ["situation"]);

  const weiter = () => {
    if (etappenFehler(etappe).length > 0) {
      setZeigeFehler(true);
      return;
    }
    setZeigeFehler(false);
    if (etappe < ANZAHL_ETAPPEN) gehZu(etappe + 1);
    else absenden();
  };

  const absenden = () => {
    const ort = geocodePlz(a.plz);
    const pool = ort ? naechsterPool(ort).pool : ich.pool;
    set((st) => ({
      ...st,
      fragebogenFertig: true,
      crew: st.crew.map((c) => (c.id === ich.id ? { ...c, vorname: a.vorname, nachname: a.nachname, telefon: a.handy, email: a.email, plz: a.plz, wohnort: a.wohnort, pool, profile: antwortenZuProfil(a) } : c)),
    }));
    melde(de ? "Danke! Dein Fragebogen ist angekommen." : "Thank you! Your questionnaire has arrived.");
  };

  if (s.fragebogenFertig) {
    const ort = geocodePlz(ich.plz);
    const pz = ort ? naechsterPool(ort) : null;
    return (
      <div className="col gap3">
        <Karte>
          <div className="eyebrow">{de ? "Geschafft" : "Done"}</div>
          <h1 className="mt1">{de ? "Danke, " : "Thank you, "}{ich.vorname}!</h1>
          <p className="mt2">{de ? "Wir schauen uns deine Angaben an und melden uns bei passenden Jobs. Du kannst dich schon jetzt auf Jobs bewerben." : "We will review your answers and get in touch about matching jobs. You can already apply for jobs."}</p>
          {pz ? <div className="mt2"><Chip ton="info">{de ? `Nächster Standort: ${POOLS[pz.pool].name}, ca. ${pz.minuten} min` : `Nearest hub: ${POOLS[pz.pool].name}, about ${pz.minuten} min`}</Chip></div> : null}
        </Karte>
        <LinkBtn href="/crew/jobs" block groesse="lg">{de ? "Jobs ansehen" : "See jobs"}</LinkBtn>
        <Btn v="sec" block onClick={() => set((st) => ({ ...st, fragebogenFertig: false, etappe: 1 }))}>{de ? "Angaben ändern" : "Edit answers"}</Btn>
      </div>
    );
  }

  const fb = fortschritt(a);
  const titel = etappe <= ETAPPEN.length ? ETAPPEN[etappe - 1].titel[s.lang] : de ? "Kurz-Check" : "Quick check";
  const fehlerIds = zeigeFehler ? etappenFehler(etappe) : [];

  return (
    <div className="col gap2">
      <div className="row between"><div className="eyebrow">{de ? `Etappe ${etappe} von ${ANZAHL_ETAPPEN}` : `Step ${etappe} of ${ANZAHL_ETAPPEN}`}</div><SpracheSchalter /></div>
      <h1>{titel}</h1>
      <Bar anteil={fb.beantwortet / fb.gesamt} />
      <div className="tiny muted">{de ? `${fb.beantwortet} von ${fb.gesamt} beantwortet · alles wird sofort gespeichert` : `${fb.beantwortet} of ${fb.gesamt} answered · everything is saved immediately`}</div>

      {etappe <= ETAPPEN.length ? (
        <Karte>
          {fragenDerEtappe(etappe).map((f) => (
            <FrageFeld key={f.id} f={f} a={a} setA={setA} lang={s.lang} fehler={fehlerIds.includes(f.id) ? fehlerFuer(f) : null} />
          ))}
        </Karte>
      ) : (
        <div className="col">
          {SITUATIONSFRAGEN.map((q, i) => (
            <Karte key={q.id}>
              <b>{i + 1}. {q.frage[s.lang]}</b>
              <div className="col gap1 mt2">
                {q.optionen.map((o, j) => (
                  <button key={j} type="button" className={`pv-opt ${a.situation[i] === j ? "sel" : ""}`} onClick={() => setA({ situation: a.situation.map((x, k) => (k === i ? j : x)) })} aria-pressed={a.situation[i] === j}>
                    {o[s.lang]}
                  </button>
                ))}
              </div>
            </Karte>
          ))}
          {fehlerIds.includes("situation") ? <div className="pv-error">{de ? "Bitte alle vier Fragen beantworten." : "Please answer all four questions."}</div> : null}
        </div>
      )}

      <div className="row mt2">
        {etappe > 1 ? <Btn v="sec" onClick={() => { setZeigeFehler(false); gehZu(etappe - 1); }}>{de ? "Zurück" : "Back"}</Btn> : null}
        <Btn className="grow" onClick={weiter} data-testid="weiter">{etappe < ANZAHL_ETAPPEN ? (de ? "Weiter" : "Next") : de ? "Absenden" : "Submit"}</Btn>
      </div>
      <Link href="/crew" className="small" style={{ textAlign: "center" }}>{de ? "Zwischenspeichern und später weitermachen" : "Save and continue later"}</Link>
      <Note>{de ? "Wir fragen nur, was für die Arbeit nötig ist – nicht nach Alter, Herkunft, Religion oder Gesundheit." : "We only ask what is needed for the job – not about age, origin, religion or health."}</Note>
    </div>
  );
}

function FrageFeld({ f, a, setA, lang, fehler }: { f: Frage; a: Antworten; setA: (p: Partial<Antworten>) => void; lang: "de" | "en"; fehler: string | null }) {
  const { s } = usePv();
  const de = lang === "de";
  const rec = a as unknown as Record<string, unknown>;
  const wert = rec[f.id];
  const label = f.label[lang];
  const hilfe = f.hilfe?.[lang];
  const feld = (inhalt: React.ReactNode) => <Feld label={label} hint={hilfe} fehler={fehler}>{inhalt}</Feld>;

  switch (f.typ) {
    case "text":
    case "email":
    case "tel":
    case "plz":
      return feld(<input className="pv-input" aria-label={label} type={f.typ === "email" ? "email" : "text"} inputMode={f.typ === "tel" ? "tel" : f.typ === "plz" ? "numeric" : undefined} maxLength={f.typ === "plz" ? 5 : undefined} value={String(wert ?? "")} onChange={(e) => setA({ [f.id]: e.target.value } as Partial<Antworten>)} />);
    case "zahl":
      return feld(
        <div className="row">
          <input className="pv-input mono" aria-label={label} inputMode="numeric" value={wert === null || wert === undefined ? "" : String(wert)} onChange={(e) => { const t = e.target.value.replace(/\D/g, ""); setA({ [f.id]: t === "" ? null : Number(t) } as Partial<Antworten>); }} />
          {f.einheit ? <span className="muted">{f.einheit}</span> : null}
        </div>
      );
    case "ja-nein":
      return feld(<JaNein lang={lang} wert={(wert as boolean | null) ?? null} onChange={(v) => setA({ [f.id]: v } as Partial<Antworten>)} />);
    case "auswahl":
      return feld(
        <select className="pv-select" aria-label={label} value={String(wert ?? "")} onChange={(e) => setA({ [f.id]: e.target.value } as Partial<Antworten>)}>
          <option value="">{de ? "Bitte wählen" : "Please choose"}</option>
          {f.optionen?.map((o) => <option key={o.wert} value={o.wert}>{o[lang]}</option>)}
        </select>
      );
    case "mehrfach": {
      const gew = (wert as string[]) ?? [];
      return feld(
        <div className="row wrap">
          {f.optionen?.map((o) => (
            <button key={o.wert} type="button" className={`pv-chip ${gew.includes(o.wert) ? "navy" : ""}`} style={{ border: 0, cursor: "pointer", padding: "0.45rem 0.8rem", fontSize: "0.85rem" }} aria-pressed={gew.includes(o.wert)} onClick={() => setA({ wochentage: gew.includes(o.wert) ? gew.filter((x) => x !== o.wert) : [...gew, o.wert] })}>{o[lang]}</button>
          ))}
        </div>
      );
    }
    case "sprachen": {
      const liste = a.sprachen;
      return feld(
        <div className="col gap1">
          {liste.map((sp, i) => (
            <div key={i} className="row">
              <input className="pv-input sm" aria-label={`${de ? "Sprache" : "Language"} ${i + 1}`} value={sp.sprache} onChange={(e) => setA({ sprachen: liste.map((x, j) => (j === i ? { ...x, sprache: e.target.value } : x)) })} />
              <select className="pv-select sm" aria-label={`${de ? "Niveau" : "Level"} ${i + 1}`} value={sp.niveau} onChange={(e) => setA({ sprachen: liste.map((x, j) => (j === i ? { ...x, niveau: e.target.value as typeof sp.niveau } : x)) })}>
                {NIVEAUS.map((n) => <option key={n.wert} value={n.wert}>{n[lang]}</option>)}
              </select>
              <Btn v="ghost" groesse="sm" onClick={() => setA({ sprachen: liste.filter((_, j) => j !== i) })} aria-label={de ? "Entfernen" : "Remove"}>✕</Btn>
            </div>
          ))}
          <Btn v="sec" groesse="sm" onClick={() => setA({ sprachen: [...liste, { sprache: "", niveau: "gut" }] })}>+ {de ? "Sprache" : "Language"}</Btn>
        </div>
      );
    }
    case "erfahrung":
      return feld(
        <div className="col gap1">
          {TAETIGKEITEN.map((t: Taetigkeit) => (
            <div key={t} className="row">
              <span style={{ width: 92 }} className="small"><b>{t}</b></span>
              <input className="pv-input sm mono" style={{ width: 64 }} inputMode="numeric" aria-label={`${t} ${de ? "Jahre" : "years"}`} value={a.erfahrung[t].jahre || ""} placeholder={de ? "Jahre" : "yrs"} onChange={(e) => setA({ erfahrung: { ...a.erfahrung, [t]: { ...a.erfahrung[t], jahre: Number(e.target.value.replace(/\D/g, "")) || 0 } } })} />
              <input className="pv-input sm mono" style={{ width: 80 }} inputMode="numeric" aria-label={`${t} ${de ? "Einsätze" : "jobs"}`} value={a.erfahrung[t].einsaetze || ""} placeholder={de ? "Einsätze" : "jobs"} onChange={(e) => setA({ erfahrung: { ...a.erfahrung, [t]: { ...a.erfahrung[t], einsaetze: Number(e.target.value.replace(/\D/g, "")) || 0 } } })} />
            </div>
          ))}
        </div>
      );
    case "kleidung": {
      const k = s.einst.kleidung;
      if (!k.aktiv) return null;
      const gewaehlt = k.artikel.filter((x) => a.kleidungArtikel.includes(x.id));
      return (
        <Feld label={label} hint={k.pfandHinweis} fehler={fehler}>
          <div data-testid="kleidung">
            <JaNein lang={lang} wert={a.kleidungWunsch} onChange={(v) => setA({ kleidungWunsch: v })} />
            {a.kleidungWunsch === true ? (
              <div className="col gap1 mt2">
                <div className="small muted">{de ? "Was möchtest du haben?" : "What would you like?"}</div>
                {k.artikel.map((x) => {
                  const an = a.kleidungArtikel.includes(x.id);
                  return (
                    <label key={x.id} className="pv-check">
                      <input type="checkbox" checked={an} onChange={() => setA({ kleidungArtikel: an ? a.kleidungArtikel.filter((y) => y !== x.id) : [...a.kleidungArtikel, x.id] })} aria-label={x.label} />
                      <span>{x.label}{x.pfandEur ? ` · ${de ? "Pfand" : "deposit"} ${formatEuro(x.pfandEur)}` : ""}</span>
                    </label>
                  );
                })}
                {gewaehlt.some((x) => x.groessen === "hose") ? (
                  <select className="pv-select" aria-label={de ? "Hosengröße" : "Trouser size"} value={a.hosengroesse} onChange={(e) => setA({ hosengroesse: e.target.value })}>
                    <option value="">{de ? "Hosengröße wählen" : "Choose trouser size"}</option>
                    {HOSEN_GROESSEN.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                ) : null}
                {gewaehlt.some((x) => x.groessen === "shirt") && !a.shirt ? <div className="tiny muted">{de ? "Bitte oben die Shirtgröße angeben." : "Please enter your shirt size above."}</div> : null}
                {gewaehlt.some((x) => x.groessen === "schuh") && !a.schuhgroesse ? <div className="tiny muted">{de ? "Bitte oben die Schuhgröße angeben." : "Please enter your shoe size above."}</div> : null}
              </div>
            ) : null}
          </div>
        </Feld>
      );
    }
    case "nachweis": {
      const status = (wert as NachweisStatus) ?? "keiner";
      return feld(
        <div className="row wrap">
          <Btn v={status === "keiner" ? "navy" : "sec"} groesse="sm" onClick={() => setA({ [f.id]: "keiner" } as Partial<Antworten>)} aria-pressed={status === "keiner"}>{de ? "Habe ich nicht" : "I do not have it"}</Btn>
          <Btn v={status === "angegeben" ? "navy" : "sec"} groesse="sm" onClick={() => setA({ [f.id]: "angegeben" } as Partial<Antworten>)} aria-pressed={status === "angegeben"}>📷 {de ? "Foto hochladen" : "Upload photo"}</Btn>
          {status === "angegeben" ? <Chip ton="info">{de ? "wird geprüft" : "will be verified"}</Chip> : null}
        </div>
      );
    }
    default:
      return null;
  }
}

