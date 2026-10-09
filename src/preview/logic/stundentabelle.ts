// Bearbeitung der Stundentabelle (Modul E): die 18 Spalten, tolerante
// Eingabe von Datum, Zahl und Uhrzeit, Einfügen aus Excel und Google Sheets.
// Reine Funktionen – die Oberfläche ruft sie nur auf.
import type { Pause, StundenRow } from "./types";
import { formatDatumDE, formatDezimal, gesamtzeit, normalizeTime } from "./zeit";

export type SpalteKey =
  | "datum" | "pnr" | "vorname" | "nachname" | "start" | "pauseVon" | "pauseBis" | "ende" | "gesamt" | "pauschale"
  | "kunde" | "auftrag" | "spesen" | "reiseKm" | "reiseGesch" | "bonus" | "abzug" | "bemerkung";

export interface Spalte {
  key: SpalteKey;
  label: string;
  breite: number;
  art: "datum" | "text" | "zeit" | "zahl" | "berechnet";
}

// Reihenfolge und Namen wie in docs/ausbauplan.md, Abschnitt 8
export const SPALTEN: Spalte[] = [
  { key: "datum", label: "Datum", breite: 96, art: "datum" },
  { key: "pnr", label: "Pers.-Nr.", breite: 78, art: "text" },
  { key: "vorname", label: "Vorname", breite: 92, art: "berechnet" },
  { key: "nachname", label: "Nachname", breite: 104, art: "berechnet" },
  { key: "start", label: "Start", breite: 62, art: "zeit" },
  { key: "pauseVon", label: "Pause von", breite: 70, art: "zeit" },
  { key: "pauseBis", label: "Pause bis", breite: 70, art: "zeit" },
  { key: "ende", label: "Ende", breite: 62, art: "zeit" },
  { key: "gesamt", label: "Gesamt (h)", breite: 78, art: "berechnet" },
  { key: "pauschale", label: "Pauschale (h)", breite: 86, art: "zahl" },
  { key: "kunde", label: "Kunde", breite: 160, art: "text" },
  { key: "auftrag", label: "Auftrag", breite: 124, art: "text" },
  { key: "spesen", label: "Spesen €", breite: 72, art: "zahl" },
  { key: "reiseKm", label: "Reise privat km", breite: 100, art: "zahl" },
  { key: "reiseGesch", label: "Reise gesch. €", breite: 96, art: "zahl" },
  { key: "bonus", label: "Bonus €", breite: 70, art: "zahl" },
  { key: "abzug", label: "Abzug €", breite: 70, art: "zahl" },
  { key: "bemerkung", label: "Bemerkung", breite: 220, art: "text" },
];

export const BEARBEITBAR: SpalteKey[] = SPALTEN.filter((s) => s.art !== "berechnet").map((s) => s.key);

const pad = (n: number) => String(n).padStart(2, "0");

// „5.10.2026“, „05.10.26“, „5.10.“ (Jahr ergänzt) und „2026-10-05“
export function parseDatum(eingabe: string, jahr: number): string | null {
  const t = eingabe.trim();
  let y: number;
  let m: number;
  let d: number;
  let tr = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (tr) {
    [y, m, d] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
  } else if ((tr = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t))) {
    d = Number(tr[1]);
    m = Number(tr[2]);
    y = tr[3].length === 2 ? 2000 + Number(tr[3]) : Number(tr[3]);
  } else if ((tr = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(t))) {
    d = Number(tr[1]);
    m = Number(tr[2]);
    y = jahr;
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// „12,5“, „1.234,50“, „12.5“, „7 €“ – nie negativ (Abzug steht als positive Zahl)
export function parseZahl(eingabe: string): number | null {
  let t = eingabe.trim().replace(/€|\s/g, "");
  if (t === "") return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function feldWert(r: StundenRow, f: SpalteKey): string {
  switch (f) {
    case "datum": return r.datum ? formatDatumDE(r.datum) : "";
    case "pnr": return r.pnr;
    case "start": return r.start;
    case "ende": return r.ende;
    case "pauseVon": return r.pausen[0]?.von ?? "";
    case "pauseBis": return r.pausen[0]?.bis ?? "";
    case "gesamt": return r.start && r.ende ? formatDezimal(gesamtzeit(r.start, r.ende, r.pausen)) : "";
    case "pauschale": return r.pauschale ? formatDezimal(r.pauschale) : "";
    case "kunde": return r.kunde;
    case "auftrag": return r.auftrag;
    case "spesen": return r.spesen ? formatDezimal(r.spesen) : "";
    case "reiseKm": return r.reiseKm ? formatDezimal(r.reiseKm, 1) : "";
    case "reiseGesch": return r.reiseGesch ? formatDezimal(r.reiseGesch) : "";
    case "bonus": return r.bonus ? formatDezimal(r.bonus) : "";
    case "abzug": return r.abzug ? formatDezimal(r.abzug) : "";
    case "bemerkung": return r.bemerkung;
    default: return "";
  }
}

export interface Aenderung {
  feld: SpalteKey | "pausen" | "status";
  alt: string;
  neu: string;
}

export interface EditKontext {
  jahr: number;
  // Auftrags-ID → Kunde
  auftraege: Map<string, string>;
  kunden: string[];
}

export interface EditErgebnis {
  row: StundenRow;
  aenderungen: Aenderung[];
  fehler?: string;
}

function ohneLeerePausen(p: Pause[]): Pause[] {
  return p.filter((x) => x.von !== "" || x.bis !== "");
}

export function setzeFeld(row: StundenRow, feld: SpalteKey, eingabe: string, ctx: EditKontext): EditErgebnis {
  const alt = feldWert(row, feld);
  const roh = eingabe.trim();
  const fertig = (neu: StundenRow): EditErgebnis => {
    const neuWert = feldWert(neu, feld);
    return { row: neu, aenderungen: neuWert === alt ? [] : [{ feld, alt, neu: neuWert }] };
  };
  const fehler = (text: string): EditErgebnis => ({ row, aenderungen: [], fehler: text });

  switch (feld) {
    case "datum": {
      const d = parseDatum(roh, ctx.jahr);
      return d ? fertig({ ...row, datum: d }) : fehler(`„${roh}“ ist kein Datum (z. B. 05.10.2026).`);
    }
    case "pnr":
      return fertig({ ...row, pnr: roh.toUpperCase() });
    case "start":
    case "ende": {
      if (roh === "") return fertig({ ...row, [feld]: "" });
      const t = normalizeTime(roh);
      return t ? fertig({ ...row, [feld]: t }) : fehler(`„${roh}“ ist keine Uhrzeit (z. B. 7:30 oder 1830).`);
    }
    case "pauseVon":
    case "pauseBis": {
      const t = roh === "" ? "" : normalizeTime(roh);
      if (t === null) return fehler(`„${roh}“ ist keine Uhrzeit.`);
      const erste: Pause = { ...(row.pausen[0] ?? { von: "", bis: "" }) };
      if (feld === "pauseVon") erste.von = t;
      else erste.bis = t;
      return fertig({ ...row, pausen: ohneLeerePausen([erste, ...row.pausen.slice(1)]) });
    }
    case "pauschale":
    case "spesen":
    case "reiseKm":
    case "reiseGesch":
    case "bonus":
    case "abzug": {
      const n = parseZahl(roh);
      return n === null ? fehler(`„${roh}“ ist keine Zahl.`) : fertig({ ...row, [feld]: n });
    }
    case "kunde": {
      const treffer = ctx.kunden.find((k) => k.toLowerCase() === roh.toLowerCase());
      return treffer ? fertig({ ...row, kunde: treffer }) : fehler(`Kunde „${roh}“ ist nicht angelegt.`);
    }
    case "auftrag": {
      const id = [...ctx.auftraege.keys()].find((k) => k.toLowerCase() === roh.toLowerCase());
      if (!id) return fehler(`Auftrag „${roh}“ gibt es nicht.`);
      const neu = { ...row, auftrag: id, kunde: ctx.auftraege.get(id) ?? row.kunde };
      const res = fertig(neu);
      // Der Kunde folgt dem Auftrag
      if (neu.kunde !== row.kunde) res.aenderungen.push({ feld: "kunde", alt: row.kunde, neu: neu.kunde });
      return res;
    }
    case "bemerkung":
      return fertig({ ...row, bemerkung: roh });
    default:
      return { row, aenderungen: [] };
  }
}

export function setzePausen(row: StundenRow, pausen: Pause[]): EditErgebnis {
  const alt = row.pausen.map((p) => `${p.von}–${p.bis}`).join(", ");
  const neu = pausen.map((p) => `${p.von}–${p.bis}`).join(", ");
  return { row: { ...row, pausen }, aenderungen: alt === neu ? [] : [{ feld: "pausen", alt, neu }] };
}

// Text aus der Zwischenablage (Excel, Google Sheets): Zeilen mit Zeilenumbruch, Zellen mit Tab
export function parseEinfuegen(text: string): string[][] {
  const zeilen = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (zeilen.length > 0 && zeilen[zeilen.length - 1] === "") zeilen.pop();
  return zeilen.map((z) => z.split("\t"));
}

export function istTabellenText(text: string): boolean {
  return text.includes("\t") || text.trim().includes("\n");
}

export interface EinfuegenErgebnis {
  // geänderte Zeilen (nach ID) mit ihren Änderungen
  geaendert: Array<{ row: StundenRow; aenderungen: Aenderung[] }>;
  fehler: string[];
  zellen: number;
}

// Einfügen ab einer Zelle. Die Spalten laufen in der Reihenfolge der 18 Spalten;
// berechnete Spalten (Vorname, Nachname, Gesamtzeit) werden übersprungen, damit
// ein aus dem Excel-Muster kopierter Block passt.
export function einfuegen(zeilen: StundenRow[], startZeile: number, startSpalte: SpalteKey, daten: string[][], ctx: EditKontext): EinfuegenErgebnis {
  const ergebnis: EinfuegenErgebnis = { geaendert: [], fehler: [], zellen: 0 };
  const startIdx = SPALTEN.findIndex((s) => s.key === startSpalte);
  if (startIdx < 0) return ergebnis;
  for (let i = 0; i < daten.length; i++) {
    const ziel = zeilen[startZeile + i];
    if (!ziel) {
      ergebnis.fehler.push(`Zeile ${i + 1} der Einfügung hat keine Zielzeile mehr und wurde ausgelassen.`);
      break;
    }
    let row = ziel;
    const aenderungen: Aenderung[] = [];
    for (let j = 0; j < daten[i].length; j++) {
      const spalte = SPALTEN[startIdx + j];
      if (!spalte) break;
      if (spalte.art === "berechnet") continue;
      const res = setzeFeld(row, spalte.key, daten[i][j], ctx);
      ergebnis.zellen++;
      if (res.fehler) {
        ergebnis.fehler.push(`Zeile ${i + 1}, ${spalte.label}: ${res.fehler}`);
        continue;
      }
      row = res.row;
      aenderungen.push(...res.aenderungen);
    }
    if (aenderungen.length > 0) ergebnis.geaendert.push({ row, aenderungen });
  }
  return ergebnis;
}

export function neueZeile(id: string, datum: string): StundenRow {
  return { id, datum, pnr: "", start: "", pausen: [], ende: "", pauschale: 0, kunde: "", auftrag: "", spesen: 0, reiseKm: 0, reiseGesch: 0, bonus: 0, abzug: 0, bemerkung: "", status: "offen", quelle: "manuell", sourceRef: null };
}

// Welche Spalten eine Warnung einfärbt
export function spaltenFuerWarnung(code: string): SpalteKey[] {
  switch (code) {
    case "pnr": return ["pnr"];
    case "zeit": return ["start", "ende"];
    case "doppelt": return ["datum", "start", "ende"];
    case "vertrag": return ["datum", "pnr"];
    case "ueber10": return ["ende"];
    case "pause_fehlt":
    case "pause_kurz": return ["pauseVon", "pauseBis"];
    case "ruhezeit": return ["start"];
    case "monatsgrenze": return ["gesamt"];
    default: return [];
  }
}

// Die nächste bearbeitbare Spalte für Tab; null am Zeilenende
export function naechsteSpalte(aktuell: SpalteKey): SpalteKey | null {
  const i = BEARBEITBAR.indexOf(aktuell);
  return i >= 0 && i < BEARBEITBAR.length - 1 ? BEARBEITBAR[i + 1] : null;
}
