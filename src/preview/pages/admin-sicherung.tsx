"use client";
// Sicherung: Dokumente eines Monats als ZIP auf den eigenen Rechner laden – mit Auswahl, was hineinkommt
// (Konkretisierungen, Stundenzettel, Auslagen, Firmenbelege …). Es wird nur gelesen, nichts verändert.
import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Chip, Karte, Kopf, Note } from "../ui/kit";
import { HEUTE, usePv } from "../state/store";
import { monatsName } from "./helfer";
import { formatDatumDE } from "../logic/zeit";
import { BEREICHE, type BereichId } from "@/lib/neu/sicherung-bereiche";

interface Vorschau {
  zaehler: Partial<Record<BereichId, { dateien: number; bytes: number }>>;
  bytes: number;
  grenze: number;
  zuGross: boolean;
}

const SCHLUESSEL = "neu.sicherung.auswahl.v1";
const STANDARD: BereichId[] = ["konkretisierung", "stundennachweis", "auslagen"];

const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

// Der letzte volle Monat und die 35 davor
function monate(): string[] {
  let [y, m] = HEUTE.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 36; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function AdminSicherung() {
  const { s, melde, echt } = usePv();
  const liste = useMemo(monate, []);
  const [monat, setMonat] = useState(liste[0]);
  const [gewaehlt, setGewaehlt] = useState<BereichId[]>(STANDARD);
  const [originale, setOriginale] = useState(false);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ladeVorschau, setLadeVorschau] = useState(false);
  const geladen = useRef(false);

  // Die letzte Auswahl merkt sich nur dieser Browser (bequem, nicht wichtig)
  useEffect(() => {
    try {
      const roh = window.localStorage.getItem(SCHLUESSEL);
      if (roh) {
        const p = JSON.parse(roh) as { bereiche?: BereichId[]; originale?: boolean };
        const ok = (p.bereiche ?? []).filter((b) => BEREICHE.some((x) => x.id === b));
        if (ok.length > 0) setGewaehlt(ok);
        if (typeof p.originale === "boolean") setOriginale(p.originale);
      }
    } catch {
      /* ohne Speicher geht es auch */
    }
    geladen.current = true;
  }, []);
  useEffect(() => {
    if (!geladen.current) return;
    try {
      window.localStorage.setItem(SCHLUESSEL, JSON.stringify({ bereiche: gewaehlt, originale }));
    } catch {
      /* egal */
    }
  }, [gewaehlt, originale]);

  const query = useMemo(() => `monat=${monat}&bereiche=${gewaehlt.join(",")}${originale ? "&originale=1" : ""}`, [monat, gewaehlt, originale]);

  // Vorschau: wie viele Dateien, wie groß
  useEffect(() => {
    if (gewaehlt.length === 0) {
      setVorschau(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLadeVorschau(true);
      try {
        const r = await fetch(`/api/neu/sicherung/vorschau?${query}`, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
        const j = (await r.json().catch(() => null)) as (Vorschau & { error?: string }) | null;
        if (!r.ok || !j) return setFehler(j?.error ?? "Die Vorschau konnte nicht geladen werden.");
        setFehler(null);
        setVorschau(j);
      } catch {
        /* abgebrochen oder offline */
      } finally {
        setLadeVorschau(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, gewaehlt.length]);

  const umschalten = (id: BereichId) => setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : BEREICHE.map((b) => b.id).filter((x) => x === id || g.includes(x))));
  const mitBelegen = gewaehlt.some((g) => g === "auslagen" || g === "firmenbelege" || g === "privatbelege");

  const herunterladen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/neu/sicherung?${query}`, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        return setFehler(j?.error ?? `Die Sicherung konnte nicht erstellt werden (${r.status}).`);
      }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Sicherung_${monat}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      melde(`Sicherung ${monatsName(monat)} heruntergeladen (${mb(blob.size)}).`);
    } catch {
      setFehler("Die Sicherung konnte nicht heruntergeladen werden. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  };

  const bisherige = s.audit.filter((a) => a.tabelle === "sicherung").slice(0, 8);
  const vormonatGesichert = s.audit.some((a) => a.tabelle === "sicherung" && a.datensatz === liste[0]);

  if (echt && echt.rolle !== "admin") return <Note ton="warn">Nur die Administration erstellt Sicherungen.</Note>;

  const gruppe = (g: "alt" | "neu", titel: string) => (
    <Karte titel={titel}>
      <div className="col gap1">
        {BEREICHE.filter((b) => b.gruppe === g).map((b) => {
          const z = vorschau?.zaehler[b.id];
          return (
            <label key={b.id} className="pv-check" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={gewaehlt.includes(b.id)} onChange={() => umschalten(b.id)} aria-label={b.label} data-testid={`bereich-${b.id}`} />
              <span className="grow">
                <b>{b.label}</b>
                <div className="tiny muted">{b.text}</div>
              </span>
              {gewaehlt.includes(b.id) && z ? <Chip mono>{z.dateien}{z.bytes > 0 ? ` · ${mb(z.bytes)}` : ""}</Chip> : null}
            </label>
          );
        })}
      </div>
    </Karte>
  );

  return (
    <>
      <Kopf eyebrow="System" titel="Sicherung" sub="Dokumente eines Monats als ZIP auf deinen Rechner laden. Du wählst, was hineinkommt." />
      {!vormonatGesichert ? <div className="mb-2" style={{ marginBottom: "0.8rem" }}><Note ton="warn">Für {monatsName(liste[0])} gibt es noch keine Sicherung.</Note></div> : null}

      <Karte>
        <div className="row wrap">
          <div>
            <label className="pv-label" htmlFor="sicherung-monat">Monat</label>
            <select id="sicherung-monat" className="pv-select" style={{ minWidth: 200 }} value={monat} onChange={(e) => setMonat(e.target.value)} data-testid="sicherung-monat">
              {liste.map((m) => <option key={m} value={m}>{monatsName(m)}</option>)}
            </select>
          </div>
          <div className="row wrap" style={{ alignSelf: "flex-end" }}>
            <Btn v="sec" groesse="sm" onClick={() => setGewaehlt(STANDARD)}>Stundenzettel, Konkretisierungen, Auslagen</Btn>
            <Btn v="sec" groesse="sm" onClick={() => setGewaehlt(BEREICHE.map((b) => b.id))}>Alles</Btn>
            <Btn v="ghost" groesse="sm" onClick={() => setGewaehlt([])}>Nichts</Btn>
          </div>
        </div>
      </Karte>

      <div className="pva-grid c2 mt3">
        {gruppe("alt", "Bisheriges System (nur gelesen)")}
        {gruppe("neu", "Neues System")}
      </div>

      {mitBelegen ? (
        <div className="mt2"><label className="pv-check"><input type="checkbox" checked={originale} onChange={(e) => setOriginale(e.target.checked)} data-testid="originale" />Bei Belegen und Auslagen auch die <b>Original-Fotos</b> mitnehmen (macht die ZIP deutlich größer)</label></div>
      ) : null}

      <div className="mt3">
        <Karte titel="Zusammenfassung">
          {gewaehlt.length === 0 ? <div className="muted">Bitte mindestens einen Bereich wählen.</div> : (
            <div data-testid="sicherung-summe">
              <div className="row wrap">
                <b>{monatsName(monat)}</b>
                {ladeVorschau ? <span className="small muted">rechnet …</span> : vorschau ? <><Chip mono>{mb(vorschau.bytes)}</Chip><span className="small muted">von höchstens {mb(vorschau.grenze)}</span></> : null}
              </div>
              {vorschau?.zuGross ? <div className="mt2"><Note ton="err">Das ist zu viel für einen Download. Bitte weniger Bereiche auf einmal wählen (zum Beispiel Belege und Stundenzettel getrennt laden).</Note></div> : null}
            </div>
          )}
          {fehler ? <div className="pv-error mt2" role="alert">{fehler}</div> : null}
          <div className="row mt3">
            <Btn onClick={herunterladen} disabled={laeuft || gewaehlt.length === 0 || vorschau?.zuGross === true} data-testid="sicherung-laden">{laeuft ? "Wird erstellt …" : "Sicherung herunterladen"}</Btn>
          </div>
        </Karte>
      </div>

      <div className="pva-grid c2 mt3">
        <Karte titel="Zuletzt heruntergeladen">
          {bisherige.length === 0 ? <div className="muted">Noch keine Sicherung.</div> : (
            <table className="pv-table" data-testid="sicherung-verlauf">
              <tbody>{bisherige.map((a) => <tr key={a.id}><td className="small">{formatDatumDE(a.zeitpunkt.slice(0, 10))}</td><td className="small">{a.neu}<div className="tiny muted">{a.user}</div></td></tr>)}</tbody>
            </table>
          )}
        </Karte>
        <Karte titel="Gut zu wissen">
          <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
            <li>Die ZIP enthält die Dateien, eine <b>Inhalt.csv</b> mit Größe und SHA-256-Fingerabdruck je Datei und eine <b>LIESMICH.txt</b>.</li>
            <li>Das ist <b>keine komplette Datenbanksicherung</b>. Dafür gibt es die Datenbank-Sicherung (pg_dump oder die Backups bei Railway), siehe <span className="mono">docs/preview-umgebung.md</span>.</li>
            <li>Belege siehst du hier nur so, wie du sie auch im Belegbereich siehst (keine Belege anderer Administratoren; Mitarbeiter-Belege erst nach Freigabe).</li>
            <li>Der Personalstamm kommt ohne Geburtsdatum und ohne Bankdaten.</li>
            <li>Die Datei enthält Personen- und Belegdaten: verschlüsselt oder an einem geschützten Ort ablegen.</li>
          </ul>
        </Karte>
      </div>
    </>
  );
}
