// Tabellen einlesen (reine Funktionen, laufen im Browser und auf dem Server):
// CSV/TSV mit Anführungszeichen, erkannte Trennzeichen, Zeichensatz, Kopfzeile finden,
// Spalten anhand der Überschriften zuordnen.

export interface Tabelle {
  kopf: string[];
  zeilen: string[][];
}

const TRENNER = ["\t", ";", ",", "|"] as const;

// Text aus Bytes: UTF-8 (mit oder ohne BOM) oder Windows-1252 (häufig bei Excel-CSV aus Deutschland)
export function dekodiere(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Alle Zeilen als Zellen; Zeilenumbrüche in Anführungszeichen bleiben erhalten
export function parseZeilen(text: string, trenner: string): string[][] {
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let zelle = "";
  let inQ = false;
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          zelle += '"';
          i++;
        } else inQ = false;
      } else zelle += ch;
    } else if (ch === '"' && zelle === "") inQ = true;
    else if (ch === trenner) {
      zeile.push(zelle);
      zelle = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      zeile.push(zelle);
      zelle = "";
      zeilen.push(zeile);
      zeile = [];
    } else zelle += ch;
  }
  if (zelle !== "" || zeile.length > 0) {
    zeile.push(zelle);
    zeilen.push(zeile);
  }
  return zeilen.map((z) => z.map((c) => c.trim()));
}

// Das Trennzeichen, das in den ersten Zeilen am gleichmäßigsten viele Spalten ergibt
export function erkenneTrenner(text: string): string {
  const probe = text.slice(0, 20_000);
  let bester = ";";
  let beste = 0;
  for (const d of TRENNER) {
    const z = parseZeilen(probe, d).filter((r) => r.some((c) => c !== "")).slice(0, 12);
    if (z.length === 0) continue;
    const breiten = z.map((r) => r.length);
    const haeufigste = breiten.sort((a, b) => a - b)[Math.floor(breiten.length / 2)];
    // Punkte: Spaltenzahl, aber nur wenn die Zeilen ähnlich breit sind
    const gleich = z.filter((r) => r.length === haeufigste).length / z.length;
    const punkte = haeufigste > 1 ? haeufigste * gleich : 0;
    if (punkte > beste) {
      beste = punkte;
      bester = d;
    }
  }
  return bester;
}

export function leereZeile(z: string[]): boolean {
  return z.every((c) => c.trim() === "");
}

// Kleinbuchstaben ohne Umlaute und Akzente: ä → ae, ö → oe, ü → ue, ß → ss, é → e
export function umlautFrei(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

// Überschrift vergleichbar machen: "Beschäftigungs-Art" → "beschaeftigungsart"
export function normalisiereKopf(text: string): string {
  return umlautFrei(text).replace(/[^a-z0-9]/g, "");
}

// Alle nicht leeren Zeilen einer Tabelle als Rohdaten (ohne Kopf-Auswahl)
export function parseText(text: string): string[][] {
  const trenner = erkenneTrenner(text);
  return parseZeilen(text, trenner).filter((z) => !leereZeile(z));
}

// Welche der ersten Zeilen ist die Überschrift? Die mit den meisten bekannten Begriffen,
// sonst die erste Zeile, die mehrere nicht-leere Textzellen hat.
export function findeKopfzeile(rows: string[][], bekannt: RegExp[]): number {
  let beste = -1;
  let bestePunkte = 0;
  const grenze = Math.min(rows.length, 15);
  for (let i = 0; i < grenze; i++) {
    const treffer = rows[i].filter((c) => c.trim() !== "" && bekannt.some((re) => re.test(normalisiereKopf(c)))).length;
    if (treffer > bestePunkte) {
      bestePunkte = treffer;
      beste = i;
    }
  }
  if (beste >= 0 && bestePunkte >= 2) return beste;
  for (let i = 0; i < grenze; i++) {
    const zellen = rows[i].filter((c) => c.trim() !== "");
    if (zellen.length >= 2 && zellen.every((c) => !/^[\d.,:\s-]+$/.test(c))) return i;
  }
  return 0;
}

export function tabelleAusRohdaten(rows: string[][], kopfZeile: number): Tabelle {
  const kopf = (rows[kopfZeile] ?? []).map((c) => c.trim());
  const breite = Math.max(kopf.length, ...rows.slice(kopfZeile + 1, kopfZeile + 200).map((r) => r.length));
  while (kopf.length < breite) kopf.push("");
  const zeilen = rows.slice(kopfZeile + 1).filter((z) => !leereZeile(z)).map((z) => {
    const c = [...z];
    while (c.length < breite) c.push("");
    return c;
  });
  return { kopf, zeilen };
}

export interface FeldDef<F extends string> {
  feld: F;
  muster: RegExp;
}

// Ordnet jedem Feld die erste passende Spalte zu (-1 = keine)
export function erkenneSpalten<F extends string>(kopf: string[], defs: Array<FeldDef<F>>): Record<F, number> {
  const out = {} as Record<F, number>;
  const vergeben = new Set<number>();
  for (const d of defs) {
    const i = kopf.findIndex((h, idx) => !vergeben.has(idx) && h.trim() !== "" && d.muster.test(normalisiereKopf(h)));
    out[d.feld] = i;
    if (i >= 0) vergeben.add(i);
  }
  return out;
}

export function zelle(zeile: string[], index: number | undefined): string {
  if (index === undefined || index < 0 || index >= zeile.length) return "";
  return (zeile[index] ?? "").trim();
}

// ─── Werte lesen ────────────────────────────────────────────────────────────

const istSchaltjahr = (j: number) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
function tagGueltig(j: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const tage = [31, istSchaltjahr(j) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= tage;
}
const p2 = (n: number) => String(n).padStart(2, "0");

// Datum lesen: 31.12.2026, 1.3.26, 2026-12-31, 31/12/2026, Excel-Seriennummer, "Fr, 31.12.2026"
export function parseDatum(roh: string): string | null {
  let t = roh.trim();
  if (!t) return null;
  t = t.replace(/^(mo|di|mi|do|fr|sa|so)[a-z]*\.?,?\s+/i, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) {
    const [j, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return tagGueltig(j, mo, d) ? `${j}-${p2(mo)}-${p2(d)}` : null;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\s.*)?$/.exec(t);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const j = m[3].length === 2 ? (Number(m[3]) > 60 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
    return tagGueltig(j, mo, d) ? `${j}-${p2(mo)}-${p2(d)}` : null;
  }
  // Excel-Seriennummer (Tage seit 30.12.1899); nur plausible Jahre 1950–2100
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t));
    if (n >= 18264 && n <= 73415) {
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
      return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
    }
  }
  return null;
}

// Uhrzeit lesen: 8:00, 08.30, 8 Uhr, 0830, 7h30, Excel-Bruchteil (0,5 = 12:00)
export function parseUhrzeit(roh: string): string | null {
  const t = roh.trim().toLowerCase().replace(/uhr/g, "").trim();
  if (!t) return null;
  const mitDatum = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(t);
  if (mitDatum && /\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}/.test(t)) return fertig(Number(mitDatum[1]), Number(mitDatum[2]));
  let m = /^(\d{1,2})[:.h](\d{1,2})(?::\d{2})?$/.exec(t);
  if (m) return fertig(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})$/.exec(t);
  if (m) return fertig(Number(m[1]), 0);
  m = /^(\d{3,4})$/.exec(t);
  if (m) return fertig(Number(m[1].slice(0, -2)), Number(m[1].slice(-2)));
  m = /^0[.,]\d+$/.exec(t);
  if (m) {
    const min = Math.round(Number(t.replace(",", ".")) * 1440);
    return fertig(Math.floor(min / 60) % 24, min % 60);
  }
  return null;
}
function fertig(h: number, mi: number): string | null {
  return h >= 0 && h <= 24 && mi >= 0 && mi <= 59 ? `${p2(h === 24 ? 0 : h)}:${p2(mi)}` : null;
}

// "08:00-16:30", "8 - 16 Uhr", "08:00 bis 16:30" → [start, ende]
export function parseZeitraum(roh: string): [string, string] | null {
  const t = roh.trim().toLowerCase().replace(/uhr/g, "");
  const m = /^\s*([\d:.h]+)\s*(?:-|–|—|bis)\s*([\d:.h]+)\s*$/.exec(t);
  if (!m) return null;
  const a = parseUhrzeit(m[1]);
  const b = parseUhrzeit(m[2]);
  return a && b ? [a, b] : null;
}

// Zahl lesen: "13,90", "1.234,56", "13.9", "13,90 €"
export function parseZahl(roh: string): number | null {
  let t = roh.trim().replace(/[€\s]|eur/gi, "");
  if (!t) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function parseJaNein(roh: string): boolean | null {
  const t = roh.trim().toLowerCase();
  if (!t) return null;
  if (/^(ja|j|yes|y|true|wahr|1|x|✓|ok)$/.test(t)) return true;
  if (/^(nein|n|no|false|falsch|0|-)$/.test(t)) return false;
  return null;
}

// Zahlen, die Excel als "123.0" liefert, wieder zu "123" machen
export function bereinigeNummer(roh: string): string {
  const t = roh.trim();
  return /^\d+\.0+$/.test(t) ? t.replace(/\.0+$/, "") : t;
}

// "Mustermann, Max" oder "Max Mustermann"
export function teileName(voll: string): { vorname: string; nachname: string } {
  const text = voll.trim().replace(/\s+/g, " ");
  if (text.includes(",")) {
    const [nach, vor] = text.split(",");
    return { vorname: (vor ?? "").trim(), nachname: (nach ?? "").trim() };
  }
  const teile = text.split(" ");
  if (teile.length === 1) return { vorname: "", nachname: teile[0] };
  return { vorname: teile.slice(0, -1).join(" "), nachname: teile[teile.length - 1] };
}
