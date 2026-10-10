// Auftrags-Import aus einer Tabelle (z. B. der Regio-Planungstabelle): Jede Zeile ist eine Schicht,
// Zeilen desselben Auftrags werden zusammengefasst. Ein erneuter Import mit derselben Tabelle
// aktualisiert die vorhandenen Aufträge statt sie doppelt anzulegen; nichts wird gelöscht.
import type { Job, Schicht, Taetigkeit } from "@/preview/logic/types";
import type { VergangenerAuftrag } from "@/preview/data/demo";
import { erkenneSpalten, normalisiereKopf, parseDatum, parseJaNein, parseUhrzeit, parseZahl, parseZeitraum, umlautFrei, zelle, type FeldDef, type Tabelle } from "./tabelle";

export type AuftragFeld =
  | "auftragsnr" | "kunde" | "titel" | "ort" | "plz" | "datum" | "datumBis" | "start" | "ende" | "zeit" | "bedarf" | "taetigkeit" | "bezeichnung"
  | "treffpunkt" | "ansprechpartner" | "beschreibung" | "dresscode" | "verpflegung" | "parken" | "hoehe" | "mitbringen";

export const AUFTRAG_FELDER: Array<{ feld: AuftragFeld; label: string; hinweis?: string }> = [
  { feld: "datum", label: "Datum", hinweis: "Pflicht: eine Zeile je Schicht und Tag." },
  { feld: "kunde", label: "Kunde / Auftraggeber" },
  { feld: "titel", label: "Veranstaltung / Auftrag" },
  { feld: "ort", label: "Einsatzort" },
  { feld: "plz", label: "PLZ des Einsatzorts", hinweis: "Für die Fahrzeit zur Crew." },
  { feld: "start", label: "Beginn (Uhrzeit)" },
  { feld: "ende", label: "Ende (Uhrzeit)" },
  { feld: "zeit", label: "Zeitraum (z. B. 08:00-16:00)", hinweis: "Statt Beginn und Ende, wenn beides in einer Spalte steht." },
  { feld: "bedarf", label: "Anzahl Personen" },
  { feld: "taetigkeit", label: "Tätigkeit" },
  { feld: "bezeichnung", label: "Schichtbezeichnung" },
  { feld: "auftragsnr", label: "Auftragsnummer", hinweis: "Wenn vorhanden: macht den erneuten Import sicher (gleiche Nummer = gleicher Auftrag)." },
  { feld: "datumBis", label: "Datum bis (mehrtägig)" },
  { feld: "treffpunkt", label: "Treffpunkt" },
  { feld: "ansprechpartner", label: "Ansprechpartner vor Ort" },
  { feld: "beschreibung", label: "Beschreibung / Bemerkung" },
  { feld: "dresscode", label: "Dresscode" },
  { feld: "mitbringen", label: "Mitbringen (PSA)" },
  { feld: "verpflegung", label: "Verpflegung" },
  { feld: "parken", label: "Parken" },
  { feld: "hoehe", label: "Arbeiten in der Höhe (ja/nein)" },
];

const DEFS: Array<FeldDef<AuftragFeld>> = [
  { feld: "auftragsnr", muster: /^(auftragsnummer|auftragsnr|auftragnr|auftragsid|einsatznummer|einsatznr|projektnummer|projektnr|vorgangsnummer|vorgang|referenz|referenznummer|auftragnummer)$/ },
  { feld: "kunde", muster: /^(kunde|kundenname|auftraggeber|firma|veranstalter|entleiher|kundeauftraggeber|unternehmen)$/ },
  { feld: "titel", muster: /^(veranstaltung|event|auftrag|auftragsname|auftragsbezeichnung|projekt|projektname|titel|einsatz|messe|veranstaltungsname|eventname|bezeichnungauftrag|bezeichnung|name)$/ },
  { feld: "ort", muster: /^(ort|einsatzort|location|veranstaltungsort|standort|stadt|eventort|ortlocation)$/ },
  { feld: "plz", muster: /^(plz|postleitzahl|plzort|plzeinsatzort)$/ },
  { feld: "datumBis", muster: /^(datumbis|bisdatum|enddatum|endedatum|datumende|letzterTag|bistag)$/i },
  { feld: "datum", muster: /^(datum|einsatzdatum|termin|tag|datumvon|vondatum|beginndatum|einsatztag|veranstaltungsdatum|startdatum)$/ },
  { feld: "start", muster: /^(beginn|start|startzeit|uhrzeitvon|vonuhrzeit|callzeit|call|beginnzeit|anfang|uhrzeitbeginn|beginnuhrzeit|schichtbeginn|startuhrzeit|ab)$/ },
  { feld: "ende", muster: /^(ende|endzeit|uhrzeitbis|bisuhrzeit|schluss|endeuhrzeit|uhrzeitende|schichtende|enduhrzeit|endeschicht)$/ },
  { feld: "zeit", muster: /^(zeit|uhrzeit|zeitraum|arbeitszeit|einsatzzeit|schichtzeit|zeiten|uhrzeiten)$/ },
  { feld: "bedarf", muster: /^(anzahl|bedarf|personen|mitarbeiter|ma|personal|anzahlma|anzahlmitarbeiter|personalbedarf|pax|anzahlpersonen|mitarbeiteranzahl|besetzung|kopfzahl|personenanzahl|soll)$/ },
  { feld: "taetigkeit", muster: /^(taetigkeit|einsatzart|position|rolle|funktion|job|qualifikation|aufgabe|art|tatigkeit|einsatzbereich|bereich)$/ },
  { feld: "bezeichnung", muster: /^(schicht|schichtbezeichnung|schichtname|schichtart|gruppe)$/ },
  { feld: "treffpunkt", muster: /^(treffpunkt|treffen|sammelpunkt|meetingpoint|treffortzeit|treffort)$/ },
  { feld: "ansprechpartner", muster: /^(ansprechpartner|ansprechpartnervorort|kontakt|vorortkontakt|kontaktperson|verantwortlich|teamleiter|ansprechperson)$/ },
  { feld: "beschreibung", muster: /^(beschreibung|bemerkung|bemerkungen|hinweise|hinweis|info|infos|notiz|notizen|anmerkung|anmerkungen|kommentar|details)$/ },
  { feld: "dresscode", muster: /^(dresscode|kleidung|bekleidung|dress)$/ },
  { feld: "mitbringen", muster: /^(mitbringen|psa|ausruestung|mitzubringen|equipment)$/ },
  { feld: "verpflegung", muster: /^(verpflegung|catering|essen|verpflegungsangabe)$/ },
  { feld: "parken", muster: /^(parken|parkplatz|anreise|parkmoeglichkeit)$/ },
  { feld: "hoehe", muster: /^(hoehe|arbeitenhoehe|arbeitenindeerhoehe|leiter|absturz|arbeiteninderhoehe)$/ },
];

export function kopfAuftraege(): RegExp[] {
  return DEFS.map((d) => d.muster);
}

// „von“ und „bis“ heißen manchmal Datum, manchmal Uhrzeit: an den Werten entscheiden
export function erkenneAuftragSpalten(t: Tabelle): Record<AuftragFeld, number> {
  const sp = erkenneSpalten(t.kopf, DEFS);
  const stichprobe = (i: number) => t.zeilen.slice(0, 30).map((z) => zelle(z, i)).filter(Boolean);
  const meist = (i: number, fn: (x: string) => unknown) => {
    const s = stichprobe(i);
    return s.length > 0 && s.filter((x) => fn(x) !== null).length / s.length >= 0.6;
  };
  const vergeben = new Set(Object.values(sp).filter((i) => i >= 0));
  const freie = (re: RegExp) => t.kopf.findIndex((h, i) => !vergeben.has(i) && re.test(normalisiereKopf(h)));
  const von = freie(/^(von|vonbis|vonuhr)$/);
  if (von >= 0) {
    if (meist(von, parseDatum) && sp.datum < 0) sp.datum = von;
    else if (meist(von, parseUhrzeit) && sp.start < 0) sp.start = von;
    if (sp.datum === von || sp.start === von) vergeben.add(von);
  }
  const bis = freie(/^(bis|bisuhr)$/);
  if (bis >= 0) {
    if (meist(bis, parseDatum) && sp.datumBis < 0) sp.datumBis = bis;
    else if (meist(bis, parseUhrzeit) && sp.ende < 0) sp.ende = bis;
  }
  // Falls „Datum“ gar keine Daten enthält (z. B. Wochentag-Spalte): die erste Spalte mit Daten nehmen
  if (sp.datum >= 0 && !meist(sp.datum, parseDatum)) {
    const alt = t.kopf.findIndex((_, i) => i !== sp.datum && meist(i, parseDatum) && i !== sp.datumBis);
    if (alt >= 0) sp.datum = alt;
  } else if (sp.datum < 0) {
    const alt = t.kopf.findIndex((_, i) => i !== sp.datumBis && meist(i, parseDatum));
    if (alt >= 0) sp.datum = alt;
  }
  return sp;
}

// ─── Tätigkeit ──────────────────────────────────────────────────────────────

export function erkenneTaetigkeit(roh: string): Taetigkeit | null {
  const t = umlautFrei(roh);
  if (!t.trim()) return null;
  if (/stapler|flurfoerder|gabelstapler/.test(t)) return "Stapler";
  if (/messebau|messe-?bau|standbau|messe\s*auf/.test(t)) return "Messebau";
  if (/einlass|ticket|ordner|garderobe|akkreditier|check-?in|empfang|host\b|hostess|security/.test(t)) return "Einlass";
  if (/\bbar\b|barkeeper|barista|theke|ausschank|getraenke|bartender/.test(t)) return "Bar";
  if (/catering|service|gastro|kellner|koch|kuech|buffet|spuel|runner|bedienung/.test(t)) return "Catering";
  if (/promo|flyer|sampling|brand|hostessen/.test(t)) return "Promotion";
  if (/logistik|lager|fahrer|transport|kommissionier|umzug|laden|verlade/.test(t)) return "Logistik";
  if (/stage|aufbau|abbau|buehne|rigging|technik|crew|helfer|licht|ton\b|auf-?\s*und\s*abbau/.test(t)) return "Stagehand";
  return null;
}

// ─── Plan ───────────────────────────────────────────────────────────────────

export interface AuftragOptionen {
  // Neue Aufträge gleich für die Crew sichtbar (Status „offen“) statt als Entwurf
  sofortVeroeffentlichen: boolean;
  // Wenn die Tätigkeit nicht erkannt wird
  standardTaetigkeit: Taetigkeit;
}

export interface ImportSchicht {
  nr: number;
  datum: string;
  start: string;
  ende: string;
  bedarf: number;
  taetigkeit: Taetigkeit;
  bezeichnung: string;
}

export interface AuftragPlan {
  key: string;
  aktion: "neu" | "aktualisieren" | "unveraendert";
  job: Job;
  alt: Job | null;
  schichtenNeu: number;
  schichtenGeaendert: number;
  schichtenUnveraendert: number;
  schichtenNichtInTabelle: number;
  warnungen: string[];
  aenderungen: string[];
  zeilen: number[];
}

export interface AuftragErgebnis {
  plaene: AuftragPlan[];
  fehler: Array<{ nr: number; meldung: string }>;
  zusammenfassung: { neu: number; aktualisieren: number; unveraendert: number; fehler: number; schichten: number };
  fehlendePflicht: string[];
}

const norm = (x: string) => umlautFrei(x).replace(/\s+/g, " ").trim();

// Kurzer, stabiler Hash (FNV-1a) für Auftragsnummern ohne eigene Nummer
export function kurzHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function tageZwischen(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
}

function addTage(d: string, n: number): string {
  const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function sicheresId(nr: string): string {
  return nr.replace(/[^\p{L}\p{N}._ /-]/gu, "").trim().slice(0, 80);
}

interface RohZeile {
  nr: number;
  kunde: string;
  titel: string;
  ort: string;
  plz: string;
  nummer: string;
  schicht: ImportSchicht;
  extras: Partial<Record<"treffpunkt" | "ansprechpartner" | "beschreibung" | "dresscode" | "verpflegung" | "parken" | "mitbringen", string>>;
  hoehe: boolean | null;
  datumBis: string | null;
  warnungen: string[];
}

export function planeAuftragImport(t: Tabelle, sp: Record<AuftragFeld, number>, bestand: Job[], opt: AuftragOptionen): AuftragErgebnis {
  const fehlendePflicht: string[] = [];
  if (sp.datum < 0) fehlendePflicht.push("Datum");
  if (sp.kunde < 0 && sp.titel < 0) fehlendePflicht.push("Kunde oder Veranstaltung");
  const fehler: Array<{ nr: number; meldung: string }> = [];
  const roh: RohZeile[] = [];
  if (fehlendePflicht.length === 0) {
    t.zeilen.forEach((z, i) => {
      const nr = i + 1;
      if (z.every((c) => c.trim() === "")) return;
      const w: string[] = [];
      const datumText = zelle(z, sp.datum);
      const datum = parseDatum(datumText);
      if (!datum) {
        // Zwischenüberschriften und Summenzeilen sind in Planungstabellen üblich: nur melden, wenn sonst etwas drinsteht
        if (z.filter((c) => c.trim()).length >= 3) fehler.push({ nr, meldung: datumText ? `Datum „${datumText}“ nicht lesbar` : "Datum fehlt" });
        return;
      }
      let start = parseUhrzeit(zelle(z, sp.start)) ?? "";
      let ende = parseUhrzeit(zelle(z, sp.ende)) ?? "";
      const zr = zelle(z, sp.zeit);
      if ((!start || !ende) && zr) {
        const p = parseZeitraum(zr);
        if (p) [start, ende] = p;
        else if (!start) start = parseUhrzeit(zr) ?? "";
      }
      if (!start || !ende) {
        w.push("Uhrzeit fehlt – 08:00–16:00 eingesetzt, bitte prüfen");
        start ||= "08:00";
        ende ||= "16:00";
      }
      const bedarfText = zelle(z, sp.bedarf);
      let bedarf = 1;
      if (bedarfText) {
        const m = /\d+/.exec(bedarfText);
        const zahl = m ? Number(m[0]) : parseZahl(bedarfText);
        if (zahl !== null && Number.isFinite(zahl) && zahl >= 0) bedarf = Math.min(1000, Math.round(zahl));
        else w.push(`Anzahl „${bedarfText}“ nicht lesbar – 1 eingesetzt`);
      } else w.push("Anzahl fehlt – 1 eingesetzt");
      const tText = zelle(z, sp.taetigkeit);
      let taetigkeit = erkenneTaetigkeit(tText) ?? erkenneTaetigkeit(zelle(z, sp.bezeichnung)) ?? erkenneTaetigkeit(zelle(z, sp.titel));
      if (!taetigkeit) {
        taetigkeit = opt.standardTaetigkeit;
        w.push(tText ? `Tätigkeit „${tText}“ nicht erkannt – ${opt.standardTaetigkeit} eingesetzt` : `Keine Tätigkeit – ${opt.standardTaetigkeit} eingesetzt`);
      }
      const kunde = zelle(z, sp.kunde);
      const titel = zelle(z, sp.titel) || kunde;
      const ort = zelle(z, sp.ort);
      if (!kunde && !titel) {
        fehler.push({ nr, meldung: "Weder Kunde noch Veranstaltung angegeben" });
        return;
      }
      const plzRoh = zelle(z, sp.plz).replace(/\.0+$/, "");
      const plz = /^\d{4}$/.test(plzRoh) ? `0${plzRoh}` : plzRoh;
      if (plz && !/^\d{5}$/.test(plz)) w.push(`PLZ „${plzRoh}“ ungültig`);
      const bis = parseDatum(zelle(z, sp.datumBis));
      const extra = (f: keyof RohZeile["extras"]) => zelle(z, sp[f]);
      const hoeheText = zelle(z, sp.hoehe);
      roh.push({
        nr, kunde: kunde || titel, titel, ort, plz: /^\d{5}$/.test(plz) ? plz : "", nummer: sicheresId(zelle(z, sp.auftragsnr)),
        schicht: { nr, datum, start, ende, bedarf, taetigkeit, bezeichnung: zelle(z, sp.bezeichnung) },
        extras: { treffpunkt: extra("treffpunkt"), ansprechpartner: extra("ansprechpartner"), beschreibung: extra("beschreibung"), dresscode: extra("dresscode"), verpflegung: extra("verpflegung"), parken: extra("parken"), mitbringen: extra("mitbringen") },
        hoehe: hoeheText ? parseJaNein(hoeheText) : null, datumBis: bis && bis >= datum ? bis : null, warnungen: w,
      });
    });
  }

  // Gruppieren: gleiche Auftragsnummer, sonst gleicher Kunde/Titel/Ort in zusammenhängenden Tagen
  const gruppen = new Map<string, RohZeile[]>();
  const nachBasis = new Map<string, RohZeile[]>();
  for (const r of roh) {
    if (r.nummer) {
      gruppen.set(`nr:${r.nummer.toLowerCase()}`, [...(gruppen.get(`nr:${r.nummer.toLowerCase()}`) ?? []), r]);
    } else {
      const basis = `${norm(r.kunde)}|${norm(r.titel)}|${norm(r.ort)}`;
      nachBasis.set(basis, [...(nachBasis.get(basis) ?? []), r]);
    }
  }
  for (const [basis, zeilen] of nachBasis) {
    const sortiert = [...zeilen].sort((a, b) => a.schicht.datum.localeCompare(b.schicht.datum) || a.nr - b.nr);
    let start = sortiert[0].schicht.datum;
    let letzter = start;
    for (const r of sortiert) {
      if (tageZwischen(letzter, r.schicht.datum) > 3) start = r.schicht.datum;
      letzter = r.schicht.datum > letzter ? r.schicht.datum : letzter;
      const k = `${basis}|${start}`;
      gruppen.set(k, [...(gruppen.get(k) ?? []), r]);
    }
  }

  const plaene: AuftragPlan[] = [];
  const belegt = new Set(bestand.map((j) => j.id));
  for (const [key, zeilen] of gruppen) {
    const erste = zeilen[0];
    const nummer = erste.nummer;
    const importKey = nummer ? `nr:${nummer.toLowerCase()}` : `h:${kurzHash(key)}`;
    const id = nummer || `IMP-${kurzHash(key).toUpperCase()}`;
    const alt = bestand.find((j) => j.id === id) ?? bestand.find((j) => j.importKey === importKey) ?? null;
    const warn = [...new Set(zeilen.flatMap((z) => z.warnungen))];
    const wert = (f: keyof RohZeile["extras"]) => zeilen.map((z) => z.extras[f] ?? "").find((x) => x) ?? "";
    const aend: string[] = [];

    // Schichten: vorhandene werden über Datum, Tätigkeit, Bezeichnung und Beginn erkannt
    const schichten: Schicht[] = alt ? alt.schichten.map((s) => ({ ...s })) : [];
    const belegtS = new Set(schichten.map((s) => s.id));
    let nn = 0;
    const naechsteS = () => {
      do nn++;
      while (belegtS.has(`${alt?.id ?? id}-s${nn}`));
      belegtS.add(`${alt?.id ?? id}-s${nn}`);
      return `${alt?.id ?? id}-s${nn}`;
    };
    const sk = (s: { datum: string; taetigkeit: string; bezeichnung: string; start: string }) => `${s.datum}|${s.taetigkeit}|${norm(s.bezeichnung)}|${s.start}`;
    const vorhandene = new Map(schichten.map((s) => [sk(s), s]));
    const alteIds = new Set(schichten.map((x) => x.id));
    const verwendet = new Set<string>();
    let neuS = 0, geaendert = 0, unveraendert = 0;
    const sortiertZ = [...zeilen].sort((a, b) => a.schicht.datum.localeCompare(b.schicht.datum) || a.schicht.start.localeCompare(b.schicht.start) || a.nr - b.nr);
    // Ohne Schichtbezeichnung heißt die Schicht wie ihre Tätigkeit (bei mehreren gleichen am selben Tag/Beginn durchnummeriert) –
    // so bleibt der Name und damit die Zuordnung stabil, auch wenn sich andere Zeilen der Tabelle ändern.
    const zaehlerGleich = new Map<string, number>();
    sortiertZ.forEach((z) => {
      const sch = z.schicht;
      const kk = `${sch.datum}|${sch.start}|${sch.taetigkeit}`;
      const n = (zaehlerGleich.get(kk) ?? 0) + 1;
      zaehlerGleich.set(kk, n);
      const bez = sch.bezeichnung || (n === 1 ? sch.taetigkeit : `${sch.taetigkeit} ${n}`);
      const k = sk({ ...sch, bezeichnung: bez });
      let v = vorhandene.get(k);
      if (v && verwendet.has(v.id)) v = undefined;
      // Hat die Tabelle keine Schichtbezeichnung, zählt der Name der vorhandenen Schicht nicht (Datum, Tätigkeit und Beginn genügen)
      if (!v && !sch.bezeichnung) v = schichten.find((x) => !verwendet.has(x.id) && alteIds.has(x.id) && x.datum === sch.datum && x.taetigkeit === sch.taetigkeit && x.start === sch.start);
      if (v) {
        verwendet.add(v.id);
        const name = sch.bezeichnung ? bez : v.bezeichnung;
        if (v.ende !== sch.ende || v.bedarf !== sch.bedarf || v.bezeichnung !== name) {
          const neu = schichten.findIndex((x) => x.id === v!.id);
          schichten[neu] = { ...v, ende: sch.ende, bedarf: sch.bedarf, bezeichnung: name };
          geaendert++;
        } else unveraendert++;
      } else {
        schichten.push({ id: naechsteS(), bezeichnung: bez, datum: sch.datum, start: sch.start, ende: sch.ende, taetigkeit: sch.taetigkeit, bedarf: sch.bedarf });
        neuS++;
      }
    });
    const nichtInTabelle = alt ? alt.schichten.filter((s) => !verwendet.has(s.id)).length : 0;
    schichten.sort((a, b) => a.datum.localeCompare(b.datum) || a.start.localeCompare(b.start));
    const daten = [...schichten.map((s) => s.datum), ...zeilen.map((z) => z.datumBis ?? z.schicht.datum)].sort();
    const datumVon = daten[0];
    const datumBis = daten[daten.length - 1];

    let job: Job;
    if (alt) {
      const setz = <K extends "kunde" | "titel" | "ort" | "plz" | "treffpunkt" | "ansprechpartner" | "beschreibung" | "dresscode" | "verpflegung" | "parken">(k: K, v: string) => {
        if (v && alt[k] !== v) {
          aend.push(`${k}: ${String(alt[k] || "–").slice(0, 40)} → ${v.slice(0, 40)}`);
          return v;
        }
        return alt[k];
      };
      const hoeheWert = zeilen.map((z) => z.hoehe).find((h) => h !== null) ?? null;
      const psaListe = wert("mitbringen") ? wert("mitbringen").split(/[,;/]/).map((x) => x.trim()).filter(Boolean) : alt.psa;
      job = {
        ...alt,
        kunde: setz("kunde", erste.kunde), titel: setz("titel", erste.titel), ort: setz("ort", erste.ort), plz: setz("plz", erste.plz),
        treffpunkt: setz("treffpunkt", wert("treffpunkt")), ansprechpartner: setz("ansprechpartner", wert("ansprechpartner")), beschreibung: setz("beschreibung", wert("beschreibung")),
        dresscode: setz("dresscode", wert("dresscode")), verpflegung: setz("verpflegung", wert("verpflegung")), parken: setz("parken", wert("parken")),
        psa: psaListe, hoehe: hoeheWert ?? alt.hoehe, schichten, datumVon, datumBis, importKey: alt.importKey ?? importKey,
      };
      if (hoeheWert !== null && hoeheWert !== alt.hoehe) aend.push(`Höhe: ${alt.hoehe ? "ja" : "nein"} → ${hoeheWert ? "ja" : "nein"}`);
      if (datumVon !== alt.datumVon || datumBis !== alt.datumBis) aend.push(`Zeitraum: ${alt.datumVon}–${alt.datumBis} → ${datumVon}–${datumBis}`);
    } else {
      let neueId = id;
      let n = 1;
      while (belegt.has(neueId)) neueId = `${id}-${++n}`;
      belegt.add(neueId);
      const ohneZeit = zeilen.some((z) => z.warnungen.some((x) => x.startsWith("Uhrzeit fehlt")));
      // Schicht-IDs trugen den vorläufigen Namen; bei geänderter Auftrags-ID nachziehen
      const ids = schichten.map((s, i) => ({ ...s, id: `${neueId}-s${i + 1}` }));
      job = {
        id: neueId, kunde: erste.kunde, titel: erste.titel, ort: erste.ort, plz: erste.plz, datumVon, datumBis, schichten: ids, beschreibung: wert("beschreibung"),
        dresscode: wert("dresscode") || "Arbeitskleidung, wetterfest", psa: wert("mitbringen") ? wert("mitbringen").split(/[,;/]/).map((x) => x.trim()).filter(Boolean) : [],
        hoehe: zeilen.map((z) => z.hoehe).find((h) => h !== null) ?? false, verpflegung: wert("verpflegung"), parken: wert("parken"), treffpunkt: wert("treffpunkt"),
        ansprechpartner: wert("ansprechpartner") || "Wird nach der Bestätigung freigeschaltet",
        ablauf: ["Ankommen und Einweisung durch den Teamleiter", "Sicherheitsunterweisung vor Ort durch den Entleiher", "Pausen nach Absprache, Zettel am Ende der Schicht"],
        status: opt.sofortVeroeffentlichen && !ohneZeit ? "offen" : "Entwurf", quelle: "Planung Regios", importKey,
      };
      if (opt.sofortVeroeffentlichen && ohneZeit) warn.push("Nicht veröffentlicht, weil Uhrzeiten fehlen – bleibt Entwurf");
      if (!job.plz) warn.push("PLZ fehlt – Fahrzeit zur Crew lässt sich nicht berechnen");
    }
    if (alt && !job.plz) warn.push("PLZ fehlt – Fahrzeit zur Crew lässt sich nicht berechnen");
    const aktion: AuftragPlan["aktion"] = !alt ? "neu" : neuS > 0 || geaendert > 0 || aend.length > 0 ? "aktualisieren" : "unveraendert";
    plaene.push({ key, aktion, job, alt, schichtenNeu: neuS, schichtenGeaendert: geaendert, schichtenUnveraendert: unveraendert, schichtenNichtInTabelle: nichtInTabelle, warnungen: warn, aenderungen: aend, zeilen: zeilen.map((z) => z.nr) });
  }
  plaene.sort((a, b) => a.job.datumVon.localeCompare(b.job.datumVon) || a.job.titel.localeCompare(b.job.titel));
  const zus = { neu: 0, aktualisieren: 0, unveraendert: 0, fehler: fehler.length, schichten: roh.length };
  for (const p of plaene) zus[p.aktion]++;
  return { plaene, fehler, zusammenfassung: zus, fehlendePflicht };
}

export function uebernehmeAuftraege(jobs: Job[], auftraege: VergangenerAuftrag[], ergebnis: AuftragErgebnis): { jobs: Job[]; auftraege: VergangenerAuftrag[]; neu: number; aktualisiert: number } {
  const nachId = new Map(jobs.map((j) => [j.id, j]));
  const neueAuftraege: VergangenerAuftrag[] = [];
  const bekannteAuftraege = new Set(auftraege.map((a) => a.id));
  let neu = 0;
  let aktualisiert = 0;
  const hinzu: Job[] = [];
  for (const p of ergebnis.plaene) {
    if (p.aktion === "unveraendert") continue;
    if (p.aktion === "neu") {
      hinzu.push(p.job);
      neu++;
      if (!bekannteAuftraege.has(p.job.id)) neueAuftraege.push({ id: p.job.id, kunde: p.job.kunde, titel: p.job.titel, taetigkeit: p.job.schichten[0]?.taetigkeit ?? "Stagehand" });
    } else {
      nachId.set(p.job.id, p.job);
      aktualisiert++;
    }
  }
  return { jobs: [...jobs.map((j) => nachId.get(j.id) ?? j), ...hinzu], auftraege: [...auftraege, ...neueAuftraege], neu, aktualisiert };
}
