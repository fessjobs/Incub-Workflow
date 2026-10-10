// Personal-Import (zvoove-Personalstamm oder eine eigene Excel-Liste): Spalten erkennen,
// Zeilen prüfen, mit vorhandenen Personen abgleichen und die Änderungen vorschlagen.
// Reine Funktionen – die Oberfläche zeigt die Vorschau und übernimmt erst nach Bestätigung.
// Sensible Spalten (Geburtsdatum, IBAN, SV-Nummer …) werden erkannt und NICHT übernommen.
import type { Contract, Crew, Pool, Vertragsart } from "@/preview/logic/types";
import { geocodePlz, naechsterPool } from "@/preview/logic/geo";
import { bereinigeNummer, erkenneSpalten, normalisiereKopf, parseDatum, parseZahl, teileName, zelle, type FeldDef, type Tabelle } from "./tabelle";

export type PersonalFeld =
  | "pnr" | "vorname" | "nachname" | "name" | "telefon" | "email" | "plz" | "ort"
  | "vertragsart" | "eintritt" | "austritt" | "befristetBis" | "befristet" | "wochenstunden" | "stundenlohn" | "status";

export const PERSONAL_FELDER: Array<{ feld: PersonalFeld; label: string; hinweis?: string }> = [
  { feld: "pnr", label: "Personalnummer", hinweis: "Damit werden vorhandene Personen erkannt und aktualisiert." },
  { feld: "vorname", label: "Vorname" },
  { feld: "nachname", label: "Nachname" },
  { feld: "name", label: "Ganzer Name", hinweis: "Nur nötig, wenn Vor- und Nachname in einer Spalte stehen." },
  { feld: "telefon", label: "Handy / Telefon" },
  { feld: "email", label: "E-Mail" },
  { feld: "plz", label: "PLZ" },
  { feld: "ort", label: "Wohnort" },
  { feld: "vertragsart", label: "Vertrags- / Beschäftigungsart", hinweis: "z. B. geringfügig, kurzfristig, Teilzeit …" },
  { feld: "eintritt", label: "Eintritt / Vertragsbeginn" },
  { feld: "befristetBis", label: "Befristet bis / Vertragsende" },
  { feld: "befristet", label: "Befristet (ja/nein)", hinweis: "Nur als Hinweis, wenn kein Enddatum da ist." },
  { feld: "austritt", label: "Austritt" },
  { feld: "wochenstunden", label: "Wochenstunden" },
  { feld: "stundenlohn", label: "Stundenlohn" },
  { feld: "status", label: "Status (aktiv / inaktiv)" },
];

const DEFS: Array<FeldDef<PersonalFeld>> = [
  { feld: "pnr", muster: /^(personalnummer|persnr|persnummer|pnr|personalnr|mitarbeiternummer|mitarbeiternr|manr|mitarbeiterid|nummer|nr)$/ },
  { feld: "vorname", muster: /^(vorname|vornamen|rufname|firstname)$/ },
  { feld: "nachname", muster: /^(nachname|familienname|lastname|surname|name)$/ },
  { feld: "name", muster: /^(vollername|vollstaendigername|mitarbeiter|mitarbeitername|person|namevorname|nachnamevorname|nameundvorname)$/ },
  { feld: "telefon", muster: /^(mobil|mobilnummer|mobiltelefon|handy|handynummer|mobilfunk|telefonmobil|telefon|telefonnummer|tel|telprivat|telefonprivat)$/ },
  { feld: "email", muster: /^(email|emailadresse|mail|mailadresse|epost|emailprivat)$/ },
  { feld: "plz", muster: /^(plz|postleitzahl|zip|plzwohnort)$/ },
  { feld: "ort", muster: /^(ort|wohnort|stadt|city|ortwohnort)$/ },
  { feld: "vertragsart", muster: /^(vertragsart|beschaeftigungsart|beschaeftigungsform|arbeitsverhaeltnis|arbeitsverhaeltnisart|personengruppe|personengruppenschluessel|anstellungsart|beschaeftigung|mitarbeitergruppe|vertragstyp|art)$/ },
  { feld: "eintritt", muster: /^(eintritt|eintrittsdatum|eintrittam|vertragsbeginn|beginn|vertragvon|gueltigvon|beschaeftigtseit|eintrittsdat|einstellungsdatum|einstellung)$/ },
  { feld: "befristetBis", muster: /^(befristetbis|befristungbis|befristung|befristungsende|vertragsende|vertragbis|vertragsendedatum|gueltigbis|enddatumvertrag|ablauf|befristungsdatum|befristetzum)$/ },
  { feld: "befristet", muster: /^(befristet|istbefristet|befristetja|zeitlichbefristet)$/ },
  { feld: "austritt", muster: /^(austritt|austrittsdatum|austrittam|ausgeschiedenam|abgangsdatum|kuendigungzum|beendigung|endedesarbeitsverhaeltnisses)$/ },
  { feld: "wochenstunden", muster: /^(wochenstunden|wochenarbeitszeit|stundenwoche|azwoche|wochenarbeitsstunden|sollstundenwoche|stdwoche)$/ },
  { feld: "stundenlohn", muster: /^(stundenlohn|lohn|stundensatz|bruttostundenlohn|grundlohn|stundenlohnbrutto|lohnsatz|entgelt|stundenverdienst)$/ },
  { feld: "status", muster: /^(status|aktiv|zustand|mitarbeiterstatus|personalstatus)$/ },
];

// Spalten, die NICHT übernommen werden (Datensparsamkeit, DSGVO/AGG)
const SENSIBEL: Array<[RegExp, string]> = [
  [/^(geburtsdatum|geburtstag|gebdatum|geburtsdat|geburtsort|geburtsland|geburtsname|alter)$/, "Geburtsdaten"],
  [/^(iban|bic|kontonummer|bankverbindung|bank|blz|kontoinhaber)$/, "Bankdaten"],
  [/^(svnummer|sozialversicherungsnummer|rentenversicherungsnummer|rvnummer|versicherungsnummer|svnr)$/, "Sozialversicherungsnummer"],
  [/^(steuerid|steueridentifikationsnummer|steuernummer|idnr|steuerklasse|lohnsteuermerkmale|kinderfreibetrag|kinderfreibetraege)$/, "Steuerdaten"],
  [/^(krankenkasse|krankenkassenschluessel|kkbeitrag|beitragsgruppe)$/, "Krankenkasse"],
  [/^(konfession|religion|kirchensteuer|religionszugehoerigkeit)$/, "Konfession"],
  [/^(staatsangehoerigkeit|nationalitaet|nation|aufenthaltstitel|arbeitserlaubnis|geschlecht|familienstand|schwerbehinderung|behinderung|kinder|anzahlkinder)$/, "Personenmerkmale"],
  [/^(strasse|strassehausnummer|anschrift|adresse|hausnummer|adresszusatz)$/, "Straße (wird nicht gebraucht)"],
];

export function erkennePersonalSpalten(kopf: string[]): Record<PersonalFeld, number> {
  const sp = erkenneSpalten(kopf, DEFS);
  // „Name“ ist mehrdeutig: gibt es eine eigene Vornamen-Spalte, ist „Name“ der Nachname; sonst der ganze Name
  if (sp.vorname < 0 && sp.nachname >= 0 && sp.name < 0 && /,|vorname/.test(kopf[sp.nachname].toLowerCase())) {
    sp.name = sp.nachname;
    sp.nachname = -1;
  }
  return sp;
}

export function sensibleSpalten(kopf: string[]): Array<{ spalte: string; grund: string }> {
  const out: Array<{ spalte: string; grund: string }> = [];
  for (const k of kopf) {
    if (!k.trim()) continue;
    const n = normalisiereKopf(k);
    const hit = SENSIBEL.find(([re]) => re.test(n));
    if (hit) out.push({ spalte: k, grund: hit[1] });
  }
  return out;
}

export function kopfPersonal(): RegExp[] {
  return DEFS.map((d) => d.muster);
}

// ─── Vertragsart ────────────────────────────────────────────────────────────

export const VERTRAGSARTEN: Vertragsart[] = ["Minijob", "kurzfristig", "Werkstudent", "TZ", "VZ"];
export const STANDARD_WOCHENSTUNDEN: Record<Vertragsart, number> = { Minijob: 10, kurzfristig: 30, Werkstudent: 20, TZ: 25, VZ: 40 };

// Text aus zvoove oder Excel → Vertragsart; null = nicht erkannt (die Oberfläche fragt nach)
export function erkenneVertragsart(roh: string): Vertragsart | null {
  const t = normalisiereKopf(roh);
  if (!t) return null;
  if (/geringfuegig|minijob|mini|450|520|538|556|603|gb\b/.test(t) || t === "gb") return "Minijob";
  if (/kurzfrist|kurzfr|unstetig|kb$/.test(t)) return "kurzfristig";
  if (/werkstud/.test(t)) return "Werkstudent";
  if (/teilzeit|tz$/.test(t)) return "TZ";
  if (/vollzeit|vz$/.test(t)) return "VZ";
  return null;
}

// ─── Zeilen auswerten ───────────────────────────────────────────────────────

export interface PersonalSatz {
  pnr: string;
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
  plz: string;
  ort: string;
  vertragsartRoh: string;
  eintritt: string | null;
  austritt: string | null;
  befristetBis: string | null;
  befristet: boolean | null;
  wochenstunden: number | null;
  stundenlohn: number | null;
  statusRoh: string;
}

export interface Zeilenbefund {
  nr: number;
  satz: PersonalSatz | null;
  fehler: string | null;
  warnungen: string[];
}

function jaNeinText(t: string): boolean | null {
  const n = t.trim().toLowerCase();
  if (!n) return null;
  if (/^(ja|j|yes|true|1|x|befristet)$/.test(n)) return true;
  if (/^(nein|n|no|false|0|unbefristet)$/.test(n)) return false;
  return null;
}

export function leseSatz(zeile: string[], sp: Record<PersonalFeld, number>, nr: number): Zeilenbefund {
  const warnungen: string[] = [];
  let vorname = zelle(zeile, sp.vorname);
  let nachname = zelle(zeile, sp.nachname);
  const voll = zelle(zeile, sp.name);
  if (!vorname && voll) ({ vorname, nachname } = teileName(voll));
  else if (!vorname && nachname.includes(",")) ({ vorname, nachname } = teileName(nachname));
  const pnr = bereinigeNummer(zelle(zeile, sp.pnr));
  if (!vorname && !nachname && !pnr) return { nr, satz: null, fehler: "Leere Zeile", warnungen };
  if (!nachname || !vorname) return { nr, satz: null, fehler: `Vor- oder Nachname fehlt${vorname || nachname ? ` („${vorname || nachname}“)` : ""}`, warnungen };

  const datum = (feld: PersonalFeld, label: string): string | null => {
    const t = zelle(zeile, sp[feld]);
    if (!t) return null;
    const d = parseDatum(t);
    if (!d) warnungen.push(`${label} „${t}“ nicht lesbar`);
    return d;
  };
  const eintritt = datum("eintritt", "Eintritt");
  const austritt = datum("austritt", "Austritt");
  let befristetBis = datum("befristetBis", "Befristung");
  const befristetText = zelle(zeile, sp.befristet);
  const befristet = jaNeinText(befristetText);
  // „Befristung“ kann auch „ja/nein“ enthalten: dann ist es kein Datum
  if (befristetBis === null && sp.befristetBis >= 0) {
    const t = zelle(zeile, sp.befristetBis);
    if (t && jaNeinText(t) === null && !parseDatum(t)) { /* Warnung steht schon oben */ }
  }
  const telefon = zelle(zeile, sp.telefon);
  const email = zelle(zeile, sp.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnungen.push(`E-Mail „${email}“ ungültig – wird nicht übernommen`);
  const plzRoh = zelle(zeile, sp.plz);
  const plz = plzRoh.replace(/\.0+$/, "").padStart(plzRoh && /^\d{4}$/.test(plzRoh) ? 5 : 0, "0");
  if (plz && !/^\d{5}$/.test(plz)) warnungen.push(`PLZ „${plzRoh}“ ungültig – wird nicht übernommen`);
  const lohnText = zelle(zeile, sp.stundenlohn);
  const lohn = lohnText ? parseZahl(lohnText) : null;
  if (lohnText && lohn === null) warnungen.push(`Stundenlohn „${lohnText}“ nicht lesbar`);
  const wochenText = zelle(zeile, sp.wochenstunden);
  const wochen = wochenText ? parseZahl(wochenText) : null;
  if (wochenText && wochen === null) warnungen.push(`Wochenstunden „${wochenText}“ nicht lesbar`);
  if (befristetBis === null && befristet === true) warnungen.push("befristet, aber ohne Enddatum – Vertrag wird als unbefristet eingetragen");
  return {
    nr,
    satz: {
      pnr, vorname, nachname, telefon, email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "", plz: /^\d{5}$/.test(plz) ? plz : "", ort: zelle(zeile, sp.ort),
      vertragsartRoh: zelle(zeile, sp.vertragsart), eintritt, austritt, befristetBis, befristet, wochenstunden: wochen, stundenlohn: lohn, statusRoh: zelle(zeile, sp.status),
    },
    fehler: null,
    warnungen,
  };
}

// ─── Abgleich und Änderungen ────────────────────────────────────────────────

export interface PersonalOptionen {
  neuAnlegen: boolean;
  bestehendeAktualisieren: boolean;
  // Austritt in der Vergangenheit → Person als „ausgeschieden“ eintragen
  ausgeschiedeneUebernehmen: boolean;
  // Alle Importierten gleich für Aufträge freigeben (sonst: nach Fragebogen und Bestätigung)
  sofortFreigeben: boolean;
  // Zuordnung von Vertragstexten, die nicht erkannt wurden (Text → Vertragsart oder "keiner")
  vertragZuordnung: Record<string, Vertragsart | "keiner">;
  minijobEur: number;
}

export type Aktion = "neu" | "aktualisieren" | "unveraendert" | "fehler" | "uebersprungen";

export interface ZeilenErgebnis {
  nr: number;
  aktion: Aktion;
  name: string;
  pnr: string;
  meldung: string | null;
  warnungen: string[];
  // Was sich bei einer bestehenden Person ändert (für die Vorschau)
  aenderungen: string[];
  person: Crew | null;
  trefferId: string | null;
}

export interface PersonalErgebnis {
  zeilen: ZeilenErgebnis[];
  unbekannteVertraege: string[];
  zusammenfassung: Record<Aktion, number>;
  // Sensible Spalten, die nicht gelesen werden
  ausgelassen: Array<{ spalte: string; grund: string }>;
  fehlendePflicht: string[];
}

const tmpNr = /^B\d+$/;

function nameKey(v: string, n: string): string {
  return `${v} ${n}`.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function naechsteTmp(belegt: Set<string>): string {
  let max = 0;
  for (const p of belegt) {
    const m = /^B(\d+)$/.exec(p);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `B${String(max + 1).padStart(4, "0")}`;
}

// Mehrere Zeilen derselben Personalnummer (zvoove liefert oft eine Zeile je Vertrag):
// Kontaktdaten aus der ersten nicht leeren, Vertrag aus der aktuellsten Zeile
function verdichte(befunde: Zeilenbefund[], heute: string): Zeilenbefund[] {
  const nachNr = new Map<string, Zeilenbefund[]>();
  const ohneNr: Zeilenbefund[] = [];
  for (const b of befunde) {
    if (!b.satz || !b.satz.pnr) {
      ohneNr.push(b);
      continue;
    }
    nachNr.set(b.satz.pnr, [...(nachNr.get(b.satz.pnr) ?? []), b]);
  }
  const out: Zeilenbefund[] = [];
  for (const gruppe of nachNr.values()) {
    if (gruppe.length === 1) {
      out.push(gruppe[0]);
      continue;
    }
    // Aktuellster Vertrag: der, dessen Beginn am spätesten, aber nicht nach heute liegt; sonst der früheste künftige
    const sortiert = [...gruppe].sort((a, b) => (a.satz?.eintritt ?? "").localeCompare(b.satz?.eintritt ?? ""));
    const gueltige = sortiert.filter((g) => !g.satz?.eintritt || (g.satz.eintritt <= heute));
    const aktuell = gueltige.length > 0 ? gueltige[gueltige.length - 1] : sortiert[0];
    const basis = { ...(aktuell.satz as PersonalSatz) };
    for (const g of gruppe) {
      const s = g.satz as PersonalSatz;
      basis.telefon ||= s.telefon;
      basis.email ||= s.email;
      basis.plz ||= s.plz;
      basis.ort ||= s.ort;
    }
    out.push({ nr: gruppe[0].nr, satz: basis, fehler: null, warnungen: [...new Set([...aktuell.warnungen, `${gruppe.length} Zeilen zur selben Personalnummer – aktueller Vertrag übernommen`])] });
  }
  return [...out, ...ohneNr].sort((a, b) => a.nr - b.nr);
}

function vertragFuer(satz: PersonalSatz, vorher: Contract | null, art: Vertragsart, opt: PersonalOptionen, heute: string): Contract {
  const lohn = satz.stundenlohn ?? vorher?.stundenlohn ?? 0;
  const wochen = satz.wochenstunden ?? (vorher && vorher.vertragsart === art ? vorher.wochenstunden : STANDARD_WOCHENSTUNDEN[art]);
  const bis = satz.befristetBis ?? (satz.austritt ?? null);
  return {
    vertragsart: art,
    wochenstunden: Math.max(0, Math.min(80, wochen)),
    stundenlohn: Math.max(0, Math.min(500, lohn)),
    gueltigVon: satz.eintritt ?? vorher?.gueltigVon ?? heute,
    gueltigBis: bis,
    docusignId: vorher?.docusignId ?? "",
    monatsgrenzeEur: art === "Minijob" ? opt.minijobEur : null,
    monatsgrenzeStd: art === "Minijob" ? (lohn > 0 ? Math.floor(opt.minijobEur / lohn) : (vorher?.monatsgrenzeStd ?? null)) : (vorher?.vertragsart === art ? vorher.monatsgrenzeStd : null),
  };
}

// Vergleich unabhängig von der Reihenfolge der Felder (die Datenbank sortiert JSON-Felder um)
function stabil(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stabil).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x as object).sort().map((k) => `${JSON.stringify(k)}:${stabil((x as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(x) ?? "null";
}
const gleich = (a: unknown, b: unknown) => stabil(a) === stabil(b);

const VERTRAGSFELDER: Array<[keyof Contract, string]> = [["wochenstunden", "Wochenstunden"], ["stundenlohn", "Stundenlohn"], ["gueltigVon", "gültig ab"], ["monatsgrenzeStd", "Monatsgrenze Std"], ["monatsgrenzeEur", "Monatsgrenze €"]];

// Welche Vertragsfelder ändern sich genau? („Wochenstunden 10 → 8“)
function vertragsDiff(alt: Contract | null, neu: Contract): string {
  if (!alt) return "";
  const t = VERTRAGSFELDER.filter(([k]) => !gleich(alt[k], neu[k])).map(([k, label]) => `${label} ${alt[k] ?? "–"} → ${neu[k] ?? "–"}`);
  return t.length > 0 ? ` (${t.join(", ")})` : "";
}

export function planePersonalImport(tabelle: Tabelle, sp: Record<PersonalFeld, number>, bestand: Crew[], opt: PersonalOptionen, heute: string, neueId: () => string): PersonalErgebnis {
  const fehlendePflicht: string[] = [];
  if (sp.vorname < 0 && sp.nachname < 0 && sp.name < 0) fehlendePflicht.push("Name (Vor- und Nachname oder ganzer Name)");
  if (sp.pnr < 0) fehlendePflicht.push("Personalnummer (ohne sie wird nach dem Namen abgeglichen und Neue bekommen eine vorläufige Nummer)");
  const harteFehlend = fehlendePflicht.filter((x) => x.startsWith("Name"));

  const rohe = tabelle.zeilen.map((z, i) => leseSatz(z, sp, i + 1)).filter((b) => b.fehler !== "Leere Zeile");
  const befunde = harteFehlend.length > 0 ? rohe : verdichte(rohe, heute);

  const nachPnr = new Map(bestand.filter((c) => c.pnr).map((c) => [c.pnr.toLowerCase(), c]));
  const nachMail = new Map(bestand.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
  const nachNameTmp = new Map<string, Crew[]>();
  for (const c of bestand) if (tmpNr.test(c.pnr)) nachNameTmp.set(nameKey(c.vorname, c.nachname), [...(nachNameTmp.get(nameKey(c.vorname, c.nachname)) ?? []), c]);
  const belegtePnr = new Set(bestand.map((c) => c.pnr));
  const gesehen = new Set<string>();
  const unbekannt = new Set<string>();

  const zeilen: ZeilenErgebnis[] = [];
  for (const b of befunde) {
    const base: ZeilenErgebnis = { nr: b.nr, aktion: "fehler", name: b.satz ? `${b.satz.vorname} ${b.satz.nachname}` : "", pnr: b.satz?.pnr ?? "", meldung: b.fehler, warnungen: b.warnungen, aenderungen: [], person: null, trefferId: null };
    if (!b.satz) {
      zeilen.push(base);
      continue;
    }
    const s = b.satz;
    // Vertragsart bestimmen
    let art: Vertragsart | null = null;
    let keinVertrag = false;
    if (s.vertragsartRoh) {
      art = erkenneVertragsart(s.vertragsartRoh);
      if (!art) {
        const z = opt.vertragZuordnung[s.vertragsartRoh];
        if (z === "keiner") keinVertrag = true;
        else if (z) art = z;
        else unbekannt.add(s.vertragsartRoh);
      }
    }
    const warn = [...b.warnungen];
    if (s.vertragsartRoh && !art && !keinVertrag) warn.push(`Vertragsart „${s.vertragsartRoh}“ noch nicht zugeordnet – Vertrag wird nicht eingetragen`);

    // Abgleich mit dem Bestand
    let treffer: Crew | undefined = s.pnr ? nachPnr.get(s.pnr.toLowerCase()) : undefined;
    let wieGefunden = treffer ? "Personalnummer" : "";
    if (!treffer && s.email) {
      const t = nachMail.get(s.email.toLowerCase());
      if (t) {
        treffer = t;
        wieGefunden = "E-Mail";
      }
    }
    if (!treffer) {
      const kandidaten = nachNameTmp.get(nameKey(s.vorname, s.nachname)) ?? [];
      if (kandidaten.length === 1) {
        treffer = kandidaten[0];
        wieGefunden = "Name (vorläufige Nummer)";
      }
    }

    const schluessel = (treffer?.id ?? `neu:${s.pnr || `${nameKey(s.vorname, s.nachname)}`}`).toLowerCase();
    if (gesehen.has(schluessel)) {
      zeilen.push({ ...base, aktion: "uebersprungen", meldung: "Person kommt in der Datei mehrfach vor – erste Zeile gilt", warnungen: warn });
      continue;
    }
    gesehen.add(schluessel);

    const ausgeschieden = s.austritt !== null && s.austritt <= heute;
    if (ausgeschieden && !opt.ausgeschiedeneUebernehmen && !treffer) {
      zeilen.push({ ...base, aktion: "uebersprungen", meldung: `Ausgeschieden am ${s.austritt} – nicht importiert`, warnungen: warn });
      continue;
    }
    const inaktiv = /inaktiv|gesperrt|ausgeschieden|nein|passiv|ruhend/i.test(s.statusRoh) && s.statusRoh !== "";

    if (!treffer) {
      if (!opt.neuAnlegen) {
        zeilen.push({ ...base, aktion: "uebersprungen", meldung: "Neu anlegen ist ausgeschaltet", warnungen: warn });
        continue;
      }
      // Personalnummer vergeben (eine importierte gehört nicht schon einer anderen Person)
      let pnr = s.pnr;
      if (pnr && belegtePnr.has(pnr)) {
        zeilen.push({ ...base, aktion: "fehler", meldung: `Personalnummer ${pnr} gehört schon zu ${nachPnr.get(pnr.toLowerCase())?.vorname ?? ""} ${nachPnr.get(pnr.toLowerCase())?.nachname ?? ""}`.trim(), warnungen: warn });
        continue;
      }
      if (!pnr) {
        pnr = naechsteTmp(belegtePnr);
        warn.push(`Keine Personalnummer – vorläufig ${pnr}`);
      }
      belegtePnr.add(pnr);
      const ort = geocodePlz(s.plz);
      const pool: Pool = ort ? naechsterPool(ort).pool : "Stuttgart";
      const status: Crew["status"] = ausgeschieden || inaktiv ? "ausgeschieden" : "aktiv";
      const person: Crew = {
        id: neueId(), pnr, vorname: s.vorname, nachname: s.nachname, telefon: s.telefon, email: s.email, wohnort: s.ort, plz: s.plz, pool, status, xp: 0, einsaetze: 0, arbeitstageJahr: 0,
        profile: null, contract: art ? vertragFuer(s, null, art, opt, heute) : null, unterweisungen: {}, ratings: [], notizen: "",
        importQuelle: { quelle: "zvoove", am: heute },
        ...(opt.sofortFreigeben ? { freigabe: { status: "bestaetigt" as const, am: heute, von: "Import", notiz: "" } } : {}),
      };
      if (!art && !keinVertrag && !s.vertragsartRoh) warn.push("Keine Vertragsart in der Zeile – kein Vertrag eingetragen");
      zeilen.push({ ...base, aktion: "neu", meldung: null, warnungen: warn, person, pnr, aenderungen: [] });
      continue;
    }

    // Bestehende Person aktualisieren
    if (!opt.bestehendeAktualisieren) {
      zeilen.push({ ...base, aktion: "uebersprungen", meldung: `Vorhanden (${wieGefunden}) – Aktualisieren ist ausgeschaltet`, warnungen: warn, trefferId: treffer.id });
      continue;
    }
    const neu: Crew = { ...treffer };
    const aend: string[] = [];
    const setze = <K extends "vorname" | "nachname" | "telefon" | "email" | "plz" | "wohnort" | "pnr">(k: K, v: string, label: string) => {
      if (v && neu[k] !== v) {
        aend.push(`${label}: ${neu[k] || "–"} → ${v}`);
        neu[k] = v as Crew[K];
      }
    };
    if (s.pnr && s.pnr !== treffer.pnr) {
      if (belegtePnr.has(s.pnr) && s.pnr.toLowerCase() !== treffer.pnr.toLowerCase()) {
        zeilen.push({ ...base, aktion: "fehler", meldung: `Personalnummer ${s.pnr} gehört schon einer anderen Person`, warnungen: warn, trefferId: treffer.id });
        continue;
      }
      setze("pnr", s.pnr, "Personalnummer");
      belegtePnr.add(s.pnr);
    }
    setze("vorname", s.vorname, "Vorname");
    setze("nachname", s.nachname, "Nachname");
    setze("telefon", s.telefon, "Handy");
    setze("email", s.email, "E-Mail");
    setze("plz", s.plz, "PLZ");
    setze("wohnort", s.ort, "Wohnort");
    if (s.plz && s.plz !== treffer.plz) {
      const o = geocodePlz(s.plz);
      if (o) neu.pool = naechsterPool(o).pool;
    }
    if (art) {
      const v = vertragFuer(s, treffer.contract, art, opt, heute);
      if (!gleich(v, treffer.contract)) {
        aend.push(`Vertrag: ${treffer.contract ? `${treffer.contract.vertragsart}${treffer.contract.gueltigBis ? ` bis ${treffer.contract.gueltigBis}` : ", unbefristet"}` : "keiner"} → ${v.vertragsart}${v.gueltigBis ? ` bis ${v.gueltigBis}` : ", unbefristet"}${vertragsDiff(treffer.contract, v)}`);
        neu.contract = v;
      }
    }
    // Status: Austritt/inaktiv → ausgeschieden; ein Bewerber mit Vertrag wird Crew; Gesperrte bleiben gesperrt
    let status = neu.status;
    if ((ausgeschieden || inaktiv) && status !== "ausgeschieden") status = "ausgeschieden";
    else if (!ausgeschieden && !inaktiv && status === "Bewerber" && neu.contract) status = "aktiv";
    else if (!ausgeschieden && !inaktiv && status === "ausgeschieden" && s.austritt === null && sp.austritt >= 0) status = "aktiv";
    if (status !== neu.status) {
      aend.push(`Status: ${neu.status} → ${status}`);
      neu.status = status;
    }
    if (opt.sofortFreigeben && treffer.freigabe?.status !== "bestaetigt") {
      neu.freigabe = { status: "bestaetigt", am: heute, von: "Import", notiz: "" };
      aend.push("Freigabe für Aufträge erteilt");
    }
    neu.importQuelle = { quelle: "zvoove", am: heute };
    zeilen.push({ ...base, aktion: aend.length > 0 ? "aktualisieren" : "unveraendert", meldung: `Gefunden über ${wieGefunden}`, warnungen: warn, aenderungen: aend, person: aend.length > 0 ? neu : null, trefferId: treffer.id, pnr: neu.pnr });
  }

  const zusammenfassung: Record<Aktion, number> = { neu: 0, aktualisieren: 0, unveraendert: 0, fehler: 0, uebersprungen: 0 };
  for (const z of zeilen) zusammenfassung[z.aktion]++;
  return { zeilen, unbekannteVertraege: [...unbekannt], zusammenfassung, ausgelassen: sensibleSpalten(tabelle.kopf), fehlendePflicht };
}

// Aus dem Ergebnis den neuen Crew-Bestand bilden (nur Zeilen mit Person)
export function uebernehmePersonal(bestand: Crew[], ergebnis: PersonalErgebnis): { crew: Crew[]; neu: number; aktualisiert: number } {
  const aktualisiert = new Map<string, Crew>();
  const neuePersonen: Crew[] = [];
  for (const z of ergebnis.zeilen) {
    if (!z.person) continue;
    if (z.aktion === "aktualisieren" && z.trefferId) aktualisiert.set(z.trefferId, z.person);
    else if (z.aktion === "neu") neuePersonen.push(z.person);
  }
  return { crew: [...bestand.map((c) => aktualisiert.get(c.id) ?? c), ...neuePersonen], neu: neuePersonen.length, aktualisiert: aktualisiert.size };
}
