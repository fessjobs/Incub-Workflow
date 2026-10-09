"use client";
// Stundentabelle (Modul E): 18 Spalten direkt bearbeitbar, Plausibilität live,
// Filter und Gruppierung, Einfügen aus Excel, Status, Massenbearbeitung,
// Änderungsprotokoll, Export. Nur Beispieldaten, nur im Browser.
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { crewNachPnr, usePv, HEUTE } from "../state/store";
import { Btn, Chip, Kopf, Modal, Note, Offen, Tabs, ladeTextHerunter } from "../ui/kit";
import { pruefeZeilen, zaehleWarnungen } from "../logic/stunden";
import type { StundenRow, StundenStatus, Warnung } from "../logic/types";
import { BEARBEITBAR, SPALTEN, einfuegen, feldWert, istTabellenText, neueZeile, parseEinfuegen, setzeFeld, setzePausen, spaltenFuerWarnung, type EditKontext, type Spalte, type SpalteKey } from "../logic/stundentabelle";
import { formatDatumDE, formatDezimal, formatEuro, gesamtzeit } from "../logic/zeit";
import { DEFAULT_EXPORT, excelCsv, exportZeilen, pruefbericht, zvooveCsv } from "../logic/export";
import { BEARBEITER, naechsterStatus, setzeStatus, uebernehmeAenderungen } from "./stunden-aktionen";
import { neueAudit } from "../state/store";
import { vollName } from "./helfer";

const H = 32;
const W_SEL = 34;
const W_STATUS = 100;
const W_WARN = 44;
const W_ZETTEL = 84;
const BREITE = W_SEL + W_STATUS + W_WARN + SPALTEN.reduce((n, sp) => n + sp.breite, 0) + W_ZETTEL;

type Gruppe = "" | "auftrag" | "kunde" | "mitarbeiter" | "tag" | "monat";
type Item = { k: "g"; key: string; label: string; n: number; std: number } | { k: "z"; row: StundenRow; r: number };

const MONAT_NAME: Record<string, string> = { "2026-09": "September 2026", "2026-10": "Oktober 2026" };

// ─── Eingabezelle ───────────────────────────────────────────────────────────

interface ZelleProps {
  wert: string;
  spalte: Spalte;
  r: number;
  klasse: string;
  titel?: string;
  onCommit: (text: string) => boolean;
  nav: (r: number, key: SpalteKey) => void;
  liste?: string;
  label: string;
}

function GridInput({ wert, spalte, r, klasse, titel, onCommit, nav, liste, label }: ZelleProps) {
  const [draft, setDraft] = useState(wert);
  const letzter = useRef<string | null>(null);
  useEffect(() => {
    setDraft(wert);
    letzter.current = null;
  }, [wert]);

  const commit = () => {
    if (draft === wert || letzter.current === draft) return;
    letzter.current = draft;
    if (!onCommit(draft)) {
      setDraft(wert);
      letzter.current = null;
    }
  };
  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      nav(e.shiftKey ? r - 1 : r + 1, spalte.key);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      nav(r + 1, spalte.key);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      nav(r - 1, spalte.key);
    } else if (e.key === "Escape") {
      setDraft(wert);
      letzter.current = null;
    }
  };
  const num = spalte.art === "zahl";
  return (
    <div className={klasse} style={{ width: spalte.breite }} title={titel}>
      <input
        value={draft}
        data-r={r}
        data-c={spalte.key}
        aria-label={label}
        list={liste}
        inputMode={num ? "decimal" : undefined}
        className={num ? "num" : spalte.art === "zeit" ? "time" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={taste}
      />
    </div>
  );
}

// ─── Seite ──────────────────────────────────────────────────────────────────

export function AdminStunden() {
  const { s, set, melde } = usePv();
  const sRef = useRef(s);
  sRef.current = s;

  const crewMap = useMemo(() => crewNachPnr(s), [s]);
  const warn = useMemo(() => pruefeZeilen(s.stunden, { personen: new Map([...crewMap].map(([pnr, c]) => [pnr, { vertraege: c.contract ? [c.contract] : [] }])) }), [s.stunden, crewMap]);
  const summe = useMemo(() => zaehleWarnungen(warn), [warn]);

  const kundenListe = useMemo(() => [...new Set(s.auftraege.map((a) => a.kunde))].sort(), [s.auftraege]);
  const auftragListe = useMemo(() => s.auftraege.map((a) => a.id), [s.auftraege]);
  const ctx = useMemo<EditKontext>(() => ({ jahr: 2026, auftraege: new Map(s.auftraege.map((a) => [a.id, a.kunde])), kunden: kundenListe }), [s.auftraege, kundenListe]);

  // Filter
  const [monat, setMonat] = useState("");
  const [kunde, setKunde] = useState("");
  const [auftrag, setAuftrag] = useState("");
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");
  const [quelle, setQuelle] = useState("");
  const [auff, setAuff] = useState<"" | "fehler" | "alle">("");
  const [gruppe, setGruppe] = useState<Gruppe>("");
  const [neuesteZuerst, setNeuesteZuerst] = useState(true);
  const [zu, setZu] = useState<Set<string>>(new Set());

  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const letzteAuswahl = useRef<number | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exportOffen, setExportOffen] = useState(false);
  const [massOffen, setMassOffen] = useState(false);
  const [protokoll, setProtokoll] = useState(false);
  const [begruendung, setBegruendung] = useState<{ titel: string; hinweis: string; ok: (grund: string) => void } | null>(null);

  const gefiltert = useMemo(() => {
    const q = person.trim().toLowerCase();
    const liste = s.stunden.filter((r) => {
      if (monat && !r.datum.startsWith(monat)) return false;
      if (kunde && r.kunde !== kunde) return false;
      if (auftrag && r.auftrag !== auftrag) return false;
      if (status && r.status !== status) return false;
      if (quelle && r.quelle !== quelle) return false;
      if (q) {
        const c = crewMap.get(r.pnr);
        if (!`${r.pnr} ${c ? vollName(c) : ""}`.toLowerCase().includes(q)) return false;
      }
      if (auff) {
        const w = warn.get(r.id) ?? [];
        if (auff === "fehler" ? !w.some((x) => x.level === "fehler") : w.length === 0) return false;
      }
      return true;
    });
    return neuesteZuerst ? [...liste].reverse() : liste;
  }, [s.stunden, crewMap, warn, monat, kunde, auftrag, person, status, quelle, auff, neuesteZuerst]);

  const items = useMemo<Item[]>(() => {
    const gk = (r: StundenRow): string => (gruppe === "auftrag" ? r.auftrag || "(ohne Auftrag)" : gruppe === "kunde" ? r.kunde || "(ohne Kunde)" : gruppe === "mitarbeiter" ? r.pnr || "(ohne Nummer)" : gruppe === "tag" ? r.datum : gruppe === "monat" ? r.datum.slice(0, 7) : "");
    const label = (key: string): string => {
      if (gruppe === "mitarbeiter") {
        const c = crewMap.get(key);
        return c ? `${key} · ${vollName(c)}` : key;
      }
      if (gruppe === "tag") return formatDatumDE(key);
      if (gruppe === "monat") return MONAT_NAME[key] ?? key;
      return key;
    };
    const out: Item[] = [];
    let r = 0;
    if (!gruppe) {
      for (const row of gefiltert) out.push({ k: "z", row, r: r++ });
      return out;
    }
    const sortiert = [...gefiltert].sort((a, b) => gk(a).localeCompare(gk(b)));
    const stat = new Map<string, { n: number; std: number }>();
    for (const row of sortiert) {
      const key = gk(row);
      const e = stat.get(key) ?? { n: 0, std: 0 };
      e.n++;
      e.std += gesamtzeit(row.start, row.ende, row.pausen);
      stat.set(key, e);
    }
    let aktuell: string | null = null;
    for (const row of sortiert) {
      const key = gk(row);
      if (key !== aktuell) {
        aktuell = key;
        const e = stat.get(key) ?? { n: 0, std: 0 };
        out.push({ k: "g", key, label: label(key), n: e.n, std: e.std });
      }
      if (!zu.has(key)) out.push({ k: "z", row, r: r++ });
    }
    return out;
  }, [gefiltert, gruppe, zu, crewMap]);

  const datenzeilen = useMemo(() => items.filter((i): i is Extract<Item, { k: "z" }> => i.k === "z"), [items]);
  const positionVonR = useMemo(() => {
    const p: number[] = [];
    items.forEach((it, idx) => {
      if (it.k === "z") p[it.r] = idx;
    });
    return p;
  }, [items]);

  // Virtualisierung
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(640);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const messen = () => setVh(el.clientHeight || 640);
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);
  const von = Math.max(0, Math.floor(scrollTop / H) - 6);
  const bis = Math.min(items.length, Math.ceil((scrollTop + vh) / H) + 6);

  const nav = useCallback(
    (r: number, key: SpalteKey) => {
      const el = scrollRef.current;
      if (!el) return;
      const zielR = Math.max(0, Math.min(positionVonR.length - 1, r));
      const finde = () => el.querySelector<HTMLInputElement>(`input[data-r="${zielR}"][data-c="${key}"]`);
      const da = finde();
      if (da) {
        da.focus();
        return;
      }
      const pos = positionVonR[zielR];
      if (pos === undefined) return;
      el.scrollTop = Math.max(0, pos * H - el.clientHeight / 2);
      requestAnimationFrame(() => requestAnimationFrame(() => finde()?.focus()));
    },
    [positionVonR]
  );

  // Änderungen anwenden
  const anwenden = useCallback(
    (row: StundenRow, aenderungen: ReturnType<typeof setzeFeld>["aenderungen"], grund: string | null) => {
      set((st) => uebernehmeAenderungen(st, [{ row, aenderungen }], grund));
    },
    [set]
  );

  const commitFeld = useCallback(
    (rowId: string, feld: SpalteKey, text: string): boolean => {
      const row = sRef.current.stunden.find((r) => r.id === rowId);
      if (!row) return false;
      const res = setzeFeld(row, feld, text, ctx);
      if (res.fehler) {
        melde(res.fehler);
        return false;
      }
      if (res.aenderungen.length === 0) return true;
      if (row.status === "exportiert") {
        setBegruendung({
          titel: "Exportierte Zeile ändern",
          hinweis: `Die Zeile wurde bereits an die Lohnbuchhaltung übergeben. Die Änderung (${res.aenderungen.map((a) => `${a.feld}: ${a.alt || "leer"} → ${a.neu || "leer"}`).join(", ")}) braucht eine Begründung und steht danach im Protokoll.`,
          ok: (grund) => anwenden(res.row, res.aenderungen, grund),
        });
        return false;
      }
      anwenden(res.row, res.aenderungen, null);
      return true;
    },
    [ctx, melde, anwenden]
  );

  const statusWechsel = (row: StundenRow) => {
    if (row.status === "exportiert") {
      setBegruendung({
        titel: "Exportierte Zeile wieder öffnen",
        hinweis: "Die Zeile ist exportiert und gesperrt. Zum Öffnen ist eine Begründung nötig.",
        ok: (grund) => set((st) => setzeStatus(st, new Set([row.id]), "offen", grund)),
      });
      return;
    }
    const ziel = naechsterStatus(row.status);
    if (ziel === "freigegeben" && (warn.get(row.id) ?? []).some((w) => w.level === "fehler")) {
      melde("Die Zeile hat Fehler – erst korrigieren, dann freigeben.");
      return;
    }
    set((st) => setzeStatus(st, new Set([row.id]), ziel, null));
  };

  // Einfügen aus Excel / Google Sheets
  const beimEinfuegen = (e: ClipboardEvent<HTMLDivElement>) => {
    const ziel = e.target;
    if (!(ziel instanceof HTMLInputElement) || ziel.dataset.r === undefined || ziel.dataset.c === undefined) return;
    const text = e.clipboardData.getData("text/plain");
    if (!istTabellenText(text)) return;
    e.preventDefault();
    const daten = parseEinfuegen(text);
    const ergebnis = einfuegen(datenzeilen.map((z) => z.row), Number(ziel.dataset.r), ziel.dataset.c as SpalteKey, daten, ctx);
    const gesperrt = ergebnis.geaendert.filter((g) => sRef.current.stunden.find((r) => r.id === g.row.id)?.status === "exportiert");
    const frei = ergebnis.geaendert.filter((g) => !gesperrt.includes(g));
    const fertig = (grund: string | null, liste: typeof frei) => set((st) => uebernehmeAenderungen(st, liste, grund));
    const meldung = `${ergebnis.zellen} Zellen eingefügt${ergebnis.fehler.length ? `, ${ergebnis.fehler.length} Hinweise: ${ergebnis.fehler[0]}` : ""}`;
    if (gesperrt.length > 0) {
      setBegruendung({
        titel: "Einfügen enthält exportierte Zeilen",
        hinweis: `${gesperrt.length} der Zielzeilen sind exportiert. Mit Begründung werden sie mit geändert, sonst bleiben sie unverändert.`,
        ok: (grund) => {
          fertig(grund, gesperrt);
          melde(meldung);
        },
      });
      fertig(null, frei);
      return;
    }
    fertig(null, frei);
    melde(meldung);
  };

  // Auswahl
  const klickAuswahl = (r: number, id: string, shift: boolean) => {
    // Den Anker vorher merken: die Funktion unten läuft erst beim nächsten Rendern
    const anker = letzteAuswahl.current;
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (shift && anker !== null) {
        const [a, b] = [Math.min(anker, r), Math.max(anker, r)];
        for (let i = a; i <= b; i++) neu.add(datenzeilen[i].row.id);
      } else if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
    letzteAuswahl.current = r;
  };
  const alleAuswaehlen = () => setAuswahl(auswahl.size === datenzeilen.length && datenzeilen.length > 0 ? new Set() : new Set(datenzeilen.map((z) => z.row.id)));

  const neueZeileAnlegen = () => {
    const id = `z-neu-${Date.now().toString(36)}`;
    const row = neueZeile(id, HEUTE);
    set((st) => ({ ...st, stunden: [...st.stunden, row], audit: [neueAudit(BEARBEITER, "time_entries", id, "zeile", "", "neu angelegt (manuell)", null), ...st.audit] }));
    setKunde("");
    setAuftrag("");
    setStatus("");
    setMonat("");
    setPerson("");
    setAuff("");
    setNeuesteZuerst(true);
    setGruppe("");
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLInputElement>('input[data-r="0"][data-c="datum"]')?.focus());
    });
  };

  // Summenzeile
  const summen = useMemo(() => {
    let std = 0, pau = 0, spe = 0, km = 0, ges = 0, bon = 0, abz = 0;
    for (const r of gefiltert) {
      std += gesamtzeit(r.start, r.ende, r.pausen);
      pau += r.pauschale;
      spe += r.spesen;
      km += r.reiseKm;
      ges += r.reiseGesch;
      bon += r.bonus;
      abz += r.abzug;
    }
    return { std, pau, spe, km, ges, bon, abz };
  }, [gefiltert]);

  const wert = (sp: SpalteKey): string => {
    switch (sp) {
      case "gesamt": return formatDezimal(summen.std);
      case "pauschale": return formatDezimal(summen.pau);
      case "spesen": return formatDezimal(summen.spe);
      case "reiseKm": return formatDezimal(summen.km, 1);
      case "reiseGesch": return formatDezimal(summen.ges);
      case "bonus": return formatDezimal(summen.bon);
      case "abzug": return formatDezimal(summen.abz);
      default: return "";
    }
  };

  const detailRow = detailId ? s.stunden.find((r) => r.id === detailId) ?? null : null;

  return (
    <>
      <Kopf
        eyebrow="Abrechnung"
        titel="Stundentabelle"
        sub={`${s.stunden.length.toLocaleString("de-DE")} Zeilen · Zellen direkt bearbeiten, Tab/Enter wie in Excel, Einfügen aus Excel mit Strg+V`}
        aktionen={
          <>
            <Btn v="sec" onClick={() => setProtokoll(true)}>Änderungsprotokoll{s.audit.length ? ` (${s.audit.length})` : ""}</Btn>
            <Btn v="sec" onClick={neueZeileAnlegen}>+ Neue Zeile</Btn>
            <Btn onClick={() => setExportOffen(true)} data-testid="export-oeffnen">Export …</Btn>
          </>
        }
      />

      <div className="row wrap gap2" style={{ marginBottom: "0.6rem" }}>
        <select className="pv-select sm" style={{ width: "auto" }} value={monat} onChange={(e) => setMonat(e.target.value)} aria-label="Monat">
          <option value="">Alle Monate</option>
          <option value="2026-09">September 2026</option>
          <option value="2026-10">Oktober 2026</option>
        </select>
        <select className="pv-select sm" style={{ width: "auto", maxWidth: 190 }} value={kunde} onChange={(e) => setKunde(e.target.value)} aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {kundenListe.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select className="pv-select sm" style={{ width: "auto", maxWidth: 160 }} value={auftrag} onChange={(e) => setAuftrag(e.target.value)} aria-label="Auftrag">
          <option value="">Alle Aufträge</option>
          {auftragListe.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input className="pv-input sm" style={{ width: 170 }} placeholder="Person oder Nummer" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" />
        <select className="pv-select sm" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          {(["offen", "geprueft", "freigegeben", "exportiert"] as StundenStatus[]).map((x) => <option key={x} value={x}>{{ offen: "offen", geprueft: "geprüft", freigegeben: "freigegeben", exportiert: "exportiert" }[x]}</option>)}
        </select>
        <select className="pv-select sm" style={{ width: "auto" }} value={quelle} onChange={(e) => setQuelle(e.target.value)} aria-label="Quelle">
          <option value="">Alle Quellen</option>
          <option>Zettel</option><option>App</option><option>manuell</option>
        </select>
        <select className="pv-select sm" style={{ width: "auto" }} value={gruppe} onChange={(e) => { setGruppe(e.target.value as Gruppe); setZu(new Set()); }} aria-label="Gruppieren">
          <option value="">Nicht gruppieren</option>
          <option value="auftrag">Nach Auftrag</option><option value="kunde">Nach Kunde</option><option value="mitarbeiter">Nach Mitarbeiter</option><option value="tag">Nach Tag</option><option value="monat">Nach Monat</option>
        </select>
        <label className="pv-check small"><input type="checkbox" checked={neuesteZuerst} onChange={(e) => setNeuesteZuerst(e.target.checked)} />Neueste zuerst</label>
        {(monat || kunde || auftrag || person || status || quelle || auff) ? <Btn v="ghost" groesse="sm" onClick={() => { setMonat(""); setKunde(""); setAuftrag(""); setPerson(""); setStatus(""); setQuelle(""); setAuff(""); }}>Filter löschen</Btn> : null}
      </div>

      <div className="row wrap gap2" style={{ marginBottom: "0.6rem" }}>
        <span className="small"><b data-testid="zeilenzahl">{gefiltert.length.toLocaleString("de-DE")}</b> Zeilen</span>
        <button type="button" className={`pv-chip ${summe.fehler ? "err" : "gut"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setAuff(auff === "fehler" ? "" : "fehler")} data-testid="chip-fehler">
          {summe.zeilenMitFehler} Zeilen mit Fehler
        </button>
        <button type="button" className={`pv-chip ${summe.warnungen ? "warn" : "gut"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setAuff(auff === "alle" ? "" : "alle")}>
          {summe.warnungen} Warnungen
        </button>
        {auswahl.size > 0 ? (
          <>
            <Chip ton="navy">{auswahl.size} ausgewählt</Chip>
            <Btn groesse="sm" v="sec" onClick={() => setMassOffen(true)} data-testid="massenbearbeitung">Massenbearbeitung</Btn>
            <Btn groesse="sm" v="ghost" onClick={() => setAuswahl(new Set())}>Auswahl aufheben</Btn>
          </>
        ) : null}
      </div>

      <div className="pvg">
        <div className="pvg-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} onPaste={beimEinfuegen} data-testid="grid">
          <div className="pvg-head" style={{ width: BREITE }}>
            <div className="pvg-h" style={{ width: W_SEL }}>
              <input type="checkbox" aria-label="Alle auswählen" checked={datenzeilen.length > 0 && auswahl.size === datenzeilen.length} onChange={alleAuswaehlen} />
            </div>
            <div className="pvg-h" style={{ width: W_STATUS }}>Status</div>
            <div className="pvg-h" style={{ width: W_WARN }} title="Plausibilität">⚠</div>
            {SPALTEN.map((sp) => <div key={sp.key} className="pvg-h" style={{ width: sp.breite }}>{sp.label}</div>)}
            <div className="pvg-h" style={{ width: W_ZETTEL }}>Zettel</div>
          </div>
          <div style={{ height: von * H }} />
          {items.slice(von, bis).map((it, i) => {
            if (it.k === "g") {
              const offen = !zu.has(it.key);
              return (
                <div key={`g-${it.key}`} className="pvg-row grp" style={{ width: BREITE, cursor: "pointer" }} onClick={() => setZu((alt) => { const n = new Set(alt); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n; })}>
                  <div className="pvg-c" style={{ width: 400 }}>{offen ? "▾" : "▸"}&nbsp;{it.label}</div>
                  <div className="pvg-c" style={{ width: 300 }}>{it.n} Zeilen · {formatDezimal(it.std)} h</div>
                </div>
              );
            }
            const row = it.row;
            const w = warn.get(row.id) ?? [];
            const farben = new Map<SpalteKey, "fehler" | "warnung">();
            for (const x of w) for (const k of spaltenFuerWarnung(x.code)) if (farben.get(k) !== "fehler") farben.set(k, x.level);
            const c = crewMap.get(row.pnr);
            const gesperrt = row.status === "exportiert";
            const gewaehlt = auswahl.has(row.id);
            return (
              <div key={row.id} className={`pvg-row ${gewaehlt ? "sel" : ""}`} style={{ width: BREITE }} data-testid="grid-zeile" data-id={row.id}>
                <div className="pvg-c" style={{ width: W_SEL }}>
                  <input type="checkbox" aria-label={`Zeile ${it.r + 1} auswählen`} checked={gewaehlt} onChange={() => undefined} onClick={(e) => klickAuswahl(it.r, row.id, e.shiftKey)} />
                </div>
                <div className="pvg-c" style={{ width: W_STATUS }}>
                  <button type="button" className={`pvg-status ${row.status}`} onClick={() => statusWechsel(row)} title={gesperrt ? "Exportiert – gesperrt. Klick öffnet mit Begründung." : "Klick: nächster Status"}>
                    {gesperrt ? "🔒 " : ""}{{ offen: "offen", geprueft: "geprüft", freigegeben: "freigegeben", exportiert: "exportiert" }[row.status]}
                  </button>
                </div>
                <div className="pvg-c" style={{ width: W_WARN, justifyContent: "center" }}>
                  {w.length > 0 ? <span className={`pv-chip ${w.some((x: Warnung) => x.level === "fehler") ? "err" : "warn"} pvg-tip`} title={w.map((x) => x.text).join("\n")} style={{ padding: "0 0.4rem" }}>{w.length}</span> : null}
                </div>
                {SPALTEN.map((sp) => {
                  const farbe = farben.get(sp.key);
                  const kl = `pvg-c ${sp.art === "berechnet" ? "calc" : ""} ${gesperrt ? "locked" : ""} ${farbe === "fehler" ? "err" : farbe === "warnung" ? "warn" : ""}`;
                  if (sp.art === "berechnet") {
                    const text = sp.key === "vorname" ? c?.vorname ?? "" : sp.key === "nachname" ? c?.nachname ?? "" : feldWert(row, sp.key);
                    return <div key={sp.key} className={kl} style={{ width: sp.breite, justifyContent: sp.key === "gesamt" ? "flex-end" : "flex-start", fontFamily: sp.key === "gesamt" ? undefined : "var(--body)" }} title={w.filter((x) => spaltenFuerWarnung(x.code).includes(sp.key)).map((x) => x.text).join("\n") || undefined}>{text}</div>;
                  }
                  const liste = sp.key === "pnr" ? "pv-pnr" : sp.key === "kunde" ? "pv-kunden" : sp.key === "auftrag" ? "pv-auftraege" : undefined;
                  const titel = w.filter((x) => spaltenFuerWarnung(x.code).includes(sp.key)).map((x) => x.text).join("\n") || undefined;
                  return <GridInput key={`${row.id}-${sp.key}`} wert={feldWert(row, sp.key)} spalte={sp} r={it.r} klasse={kl} titel={titel} liste={liste} label={`${sp.label} Zeile ${it.r + 1}`} nav={nav} onCommit={(text) => commitFeld(row.id, sp.key, text)} />;
                })}
                <div className="pvg-c" style={{ width: W_ZETTEL }}>
                  <button type="button" className="pv-btn ghost sm" style={{ minHeight: 24, padding: "0 0.4rem" }} onClick={() => setDetailId(row.id)} title="Original-Zettel und Verlauf">
                    {row.quelle === "Zettel" ? "📄" : row.quelle === "App" ? "📱" : "✎"} {row.quelle}
                  </button>
                </div>
              </div>
            );
          })}
          <div style={{ height: Math.max(0, (items.length - bis) * H) }} />
          <div className="pvg-row sum" style={{ width: BREITE }} data-testid="summenzeile">
            <div className="pvg-c" style={{ width: W_SEL + W_STATUS + W_WARN }}>Summe ({gefiltert.length.toLocaleString("de-DE")})</div>
            {SPALTEN.map((sp) => <div key={sp.key} className="pvg-c" style={{ width: sp.breite, justifyContent: "flex-end", fontFamily: "var(--mono)" }}>{wert(sp.key)}</div>)}
            <div className="pvg-c" style={{ width: W_ZETTEL }} />
          </div>
        </div>
      </div>

      <datalist id="pv-pnr">{s.crew.map((c) => <option key={c.pnr} value={c.pnr}>{vollName(c)}</option>)}</datalist>
      <datalist id="pv-kunden">{kundenListe.map((k) => <option key={k} value={k} />)}</datalist>
      <datalist id="pv-auftraege">{s.auftraege.map((a) => <option key={a.id} value={a.id}>{a.kunde} · {a.titel}</option>)}</datalist>

      <div className="row wrap mt2">
        <span className="small muted">Farben: <span className="pv-chip err">Fehler</span> <span className="pv-chip warn">Warnung</span> – mit der Maus über die Zelle sehen, warum. Gesperrte Zeilen (exportiert) ändern nur mit Begründung.</span>
        <Offen nr={14}>Papierzettel + Foto: Quelle „Zettel“ wird von der Dispo übertragen</Offen>
      </div>

      {detailRow ? <Detail row={detailRow} warnungen={warn.get(detailRow.id) ?? []} onClose={() => setDetailId(null)} onPausen={(p) => { const res = setzePausen(detailRow, p); if (res.aenderungen.length === 0) return; if (detailRow.status === "exportiert") { setBegruendung({ titel: "Pausen einer exportierten Zeile ändern", hinweis: "Die Zeile ist exportiert und gesperrt.", ok: (g) => anwenden(res.row, res.aenderungen, g) }); } else anwenden(res.row, res.aenderungen, null); }} /> : null}

      {protokoll ? <Protokoll onClose={() => setProtokoll(false)} /> : null}

      {massOffen ? <Massen ids={auswahl} onClose={() => setMassOffen(false)} warn={warn} ctx={ctx} onFertig={() => { setMassOffen(false); setAuswahl(new Set()); }} /> : null}

      {exportOffen ? <ExportModal rows={gefiltert} alle={s.stunden} warn={warn} onClose={() => setExportOffen(false)} /> : null}

      {begruendung ? <BegruendungsModal titel={begruendung.titel} hinweis={begruendung.hinweis} onClose={() => setBegruendung(null)} onOk={(g) => { begruendung.ok(g); setBegruendung(null); }} /> : null}
    </>
  );
}

// ─── Begründung (exportierte Zeilen) ────────────────────────────────────────

function BegruendungsModal({ titel, hinweis, onClose, onOk }: { titel: string; hinweis: string; onClose: () => void; onOk: (grund: string) => void }) {
  const [grund, setGrund] = useState("");
  const ok = grund.trim().length >= 5;
  return (
    <Modal titel={titel} onClose={onClose} fuss={<><Btn v="sec" onClick={onClose}>Abbrechen</Btn><Btn disabled={!ok} onClick={() => onOk(grund.trim())} data-testid="begruendung-ok">Änderung speichern</Btn></>}>
      <Note ton="warn">{hinweis}</Note>
      <label className="pv-label mt2" htmlFor="begruendung">Begründung (mindestens 5 Zeichen)</label>
      <textarea id="begruendung" className="pv-textarea" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="Zum Beispiel: Zettel nachgereicht, Ende war 18:00." autoFocus />
    </Modal>
  );
}

// ─── Änderungsprotokoll ─────────────────────────────────────────────────────

function Protokoll({ onClose }: { onClose: () => void }) {
  const { s } = usePv();
  return (
    <Modal titel="Änderungsprotokoll" onClose={onClose} wide>
      <p className="small muted">Jede Änderung der Stundentabelle steht hier mit Zeitpunkt, Person, altem und neuem Wert. Im echten System ist das die Tabelle <span className="mono">audit_log</span> und nicht änderbar.</p>
      <div className="pv-scroll mt2" style={{ maxHeight: "55vh" }}>
        <table className="pv-table" data-testid="protokoll">
          <thead><tr><th>Zeit</th><th>Wer</th><th>Zeile</th><th>Feld</th><th>Alt</th><th>Neu</th><th>Begründung</th></tr></thead>
          <tbody>
            {s.audit.length === 0 ? <tr><td colSpan={7} className="muted">Noch keine Änderungen.</td></tr> : null}
            {s.audit.slice(0, 200).map((a) => (
              <tr key={a.id}>
                <td className="small">{new Date(a.zeitpunkt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td>
                <td className="small">{a.user}</td><td className="mono small">{a.datensatz}</td><td>{a.feld}</td>
                <td className="mono small">{a.alt || "–"}</td><td className="mono small">{a.neu || "–"}</td><td className="small">{a.grund ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ─── Zeilen-Detail: Original-Zettel, Pausen, Verlauf ────────────────────────

function Detail({ row, warnungen, onClose, onPausen }: { row: StundenRow; warnungen: Warnung[]; onClose: () => void; onPausen: (p: StundenRow["pausen"]) => void }) {
  const { s } = usePv();
  const c = s.crew.find((x) => x.pnr === row.pnr);
  const verlauf = s.audit.filter((a) => a.datensatz === row.id);
  return (
    <div style={{ position: "fixed", right: 0, top: 34, bottom: 0, width: 400, maxWidth: "100vw", background: "#fff", borderLeft: "1px solid var(--line)", boxShadow: "-8px 0 30px rgba(10,26,47,.15)", zIndex: 70, overflow: "auto", padding: "1rem" }} role="dialog" aria-label="Zeilen-Detail" data-testid="detail">
      <div className="row between"><h3>Zeile {row.id}</h3><Btn v="ghost" groesse="sm" onClick={onClose} aria-label="Schließen">✕</Btn></div>
      <div className="small muted">{c ? vollName(c) : row.pnr || "keine Person"} · {row.datum ? formatDatumDE(row.datum) : "ohne Datum"}</div>
      {warnungen.length > 0 ? <div className="col gap1 mt2">{warnungen.map((w, i) => <Note key={i} ton={w.level === "fehler" ? "err" : "warn"}>{w.text}</Note>)}</div> : null}

      <h4 className="mt3">Original</h4>
      {row.quelle === "manuell" ? (
        <Note>Manuell in der Tabelle erfasst – kein Zettel.</Note>
      ) : (
        <>
          <div className="pv-zettel mt1">
            Stundennachweis<br />
            {c ? vollName(c) : row.pnr} · {row.datum ? formatDatumDE(row.datum) : ""}<br />
            Von {row.start || "__"} bis {row.ende || "__"}<br />
            Pause: {row.pausen.length ? row.pausen.map((p) => `${p.von}–${p.bis}`).join(", ") : "—"}<br />
            {row.auftrag} · {row.kunde}<br />
            <span style={{ fontSize: "1.5rem" }}>✍ Unterschrift Kunde</span>
          </div>
          <div className="pv-hint">Beispiel-Darstellung. Im echten System ist das das eingelesene Dokument aus dem bestehenden Einsatzmodul ({row.sourceRef}), nur zum Lesen.</div>
        </>
      )}

      <h4 className="mt3">Pausen</h4>
      <div className="col mt1">
        {row.pausen.map((p, i) => (
          <div key={i} className="row">
            <input className="pv-input sm mono" style={{ width: 80 }} defaultValue={p.von} aria-label={`Pause ${i + 1} von`} onBlur={(e) => onPausen(row.pausen.map((x, j) => (j === i ? { ...x, von: (e.target.value.match(/^\d{1,2}:\d{2}$/) ? e.target.value : x.von) } : x)))} />
            <span>–</span>
            <input className="pv-input sm mono" style={{ width: 80 }} defaultValue={p.bis} aria-label={`Pause ${i + 1} bis`} onBlur={(e) => onPausen(row.pausen.map((x, j) => (j === i ? { ...x, bis: (e.target.value.match(/^\d{1,2}:\d{2}$/) ? e.target.value : x.bis) } : x)))} />
            <Btn v="ghost" groesse="sm" onClick={() => onPausen(row.pausen.filter((_, j) => j !== i))} aria-label="Pause entfernen">✕</Btn>
          </div>
        ))}
        <Btn v="sec" groesse="sm" onClick={() => onPausen([...row.pausen, { von: "", bis: "" }])}>+ Pause</Btn>
      </div>

      <h4 className="mt3">Verlauf</h4>
      <div className="col gap1 mt1">
        {verlauf.length === 0 ? <div className="small muted">Noch keine Änderungen an dieser Zeile.</div> : null}
        {verlauf.map((a) => <div key={a.id} className="small"><b>{a.feld}</b>: {a.alt || "–"} → {a.neu || "–"}{a.grund ? <> · <i>{a.grund}</i></> : null}</div>)}
      </div>
    </div>
  );
}

// ─── Massenbearbeitung ──────────────────────────────────────────────────────

function Massen({ ids, onClose, onFertig, warn, ctx }: { ids: Set<string>; onClose: () => void; onFertig: () => void; warn: Map<string, Warnung[]>; ctx: EditKontext }) {
  const { s, set, melde } = usePv();
  const [aktion, setAktion] = useState<"status" | "auftrag" | "pauschale" | "bemerkung">("status");
  const [wertText, setWertText] = useState("");
  const [ziel, setZiel] = useState<StundenStatus>("geprueft");
  const rows = s.stunden.filter((r) => ids.has(r.id));
  const gesperrt = rows.filter((r) => r.status === "exportiert").length;

  const ausfuehren = () => {
    const bearbeitbar = rows.filter((r) => r.status !== "exportiert");
    if (aktion === "status") {
      const ok = ziel === "freigegeben" ? bearbeitbar.filter((r) => !(warn.get(r.id) ?? []).some((w) => w.level === "fehler")) : bearbeitbar;
      const uebersprungen = bearbeitbar.length - ok.length;
      set((st) => setzeStatus(st, new Set(ok.map((r) => r.id)), ziel, null));
      melde(`${ok.length} Zeilen auf „${{ offen: "offen", geprueft: "geprüft", freigegeben: "freigegeben", exportiert: "exportiert" }[ziel]}“ gesetzt${uebersprungen ? `, ${uebersprungen} mit Fehlern übersprungen` : ""}${gesperrt ? `, ${gesperrt} exportierte gesperrt` : ""}.`);
    } else {
      const feld: SpalteKey = aktion;
      const geaendert: Array<{ row: StundenRow; aenderungen: ReturnType<typeof setzeFeld>["aenderungen"] }> = [];
      let fehler = "";
      for (const r of bearbeitbar) {
        const text = aktion === "bemerkung" ? [r.bemerkung, wertText].filter(Boolean).join(" · ") : wertText;
        const res = setzeFeld(r, feld, text, ctx);
        if (res.fehler) { fehler = res.fehler; break; }
        if (res.aenderungen.length) geaendert.push({ row: res.row, aenderungen: res.aenderungen });
      }
      if (fehler) { melde(fehler); return; }
      set((st) => uebernehmeAenderungen(st, geaendert, null));
      melde(`${geaendert.length} Zeilen geändert${gesperrt ? `, ${gesperrt} exportierte gesperrt` : ""}.`);
    }
    onFertig();
  };

  return (
    <Modal titel={`Massenbearbeitung (${rows.length} Zeilen)`} onClose={onClose} fuss={<><Btn v="sec" onClick={onClose}>Abbrechen</Btn><Btn onClick={ausfuehren} data-testid="mass-ok">Anwenden</Btn></>}>
      {gesperrt > 0 ? <Note ton="warn">{gesperrt} der ausgewählten Zeilen sind exportiert und werden nicht verändert.</Note> : null}
      <label className="pv-label mt2" htmlFor="mass-aktion">Was soll gesetzt werden?</label>
      <select id="mass-aktion" className="pv-select" value={aktion} onChange={(e) => setAktion(e.target.value as typeof aktion)}>
        <option value="status">Status</option>
        <option value="auftrag">Auftrag (Kunde folgt)</option>
        <option value="pauschale">Pauschale (Stunden)</option>
        <option value="bemerkung">Bemerkung anhängen</option>
      </select>
      <div className="mt2">
        {aktion === "status" ? (
          <select className="pv-select" value={ziel} onChange={(e) => setZiel(e.target.value as StundenStatus)} aria-label="Neuer Status">
            <option value="offen">offen</option><option value="geprueft">geprüft</option><option value="freigegeben">freigegeben (nur Zeilen ohne Fehler)</option>
          </select>
        ) : (
          <input className="pv-input" value={wertText} onChange={(e) => setWertText(e.target.value)} placeholder={aktion === "auftrag" ? "z. B. FESS-2026-0105" : aktion === "pauschale" ? "z. B. 4" : "Text"} aria-label="Wert" list={aktion === "auftrag" ? "pv-auftraege" : undefined} />
        )}
      </div>
    </Modal>
  );
}

// ─── Export ─────────────────────────────────────────────────────────────────

function ExportModal({ rows, alle, warn, onClose }: { rows: StundenRow[]; alle: StundenRow[]; warn: Map<string, Warnung[]>; onClose: () => void }) {
  const { s, set, melde } = usePv();
  const [tab, setTab] = useState<"pruef" | "zvoove" | "excel" | "kunden">("pruef");
  const [trotzdem, setTrotzdem] = useState(false);
  const [markieren, setMarkieren] = useState(true);
  const einst = s.einst.exp ?? DEFAULT_EXPORT;
  const crewMap = useMemo(() => crewNachPnr(s), [s]);
  const taet = useCallback((a: string) => s.auftraege.find((x) => x.id === a)?.taetigkeit ?? "", [s.auftraege]);

  const exportierbar = useMemo(() => rows.filter((r) => r.status === "freigegeben" && !(warn.get(r.id) ?? []).some((w) => w.level === "fehler")), [rows, warn]);
  const z = useMemo(() => exportZeilen(exportierbar, taet, einst), [exportierbar, taet, einst]);
  const bericht = useMemo(() => pruefbericht(rows, warn, z.probleme), [rows, warn, z.probleme]);
  const csv = useMemo(() => zvooveCsv(z.zeilen, einst.trennzeichen), [z.zeilen, einst.trennzeichen]);
  const blockiert = z.probleme.length > 0 && !trotzdem;

  const nachAuftrag = useMemo(() => {
    const m = new Map<string, { kunde: string; personen: Set<string>; std: number; spesen: number; reise: number }>();
    for (const r of rows) {
      const e = m.get(r.auftrag) ?? { kunde: r.kunde, personen: new Set<string>(), std: 0, spesen: 0, reise: 0 };
      e.personen.add(r.pnr);
      e.std += gesamtzeit(r.start, r.ende, r.pausen);
      e.spesen += r.spesen;
      e.reise += r.reiseGesch + r.reiseKm * einst.kmSatzPrivat;
      m.set(r.auftrag, e);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, einst.kmSatzPrivat]);

  const herunterladen = () => {
    ladeTextHerunter(`zvoove-stunden-${HEUTE}.csv`, csv);
    if (markieren) {
      const ids = new Set(exportierbar.map((r) => r.id));
      set((st) => setzeStatus(st, ids, "exportiert", null));
      melde(`${ids.size} Zeilen exportiert und gesperrt. Änderungen ab jetzt nur mit Begründung.`);
    } else melde("CSV geladen, Zeilen bleiben unverändert.");
  };

  return (
    <Modal titel="Export" onClose={onClose} wide>
      <Tabs wert={tab} onChange={setTab} tabs={[{ id: "pruef", label: "1 Prüfbericht" }, { id: "zvoove", label: "2 zvoove-CSV", n: z.zeilen.length }, { id: "excel", label: "Excel" }, { id: "kunden", label: "Kundenübersicht" }]} />
      <div className="mt2" />
      {tab === "pruef" ? (
        <div data-testid="pruefbericht">
          <div className="pva-grid c4">
            <div className="pv-stat"><div className="v">{bericht.zeilenGesamt.toLocaleString("de-DE")}</div><div className="l">Zeilen im Filter</div></div>
            <div className="pv-stat"><div className="v" style={{ color: "var(--ok)" }}>{bericht.exportierbar.toLocaleString("de-DE")}</div><div className="l">bereit zum Export (freigegeben, ohne Fehler)</div></div>
            <div className="pv-stat"><div className="v" style={{ color: "var(--warn)" }}>{bericht.ohneFreigabe.toLocaleString("de-DE")}</div><div className="l">noch nicht freigegeben</div></div>
            <div className="pv-stat"><div className="v" style={{ color: "var(--err)" }}>{bericht.mitFehler}</div><div className="l">mit Fehler</div></div>
          </div>
          <div className="mt2 small">{bericht.warnungen} Warnungen in den gefilterten Zeilen (Pause, Ruhezeit, Grenzen …) – sie sperren den Export nicht, stehen aber hier.</div>
          {bericht.lohnartProbleme.length > 0 ? (
            <div className="mt2"><Note ton="err"><b>Lohnart nicht abgestimmt</b> ({bericht.lohnartProbleme.length}): {bericht.lohnartProbleme.slice(0, 3).map((p) => p.text).join(" · ")}{bericht.lohnartProbleme.length > 3 ? " …" : ""}<br />Bitte in den Einstellungen mit Daniel abstimmen.</Note></div>
          ) : <div className="mt2"><Note ton="ok">Alle Lohnarten der exportierten Positionen sind hinterlegt.</Note></div>}
          <div className="mt2 small muted">Nacht-, Sonntags- und Feiertagszuschläge rechnet zvoove über den Tarifvertrag; hier gehen nur Arbeitszeiten und Beträge hinaus.</div>
        </div>
      ) : null}
      {tab === "zvoove" ? (
        <div>
          <div className="pv-scroll" style={{ maxHeight: 260 }}>
            <table className="pv-table"><thead><tr><th>Personalnr.</th><th>Datum</th><th>Lohnart</th><th>Stunden</th><th>Betrag</th><th>Auftrag</th><th>Bemerkung</th></tr></thead>
              <tbody>{z.zeilen.slice(0, 14).map((x, i) => <tr key={i}><td className="mono">{x.personalnummer}</td><td>{x.datum}</td><td className="mono">{x.lohnart || <Chip ton="err">fehlt</Chip>}</td><td className="mono">{x.stunden === null ? "" : formatDezimal(x.stunden)}</td><td className="mono">{x.betrag === null ? "" : formatEuro(x.betrag)}</td><td className="small">{x.auftrag}</td><td className="small">{x.bemerkung}</td></tr>)}</tbody></table>
          </div>
          <div className="small muted mt1">{z.zeilen.length} Positionen aus {exportierbar.length} Zeilen · Spalten-Mapping und Lohnarten in den Einstellungen.</div>
          {z.probleme.length > 0 ? <div className="mt2"><label className="pv-check"><input type="checkbox" checked={trotzdem} onChange={(e) => setTrotzdem(e.target.checked)} />Trotz {z.probleme.length} Positionen ohne Lohnart exportieren (Lohnart bleibt leer)</label></div> : null}
          <div className="mt2"><label className="pv-check"><input type="checkbox" checked={markieren} onChange={(e) => setMarkieren(e.target.checked)} />Exportierte Zeilen danach sperren (Status „exportiert“)</label></div>
          <div className="row mt3"><Btn disabled={blockiert || z.zeilen.length === 0} onClick={herunterladen} data-testid="csv-laden">CSV herunterladen</Btn></div>
        </div>
      ) : null}
      {tab === "excel" ? (
        <div>
          <p>Alle {rows.length.toLocaleString("de-DE")} Zeilen des Filters mit den 18 Spalten der Tabelle.</p>
          <p className="small muted mt1">Im Prototyp als CSV (öffnet in Excel). Im echten System eine .xlsx-Datei.</p>
          <div className="row mt3"><Btn onClick={() => { ladeTextHerunter(`stundentabelle-${HEUTE}.csv`, excelCsv(rows, crewMap)); melde("Excel-Datei geladen."); }}>Excel (18 Spalten) laden</Btn></div>
        </div>
      ) : null}
      {tab === "kunden" ? (
        <div>
          <div className="pv-scroll" style={{ maxHeight: 300 }}>
            <table className="pv-table"><thead><tr><th>Auftrag</th><th>Kunde</th><th>Personen</th><th className="right">Stunden</th><th className="right">Spesen</th><th className="right">Reisekosten</th></tr></thead>
              <tbody>{nachAuftrag.map(([a, e]) => <tr key={a}><td className="mono small">{a}</td><td>{e.kunde}</td><td className="mono">{e.personen.size}</td><td className="mono right">{formatDezimal(e.std)}</td><td className="mono right">{formatEuro(e.spesen)}</td><td className="mono right">{formatEuro(e.reise)}</td></tr>)}</tbody></table>
          </div>
          <div className="row mt3"><Btn v="sec" onClick={() => melde("Prototyp: hier entsteht je Auftrag eine PDF-Übersicht für den Kunden.")}>PDF je Auftrag</Btn></div>
        </div>
      ) : null}
      <div className="small muted mt3">{alle.length.toLocaleString("de-DE")} Zeilen insgesamt · Export nutzt den aktuellen Filter der Tabelle.</div>
    </Modal>
  );
}
