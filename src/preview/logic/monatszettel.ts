// Monatsstundenzettel (Prototyp): Eine Person trägt über den Monat ihre Tage für EINEN Kunden ein, unterschreibt am
// Monatsende, danach unterschreibt der Kunde. Reine Funktionen (ohne Datenbank), damit sie später übernommen werden können.
import type { Crew, StundenRow } from "./types";
import { addTage, bruttoMinuten, dezimal, formatDatumDE, minutes, normalizeTime, tagNummer } from "./zeit";

export interface Fahrt {
  von: string;
  nach: string;
  km: number | null;
}

export interface MonatsEintrag {
  id: string;
  datum: string; // JJJJ-MM-TT
  start: string;
  ende: string;
  pauseMin: number;
  taetigkeit: string;
  fahrten: Fahrt[];
  privatPkw: boolean;
  spesen: number | null;
  sonderabsprache: string;
  getan: string; // freiwillig: was wurde gemacht
  notiz: string;
}

export type KundenStatus = "offen" | "unterschrieben" | "zurueckgegeben";

export interface MonatsZettel {
  id: string;
  token: string;
  pnr: string;
  kunde: string;
  monat: string; // JJJJ-MM
  eintraege: MonatsEintrag[];
  gesendetAm: string | null;
  personUnterschriftAm: string | null;
  personUnterschrift: string | null;
  kundeStatus: KundenStatus;
  kundeAm: string | null;
  kundeName: string;
  kundeFunktion: string;
  kundeHinweis: string;
  kundeUnterschrift: string | null;
  inStundentabelle: boolean;
}

// Der Kundenlink gilt für einen Kunden und einen Monat und zeigt alle Personen dieses Monats
export interface MonatsKunde {
  kunde: string;
  monat: string;
  token: string;
  kontakt: string;
}

export type ZettelStatus = "leer" | "in_arbeit" | "wartet_kunde" | "zurueck" | "fertig";

export const STATUS_TEXT: Record<ZettelStatus, string> = {
  leer: "noch nichts eingetragen",
  in_arbeit: "wird ausgefüllt",
  wartet_kunde: "wartet auf den Kunden",
  zurueck: "vom Kunden zurückgegeben",
  fertig: "von beiden unterschrieben",
};

export function zettelStatus(z: MonatsZettel): ZettelStatus {
  if (z.kundeStatus === "unterschrieben") return "fertig";
  if (z.kundeStatus === "zurueckgegeben" && !z.personUnterschriftAm) return "zurueck";
  if (z.personUnterschriftAm) return "wartet_kunde";
  return z.eintraege.length === 0 ? "leer" : "in_arbeit";
}

// ─── Kalender ───────────────────────────────────────────────────────────────

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function wochentagIndex(datum: string): number {
  // 1970-01-01 war ein Donnerstag
  return (((tagNummer(datum) + 3) % 7) + 7) % 7;
}

export function wochentagKurz(datum: string): string {
  return WOCHENTAGE[wochentagIndex(datum)];
}

export function tageImMonat(monat: string): string[] {
  const [y, m] = monat.split("-").map(Number);
  const tage = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: tage }, (_, i) => `${monat}-${String(i + 1).padStart(2, "0")}`);
}

// Wochen (Montag bis Sonntag), leere Felder vor dem 1. und nach dem Letzten als null
export function kalenderWochen(monat: string): Array<Array<string | null>> {
  const tage = tageImMonat(monat);
  const felder: Array<string | null> = [...Array(wochentagIndex(tage[0])).fill(null), ...tage];
  while (felder.length % 7 !== 0) felder.push(null);
  const wochen: Array<Array<string | null>> = [];
  for (let i = 0; i < felder.length; i += 7) wochen.push(felder.slice(i, i + 7));
  return wochen;
}

export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

export function monatListeUm(heute: string): Array<{ wert: string; label: string }> {
  const NAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const [y, m] = heute.split("-").map(Number);
  const aus: Array<{ wert: string; label: string }> = [];
  for (const diff of [-1, 0]) {
    const d = new Date(Date.UTC(y, m - 1 + diff, 1));
    const wert = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    aus.push({ wert, label: `${NAMEN[d.getUTCMonth()]} ${d.getUTCFullYear()}${diff === 0 ? " (laufend)" : ""}` });
  }
  return aus;
}

// ─── Rechnen ────────────────────────────────────────────────────────────────

export function eintragMinuten(e: Pick<MonatsEintrag, "start" | "ende" | "pauseMin">): number {
  return Math.max(0, bruttoMinuten(e.start, e.ende) - Math.max(0, e.pauseMin));
}

export interface Summe {
  tage: number;
  eintraege: number;
  minuten: number;
  stunden: number;
  km: number;
  fahrten: number;
  spesen: number;
}

export function summe(z: Pick<MonatsZettel, "eintraege">): Summe {
  const tage = new Set(z.eintraege.map((e) => e.datum));
  const minuten = z.eintraege.reduce((s, e) => s + eintragMinuten(e), 0);
  const fahrten = z.eintraege.reduce((s, e) => s + e.fahrten.length, 0);
  const km = z.eintraege.reduce((s, e) => s + e.fahrten.reduce((k, f) => k + (f.km ?? 0), 0), 0);
  const spesen = z.eintraege.reduce((s, e) => s + (e.spesen ?? 0), 0);
  return { tage: tage.size, eintraege: z.eintraege.length, minuten, stunden: dezimal(minuten), km: Math.round(km * 10) / 10, fahrten, spesen: Math.round(spesen * 100) / 100 };
}

export function sortiert(eintraege: MonatsEintrag[]): MonatsEintrag[] {
  return [...eintraege].sort((a, b) => a.datum.localeCompare(b.datum) || a.start.localeCompare(b.start));
}

// ─── Prüfen ─────────────────────────────────────────────────────────────────

export function pruefeEintrag(e: MonatsEintrag, monat: string): string[] {
  const f: string[] = [];
  if (!e.datum.startsWith(monat)) f.push("Das Datum liegt nicht in diesem Monat.");
  const s = normalizeTime(e.start);
  const en = normalizeTime(e.ende);
  if (!s) f.push("Bitte den Beginn eintragen (zum Beispiel 08:00).");
  if (!en) f.push("Bitte das Ende eintragen (zum Beispiel 16:30).");
  if (s && en) {
    const brutto = bruttoMinuten(s, en);
    if (brutto === 0 || s === en) f.push("Beginn und Ende sind gleich.");
    else {
      if (e.pauseMin < 0 || e.pauseMin >= brutto) f.push("Die Pause ist länger als der Arbeitstag.");
      if (brutto > 16 * 60) f.push("Mehr als 16 Stunden am Stück – bitte prüfen.");
    }
  }
  if (!Number.isFinite(e.pauseMin)) f.push("Die Pause ist keine Zahl.");
  for (const [i, fa] of e.fahrten.entries()) {
    if ((fa.km ?? 0) < 0) f.push(`Fahrt ${i + 1}: Die Kilometer dürfen nicht negativ sein.`);
    if ((fa.km ?? 0) > 0 && (!fa.von.trim() || !fa.nach.trim())) f.push(`Fahrt ${i + 1}: Bitte Start und Ziel eintragen.`);
  }
  if (e.spesen !== null && e.spesen < 0) f.push("Die Spesen dürfen nicht negativ sein.");
  return f;
}

// Zwei Einträge am selben Tag dürfen sich nicht überschneiden
export function ueberschneidungen(eintraege: MonatsEintrag[]): string[] {
  const aus: string[] = [];
  const nachTag = new Map<string, MonatsEintrag[]>();
  for (const e of eintraege) nachTag.set(e.datum, [...(nachTag.get(e.datum) ?? []), e]);
  for (const [datum, liste] of nachTag) {
    const s = [...liste].filter((e) => normalizeTime(e.start) && normalizeTime(e.ende)).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < s.length; i++) {
      const vorher = s[i - 1];
      const ende = minutes(vorher.start) + bruttoMinuten(vorher.start, vorher.ende);
      if (minutes(s[i].start) < ende && ende <= 1440) aus.push(`${formatDatumDE(datum)}: Die Zeiten überschneiden sich.`);
    }
  }
  return aus;
}

export function kannAbschliessen(z: MonatsZettel): { ok: boolean; gruende: string[] } {
  const gruende: string[] = [];
  if (z.eintraege.length === 0) gruende.push("Es ist noch kein Tag eingetragen.");
  for (const e of z.eintraege) for (const f of pruefeEintrag(e, z.monat)) gruende.push(`${formatDatumDE(e.datum)}: ${f}`);
  gruende.push(...ueberschneidungen(z.eintraege));
  return { ok: gruende.length === 0, gruende };
}

// ─── Nachricht ──────────────────────────────────────────────────────────────

export const STANDARD_VORLAGE =
  "Hallo {vorname}, bitte trage hier deine Stunden für {kunde} im {monat} ein: {link}\n" +
  "Du kannst jeden Tag einzeln eintragen (auch Fahrten, Besonderheiten und was du gemacht hast – das ist freiwillig). Am Monatsende prüfst du alles und unterschreibst. Danach unterschreibt der Kunde.";

export function fuelleVorlage(vorlage: string, werte: { vorname: string; kunde: string; monat: string; link: string }): string {
  return vorlage.replace(/\{(vorname|kunde|monat|link)\}/g, (_, k: keyof typeof werte) => werte[k]);
}

export function waNummer(telefon: string): string {
  const n = telefon.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n.slice(1);
  if (n.startsWith("00")) return n.slice(2);
  if (n.startsWith("0")) return `49${n.slice(1)}`;
  return n;
}

export function waLink(telefon: string, text: string): string {
  return `https://wa.me/${waNummer(telefon)}?text=${encodeURIComponent(text)}`;
}

export const LINK_BASIS = "https://app.fess.jobs";

export function personenLink(token: string): string {
  return `${LINK_BASIS}/m/${token}`;
}

export function kundenLink(token: string): string {
  return `${LINK_BASIS}/k/${token}`;
}

// Kurzes, nicht erratbares Zeichen (Prototyp: aus einem Zähler; echt: 32 Zufallsbytes)
export function beispielToken(prefix: string, n: number): string {
  let x = (n + 1) * 2654435761;
  let s = "";
  for (let i = 0; i < 10; i++) {
    x = (Math.imul(x ^ (x >>> 15), 2246822519) + 3266489917) >>> 0;
    s += "abcdefghjkmnpqrstuvwxyz23456789"[x % 31];
  }
  return `${prefix}-${s}`;
}

// ─── In die Stundentabelle übernehmen ───────────────────────────────────────

// Die Pause als Zeitraum in der Mitte des Tages (die Stundentabelle kennt Pausen als von–bis)
export function pauseAlsZeitraum(start: string, ende: string, pauseMin: number): Array<{ von: string; bis: string }> {
  if (pauseMin <= 0) return [];
  const brutto = bruttoMinuten(start, ende);
  const von = (minutes(start) + Math.max(0, Math.floor((brutto - pauseMin) / 2 / 5) * 5)) % 1440;
  const bis = (von + pauseMin) % 1440;
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return [{ von: hm(von), bis: hm(bis) }];
}

export function alsStundenZeilen(z: MonatsZettel): StundenRow[] {
  return sortiert(z.eintraege).map((e, i) => ({
    id: `mz-${z.id}-${i + 1}`,
    datum: e.datum,
    pnr: z.pnr,
    start: normalizeTime(e.start) ?? e.start,
    pausen: pauseAlsZeitraum(normalizeTime(e.start) ?? e.start, normalizeTime(e.ende) ?? e.ende, e.pauseMin),
    ende: normalizeTime(e.ende) ?? e.ende,
    pauschale: 0,
    kunde: z.kunde,
    auftrag: `Monatszettel ${z.monat}`,
    spesen: e.spesen ?? 0,
    reiseKm: e.privatPkw ? Math.round(e.fahrten.reduce((k, f) => k + (f.km ?? 0), 0) * 10) / 10 : 0,
    reiseGesch: 0,
    bonus: 0,
    abzug: 0,
    bemerkung: [e.taetigkeit, e.sonderabsprache && `Absprache: ${e.sonderabsprache}`, e.getan && `Getan: ${e.getan}`, e.notiz].filter(Boolean).join(" · "),
    status: "offen",
    quelle: "App",
    sourceRef: `Monatszettel ${z.id}`,
  }));
}

// ─── Beispieldaten ──────────────────────────────────────────────────────────

// Beispiel-Unterschrift (eine Schreiblinie) für die vorbereitete, schon unterschriebene Person
export const BEISPIEL_UNTERSCHRIFT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><path d="M12 62 C30 18 48 18 52 54 C54 74 70 30 88 40 C104 50 96 70 118 56 C140 40 150 36 170 52 C186 64 200 30 232 34 C256 38 262 62 300 44" fill="none" stroke="#0a1a2f" stroke-width="3" stroke-linecap="round"/></svg>');

// Stunden und Minuten, z. B. 7:45 (für enge Felder im Kalender)
export function stundenMinuten(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function leererEintrag(datum: string): MonatsEintrag {
  return { id: `e-${datum}-${Math.floor(Math.random() * 1e6).toString(36)}`, datum, start: "08:00", ende: "16:30", pauseMin: 30, taetigkeit: "", fahrten: [], privatPkw: false, spesen: null, sonderabsprache: "", getan: "", notiz: "" };
}

function leererZettel(nr: number, pnr: string, kunde: string, monat: string): MonatsZettel {
  return {
    id: `MZ-${monat.replace("-", "")}-${String(nr).padStart(2, "0")}`, token: beispielToken("m", nr), pnr, kunde, monat, eintraege: [], gesendetAm: null,
    personUnterschriftAm: null, personUnterschrift: null, kundeStatus: "offen", kundeAm: null, kundeName: "", kundeFunktion: "", kundeHinweis: "", kundeUnterschrift: null, inStundentabelle: false,
  };
}

export interface BeispielDaten {
  zettel: MonatsZettel[];
  kunden: MonatsKunde[];
}

// Ausgangslage zum Durchklicken: drei Personen bei einem Kunden – eine fertig ausgefüllt und unterschrieben,
// eine halb ausgefüllt, eine noch ohne Link
export function beispielDaten(crew: Crew[], heute: string, kunde = "Nordlicht Live GmbH"): BeispielDaten {
  const monat = monatVon(heute);
  const personen = crew.filter((c) => c.status === "aktiv").slice(0, 3);
  const [a, b, c] = personen;
  const zettel: MonatsZettel[] = [];
  const arbeitstage = tageImMonat(monat).filter((d) => d <= heute && wochentagIndex(d) < 5);
  if (a) {
    const z = leererZettel(1, a.pnr, kunde, monat);
    z.gesendetAm = `${monat}-02T09:00:00.000Z`;
    z.eintraege = arbeitstage.slice(0, 6).map((d, i) => ({ ...leererEintrag(d), id: `e-a-${i}`, taetigkeit: "Stagehand", fahrten: i === 2 ? [{ von: "Stuttgart", nach: "Porsche-Arena", km: 14 }] : [], privatPkw: i === 2, sonderabsprache: i === 4 ? "2 Std. früher Feierabend nach Absprache mit dem Hallenmeister" : "", getan: i === 0 ? "Aufbau Bühne und Traversen" : "", ende: i === 4 ? "14:30" : "16:30" }));
    z.personUnterschriftAm = `${heute}T08:00:00.000Z`;
    z.personUnterschrift = BEISPIEL_UNTERSCHRIFT;
    zettel.push(z);
  }
  if (b) {
    const z = leererZettel(2, b.pnr, kunde, monat);
    z.gesendetAm = `${monat}-02T09:00:00.000Z`;
    z.eintraege = arbeitstage.slice(0, 3).map((d, i) => ({ ...leererEintrag(d), id: `e-b-${i}`, taetigkeit: "Logistik", start: "07:00", ende: "15:30", pauseMin: 45 }));
    zettel.push(z);
  }
  if (c) zettel.push(leererZettel(3, c.pnr, kunde, monat));
  return { zettel, kunden: [{ kunde, monat, token: beispielToken("k", 1), kontakt: "Frau Berger (Hallenleitung)" }] };
}

export function datumAnzeige(datum: string): string {
  return `${wochentagKurz(datum)}, ${formatDatumDE(datum)}`;
}

export { addTage };
