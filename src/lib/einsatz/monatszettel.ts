// Monatszettel (Einsatzmodul): reine Logik ohne Datenbank – Eintragsformat, Prüfungen, Summen, Kalender, Nachrichten.
// Eine Person trägt über den Monat Tage für EINEN Kunden ein und unterschreibt am Monatsende; danach bestätigt der Kunde.
import { z } from "zod";
import { addDaysToKey, formatKeyDE, isValidDateKey, isValidTime, weekdayOfKey } from "./tz";

// ─── Format der Tageseinträge ───────────────────────────────────────────────

const zeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit wie 08:00 eintragen.");

export const FahrtSchema = z.object({
  von: z.string().trim().max(100),
  nach: z.string().trim().max(100),
  km: z.number().min(0).max(2000).nullable(),
});

export const EintragSchema = z.object({
  id: z.string().min(1).max(60),
  datum: z.string().refine(isValidDateKey, "Ungültiges Datum."),
  start: zeit,
  ende: zeit,
  pauseMin: z.number().int().min(0).max(600),
  taetigkeit: z.string().trim().max(80),
  fahrten: z.array(FahrtSchema).max(8),
  // Womit gefahren wurde (nur wichtig, wenn Fahrten eingetragen sind)
  pkwArt: z.enum(["PRIVAT", "FIRMA"]),
  spesen: z.number().min(0).max(2000).nullable(),
  sonderabsprache: z.string().trim().max(600),
  getan: z.string().trim().max(1000),
  notiz: z.string().trim().max(400),
  // Einteilung, die bei der Unterschrift dazu angelegt wurde (setzt nur der Server)
  saId: z.string().max(60).optional(),
});

export const TageSchema = z.array(EintragSchema).max(150);

export type Fahrt = z.infer<typeof FahrtSchema>;
export type MonatsEintrag = z.infer<typeof EintragSchema>;

// ─── Monat und Kalender ─────────────────────────────────────────────────────

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function istMonat(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monatsName(monat: string): string {
  const [y, m] = monat.split("-").map(Number);
  return `${MONATSNAMEN[(m || 1) - 1]} ${y}`;
}

export function monatErsterTag(monat: string): string {
  return `${monat}-01`;
}

export function monatLetzterTag(monat: string): string {
  const [y, m] = monat.split("-").map(Number);
  return `${monat}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function tageImMonat(monat: string): string[] {
  const letzter = Number(monatLetzterTag(monat).slice(8));
  return Array.from({ length: letzter }, (_, i) => `${monat}-${String(i + 1).padStart(2, "0")}`);
}

// Montag = 0 … Sonntag = 6
export function wochentagIndex(datum: string): number {
  return (weekdayOfKey(datum) + 6) % 7;
}

const KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function wochentagKurz(datum: string): string {
  return KURZ[wochentagIndex(datum)];
}

export function datumAnzeige(datum: string): string {
  return `${wochentagKurz(datum)}, ${formatKeyDE(datum)}`;
}

// Wochen Montag bis Sonntag; leere Felder davor und danach sind null
export function kalenderWochen(monat: string): Array<Array<string | null>> {
  const tage = tageImMonat(monat);
  const felder: Array<string | null> = [...Array<null>(wochentagIndex(tage[0])).fill(null), ...tage];
  while (felder.length % 7 !== 0) felder.push(null);
  const wochen: Array<Array<string | null>> = [];
  for (let i = 0; i < felder.length; i += 7) wochen.push(felder.slice(i, i + 7));
  return wochen;
}

// Letzter und laufender Monat, ausgehend vom heutigen Tag (Schlüssel JJJJ-MM-TT)
export function monatsAuswahl(heute: string): Array<{ wert: string; label: string }> {
  const [y, m] = heute.split("-").map(Number);
  return [-1, 0].map((diff) => {
    const d = new Date(Date.UTC(y, m - 1 + diff, 1));
    const wert = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { wert, label: `${monatsName(wert)}${diff === 0 ? " (laufend)" : ""}` };
  });
}

// ─── Rechnen ────────────────────────────────────────────────────────────────

function minuten(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Ende vor oder gleich Beginn heißt: nach Mitternacht
export function bruttoMinuten(start: string, ende: string): number {
  if (!isValidTime(start) || !isValidTime(ende)) return 0;
  let e = minuten(ende);
  const s = minuten(start);
  if (e <= s) e += 1440;
  return e - s;
}

export function eintragMinuten(e: Pick<MonatsEintrag, "start" | "ende" | "pauseMin">): number {
  return Math.max(0, bruttoMinuten(e.start, e.ende) - Math.max(0, e.pauseMin));
}

export function stundenDezimal(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

export function formatStunden(h: number): string {
  return h.toFixed(2).replace(".", ",");
}

export function stundenMinuten(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export type Summe = { tage: number; eintraege: number; minuten: number; stunden: number; km: number; fahrten: number; spesen: number };

export function summe(eintraege: Array<Pick<MonatsEintrag, "datum" | "start" | "ende" | "pauseMin" | "fahrten" | "spesen">>): Summe {
  const min = eintraege.reduce((s, e) => s + eintragMinuten(e), 0);
  const km = eintraege.reduce((s, e) => s + e.fahrten.reduce((k, f) => k + (f.km ?? 0), 0), 0);
  return {
    tage: new Set(eintraege.map((e) => e.datum)).size,
    eintraege: eintraege.length,
    minuten: min,
    stunden: stundenDezimal(min),
    km: Math.round(km * 10) / 10,
    fahrten: eintraege.reduce((s, e) => s + e.fahrten.length, 0),
    spesen: Math.round(eintraege.reduce((s, e) => s + (e.spesen ?? 0), 0) * 100) / 100,
  };
}

export function sortiert<T extends Pick<MonatsEintrag, "datum" | "start">>(eintraege: T[]): T[] {
  return [...eintraege].sort((a, b) => a.datum.localeCompare(b.datum) || a.start.localeCompare(b.start));
}

// ─── Prüfen ─────────────────────────────────────────────────────────────────

export function pruefeEintrag(e: MonatsEintrag, monat: string): string[] {
  const f: string[] = [];
  if (!e.datum.startsWith(`${monat}-`)) f.push("Das Datum liegt nicht in diesem Monat.");
  if (!isValidTime(e.start)) f.push("Bitte den Beginn eintragen (zum Beispiel 08:00).");
  if (!isValidTime(e.ende)) f.push("Bitte das Ende eintragen (zum Beispiel 16:30).");
  if (isValidTime(e.start) && isValidTime(e.ende)) {
    const brutto = bruttoMinuten(e.start, e.ende);
    if (e.start === e.ende) f.push("Beginn und Ende sind gleich.");
    else {
      if (e.pauseMin >= brutto) f.push("Die Pause ist länger als der Arbeitstag.");
      if (brutto > 16 * 60) f.push("Mehr als 16 Stunden am Stück – bitte prüfen.");
    }
  }
  for (const [i, fa] of e.fahrten.entries()) {
    if ((fa.km ?? 0) > 0 && (!fa.von.trim() || !fa.nach.trim())) f.push(`Fahrt ${i + 1}: Bitte Start und Ziel eintragen.`);
  }
  if (e.fahrten.length > 0 && e.pkwArt === "PRIVAT" && e.fahrten.every((x) => !x.km)) f.push("Fahrt mit privatem PKW: Bitte die Kilometer eintragen.");
  return f;
}

// Zwei Einträge am selben Tag dürfen sich nicht überschneiden
export function ueberschneidungen(eintraege: MonatsEintrag[]): string[] {
  const aus: string[] = [];
  const nachTag = new Map<string, MonatsEintrag[]>();
  for (const e of eintraege) nachTag.set(e.datum, [...(nachTag.get(e.datum) ?? []), e]);
  for (const [datum, liste] of nachTag) {
    const s = liste.filter((e) => isValidTime(e.start) && isValidTime(e.ende)).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < s.length; i++) {
      const vorher = s[i - 1];
      const ende = minuten(vorher.start) + bruttoMinuten(vorher.start, vorher.ende);
      if (minuten(s[i].start) < ende) aus.push(`${formatKeyDE(datum)}: Die Zeiten überschneiden sich.`);
    }
  }
  return aus;
}

export function kannAbschliessen(monat: string, eintraege: MonatsEintrag[]): { ok: boolean; gruende: string[] } {
  const gruende: string[] = [];
  if (eintraege.length === 0) gruende.push("Es ist noch kein Tag eingetragen.");
  for (const e of sortiert(eintraege)) for (const f of pruefeEintrag(e, monat)) gruende.push(`${formatKeyDE(e.datum)}: ${f}`);
  gruende.push(...ueberschneidungen(eintraege));
  return { ok: gruende.length === 0, gruende };
}

// ─── Stand ──────────────────────────────────────────────────────────────────

export type KundeStatus = "OFFEN" | "ZURUECK" | "BESTAETIGT";
export type ZettelStand = "leer" | "in_arbeit" | "wartet_kunde" | "zurueck" | "fertig";

export const STAND_TEXT: Record<ZettelStand, string> = {
  leer: "noch nichts eingetragen",
  in_arbeit: "wird ausgefüllt",
  wartet_kunde: "wartet auf den Kunden",
  zurueck: "vom Kunden zurückgegeben",
  fertig: "von beiden unterschrieben",
};

export function zettelStand(z: { anzahlTage: number; personSigniert: boolean; kundeStatus: KundeStatus }): ZettelStand {
  if (z.kundeStatus === "BESTAETIGT") return "fertig";
  if (z.personSigniert) return "wartet_kunde";
  if (z.kundeStatus === "ZURUECK") return "zurueck";
  return z.anzahlTage === 0 ? "leer" : "in_arbeit";
}

// ─── Nachrichten ────────────────────────────────────────────────────────────

export const STANDARD_VORLAGE =
  "Hallo {vorname}, bitte trage hier deine Stunden für {kunde} im {monat} ein: {link}\n" +
  "Du kannst jeden Tag einzeln eintragen (auch Fahrten, Besonderheiten und was du gemacht hast – das ist freiwillig). " +
  "Am Monatsende prüfst du alles und unterschreibst. Danach unterschreibt der Kunde.\n" +
  "Der Link gehört nur dir. Bei Fragen melde dich bei der Dispo. Dein fess.jobs Team";

export function fuelleVorlage(vorlage: string, werte: { vorname: string; kunde: string; monat: string; link: string }): string {
  return vorlage.replace(/\{(vorname|kunde|monat|link)\}/g, (_, k: keyof typeof werte) => werte[k]);
}

export function kundenNachricht(werte: { anrede: string; kunde: string; monat: string; link: string }): string {
  return [
    `Guten Tag${werte.anrede ? ` ${werte.anrede}` : ""},`,
    `hier sind die Stunden unserer Mitarbeiter bei *${werte.kunde}* für ${werte.monat}.`,
    `Bitte kurz prüfen und unterschreiben (kein Login nötig):`,
    werte.link,
    ``,
    `Stimmt bei jemandem etwas nicht, können Sie den Zettel mit einem Hinweis zurückgeben.`,
    `Mit freundlichen Grüßen, FESS recruitment`,
  ].join("\n");
}

export function waNummer(telefon: string): string {
  const n = telefon.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n.slice(1);
  if (n.startsWith("00")) return n.slice(2);
  if (n.startsWith("0")) return `49${n.slice(1)}`;
  return n;
}

export function waLinkAn(telefon: string | null, text: string): string {
  return `https://wa.me/${telefon ? waNummer(telefon) : ""}?text=${encodeURIComponent(text)}`;
}

// ─── Übernahme in den Einsatz ───────────────────────────────────────────────

// Was in den Zeiteintrag als Notiz kommt: Sonderabsprache, Beschreibung und freie Notiz
export function eintragNotiz(e: Pick<MonatsEintrag, "sonderabsprache" | "getan" | "notiz">): string | null {
  const teile = [e.sonderabsprache && `Absprache: ${e.sonderabsprache}`, e.getan && `Getan: ${e.getan}`, e.notiz].filter(Boolean);
  return teile.length > 0 ? teile.join(" · ").slice(0, 1500) : null;
}

// Bezeichnung der Schicht, unter der ein Tag im Monatseinsatz läuft; mehrere Einträge am Tag werden durchnummeriert
export function schichtBezeichnung(datum: string, lfd: number): string {
  return `Monatszettel ${formatKeyDE(datum).slice(0, 6)}${lfd > 1 ? ` (${lfd})` : ""}`;
}

// Läuft ein Eintrag über Mitternacht, liegt das Ende am Folgetag
export function endeDatum(datum: string, start: string, ende: string): string {
  return minuten(ende) <= minuten(start) ? addDaysToKey(datum, 1) : datum;
}

export function neuerEintragId(): string {
  return `e-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
