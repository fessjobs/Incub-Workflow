import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { bereinigeNummer, dekodiere, erkenneTrenner, findeKopfzeile, parseDatum, parseJaNein, parseText, parseUhrzeit, parseZahl, parseZeitraum, parseZeilen, tabelleAusRohdaten, teileName } from "@/lib/neu/import/tabelle";
import { erkennePersonalSpalten, erkenneVertragsart, kopfPersonal, planePersonalImport, sensibleSpalten, uebernehmePersonal, type PersonalOptionen } from "@/lib/neu/import/personal";
import { erkenneAuftragSpalten, erkenneTaetigkeit, kopfAuftraege, planeAuftragImport, uebernehmeAuftraege } from "@/lib/neu/import/auftraege";
import { freigabeStand } from "@/preview/logic/freigabe";
import { bereinigeSchulung, fehlendeModule, pflichtModule, standardSchulung } from "@/preview/logic/unterweisung";
import { bedarf, csv, groesseFuer, offenesPfand, sortiereGroessen } from "@/preview/logic/kleidung";
import { bereinigeKleidung, standardKleidung } from "@/preview/logic/einstellungen-neu";
import { kleidungFehler, leereAntworten, antwortenZuProfil } from "@/preview/logic/profil";
import { videoEinbettung } from "@/preview/logic/video";
import { brauchtLink, fuelleVorlage, waLink, waNummer } from "@/preview/logic/nachricht";
import { darfAktion, darfLesen, darfSchreiben, darfSeite } from "@/lib/neu/rollen";
import { KIND_SCHEMA } from "@/lib/neu/schemas";
import { auftragFeedSchema, baueAuftragFeed, schnittstelleStatus, schnittstelleUmgebungAn, stundenRueckmeldungSchema, stundenZeilenAusRueckmeldung } from "@/lib/neu/schnittstelle";
import { baueDemo } from "@/preview/data/demo";
import type { Crew, Job } from "@/preview/logic/types";
import { drehbuch } from "@/preview/pages/admin-schulung-regeln";
import { BEREICHE, sicherungsAnfrage } from "@/lib/neu/sicherung-bereiche";
import { eindeutigerPfad, letzterVollerMonat, monatsGrenzen, monatsName, sicherDateiname } from "@/lib/neu/sicherung";
import { leseAnfrage } from "@/app/api/neu/sicherung/anfrage";

const HEUTE = "2026-10-10";
const crewBasis = (p: Partial<Crew>): Crew => ({ id: "c-1", pnr: "1001", vorname: "Anna", nachname: "Beispiel", telefon: "", email: "", wohnort: "", plz: "", pool: "Stuttgart", status: "aktiv", xp: 0, einsaetze: 0, arbeitstageJahr: 0, profile: null, contract: null, unterweisungen: {}, ratings: [], notizen: "", ...p });
const OPT: PersonalOptionen = { neuAnlegen: true, bestehendeAktualisieren: true, ausgeschiedeneUebernehmen: true, sofortFreigeben: false, vertragZuordnung: {}, minijobEur: 603 };
let zaehler = 0;
const id = () => `neu-${++zaehler}`;
const tab = (text: string) => { const r = parseText(text); const k = findeKopfzeile(r, kopfPersonal()); return tabelleAusRohdaten(r, k); };

describe("Tabellen lesen", () => {
  it("CSV mit Semikolon, Anführungszeichen und Zeilenumbruch in der Zelle", () => {
    const z = parseZeilen('Name;Bemerkung\n"Müller; Max";"zwei\nZeilen"\nA;B', ";");
    expect(z).toEqual([["Name", "Bemerkung"], ["Müller; Max", "zwei\nZeilen"], ["A", "B"]]);
  });
  it("erkennt Tabulator (aus Excel kopiert), Semikolon und Komma", () => {
    expect(erkenneTrenner("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(erkenneTrenner("a;b;c\n1;2;3")).toBe(";");
    expect(erkenneTrenner("a,b,c\n1,2,3")).toBe(",");
  });
  it("Zeichensatz: UTF-8 mit und ohne BOM, sonst Windows-1252", () => {
    expect(dekodiere(new TextEncoder().encode("Größe"))).toBe("Größe");
    expect(dekodiere(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("A");
    expect(dekodiere(new Uint8Array([0x47, 0x72, 0xf6, 0xdf, 0x65]))).toBe("Größe");
  });
  it("findet die Überschriftenzeile unter Titelzeilen", () => {
    const rows = [["Planung Oktober"], [""], ["Datum", "Kunde", "Ort", "Beginn"], ["01.10.2026", "X", "Y", "08:00"]];
    expect(findeKopfzeile(rows, kopfAuftraege())).toBe(2);
  });
  it("Datum: deutsche und ISO-Formen, Excel-Zahl, ungültige Tage", () => {
    expect(parseDatum("31.12.2026")).toBe("2026-12-31");
    expect(parseDatum("1.3.26")).toBe("2026-03-01");
    expect(parseDatum("2026-02-28")).toBe("2026-02-28");
    expect(parseDatum("Fr, 02.10.2026")).toBe("2026-10-02");
    expect(parseDatum("46296")).toBe("2026-10-01");
    expect(parseDatum("31.02.2026")).toBeNull();
    expect(parseDatum("29.02.2028")).toBe("2028-02-29");
    expect(parseDatum("irgendwas")).toBeNull();
  });
  it("Uhrzeit und Zeitraum", () => {
    expect(parseUhrzeit("8")).toBe("08:00");
    expect(parseUhrzeit("8:30 Uhr")).toBe("08:30");
    expect(parseUhrzeit("0730")).toBe("07:30");
    expect(parseUhrzeit("7.30")).toBe("07:30");
    expect(parseUhrzeit("0,5")).toBe("12:00");
    expect(parseUhrzeit("25:00")).toBeNull();
    expect(parseZeitraum("08:00-16:30")).toEqual(["08:00", "16:30"]);
    expect(parseZeitraum("8 bis 16 Uhr")).toEqual(["08:00", "16:00"]);
    expect(parseZeitraum("nach Absprache")).toBeNull();
  });
  it("Zahlen, Ja/Nein, Namen", () => {
    expect(parseZahl("13,90 €")).toBe(13.9);
    expect(parseZahl("1.234,56")).toBe(1234.56);
    expect(parseZahl("13.9")).toBe(13.9);
    expect(parseZahl("viel")).toBeNull();
    expect(parseJaNein("Ja")).toBe(true);
    expect(parseJaNein("nein")).toBe(false);
    expect(parseJaNein("vielleicht")).toBeNull();
    expect(bereinigeNummer("1234.0")).toBe("1234");
    expect(teileName("Mustermann, Max")).toEqual({ vorname: "Max", nachname: "Mustermann" });
    expect(teileName("Max Peter Mustermann")).toEqual({ vorname: "Max Peter", nachname: "Mustermann" });
  });
});

describe("Personal-Import (zvoove)", () => {
  const zvoove = [
    "Personalnummer;Nachname;Vorname;Geburtsdatum;IBAN;Straße;PLZ;Ort;Mobil;E-Mail;Beschäftigungsart;Eintritt;Befristet bis;Stundenlohn;Austritt",
    "1001;Muster;Max;01.01.1990;DE001;Weg 1;70173;Stuttgart;0151 1234567;max@example.de;Geringfügig Beschäftigter;01.03.2026;31.12.2026;13,90;",
    "1002;Beispiel;Eva;02.02.1992;DE002;Weg 2;68159;Mannheim;0160 7654321;;Kurzfristig Beschäftigter;15.09.2026;;14,50;",
    "1003;Alt;Karl;03.03.1980;DE003;Weg 3;60311;Frankfurt;;;Teilzeit;01.01.2020;;16,00;30.06.2026",
  ].join("\n");

  it("erkennt die Spalten und lässt sensible Spalten aus", () => {
    const t = tab(zvoove);
    const sp = erkennePersonalSpalten(t.kopf);
    expect(sp.pnr).toBe(0);
    expect(sp.nachname).toBe(1);
    expect(sp.vorname).toBe(2);
    expect(sp.telefon).toBe(8);
    expect(sp.vertragsart).toBe(10);
    expect(sp.befristetBis).toBe(12);
    const grund = sensibleSpalten(t.kopf).map((x) => x.spalte);
    expect(grund).toEqual(expect.arrayContaining(["Geburtsdatum", "IBAN", "Straße"]));
    // Sensible Daten landen nirgends im Ergebnis
    const e = planePersonalImport(t, sp, [], OPT, HEUTE, id);
    const json = JSON.stringify(e.zeilen.map((z) => z.person));
    expect(json).not.toContain("DE001");
    expect(json).not.toContain("1990");
  });

  it("legt Personen mit Vertrag und Befristung an", () => {
    const t = tab(zvoove);
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [], OPT, HEUTE, id);
    expect(e.zusammenfassung.neu).toBe(3);
    const max = e.zeilen[0].person!;
    expect(max.pnr).toBe("1001");
    expect(max.contract).toMatchObject({ vertragsart: "Minijob", gueltigVon: "2026-03-01", gueltigBis: "2026-12-31", stundenlohn: 13.9, monatsgrenzeEur: 603, monatsgrenzeStd: Math.floor(603 / 13.9) });
    expect(max.pool).toBe("Stuttgart");
    expect(max.status).toBe("aktiv");
    expect(max.importQuelle).toEqual({ quelle: "zvoove", am: HEUTE });
    const eva = e.zeilen[1].person!;
    expect(eva.contract?.vertragsart).toBe("kurzfristig");
    expect(eva.contract?.gueltigBis).toBeNull();
    expect(eva.pool).toBe("Mannheim");
    // Person mit Austritt in der Vergangenheit
    expect(e.zeilen[2].person?.status).toBe("ausgeschieden");
    expect(e.zeilen[2].person?.contract?.gueltigBis).toBe("2026-06-30");
    // Jede Person besteht die Prüfung des Servers
    for (const z of e.zeilen) expect(KIND_SCHEMA.crew.safeParse(z.person).success).toBe(true);
  });

  it("aktualisiert Vorhandene über die Personalnummer und lässt Fragebogen, Schulungen, Notizen unberührt", () => {
    const t = tab(zvoove);
    const vorhanden = crewBasis({ id: "c-9", pnr: "1001", vorname: "Max", nachname: "Muster", telefon: "0170 000", notizen: "wichtig", xp: 40, unterweisungen: { grund: { version: "x", bestaetigtAm: "2026-09-01", quizScore: 1 } }, contract: { vertragsart: "Minijob", wochenstunden: 10, monatsgrenzeStd: 40, monatsgrenzeEur: 603, stundenlohn: 13, gueltigVon: "2026-03-01", gueltigBis: "2026-09-30", docusignId: "DS-1" } });
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [vorhanden], OPT, HEUTE, id);
    const z = e.zeilen[0];
    expect(z.aktion).toBe("aktualisieren");
    expect(z.aenderungen.join(" ")).toContain("Handy");
    expect(z.aenderungen.join(" ")).toContain("Vertrag");
    const r = uebernehmePersonal([vorhanden], e);
    const neu = r.crew.find((c) => c.id === "c-9")!;
    expect(neu.telefon).toBe("0151 1234567");
    expect(neu.contract?.gueltigBis).toBe("2026-12-31");
    expect(neu.contract?.docusignId).toBe("DS-1");
    expect(neu.notizen).toBe("wichtig");
    expect(neu.xp).toBe(40);
    expect(neu.unterweisungen.grund).toBeDefined();
    expect(r.neu).toBe(2);
    expect(r.aktualisiert).toBe(1);
    expect(r.crew.length).toBe(3);
  });

  it("zweiter Import derselben Datei ändert nichts mehr", () => {
    const t = tab(zvoove);
    const sp = erkennePersonalSpalten(t.kopf);
    const erst = planePersonalImport(t, sp, [], OPT, HEUTE, id);
    const bestand = uebernehmePersonal([], erst).crew;
    const zweit = planePersonalImport(t, sp, bestand, OPT, HEUTE, id);
    expect(zweit.zusammenfassung.neu).toBe(0);
    expect(zweit.zusammenfassung.aktualisieren).toBe(0);
    expect(zweit.zusammenfassung.unveraendert).toBe(3);
  });

  it("Feldreihenfolge aus der Datenbank (jsonb sortiert um) löst keine Scheinänderung aus", () => {
    const t = tab(zvoove);
    const sp = erkennePersonalSpalten(t.kopf);
    const bestand = uebernehmePersonal([], planePersonalImport(t, sp, [], OPT, HEUTE, id)).crew;
    // so liefert Postgres JSON zurück: Felder nach Länge und Alphabet sortiert
    const sortiert = (x: unknown): unknown => (Array.isArray(x) ? x.map(sortiert) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort((a, b) => a.length - b.length || a.localeCompare(b)).map((k) => [k, sortiert((x as Record<string, unknown>)[k])])) : x);
    const ausDb = JSON.parse(JSON.stringify(sortiert(bestand))) as Crew[];
    const zweit = planePersonalImport(t, sp, ausDb, OPT, HEUTE, id);
    expect(zweit.zusammenfassung.aktualisieren).toBe(0);
    expect(zweit.zusammenfassung.unveraendert).toBe(3);
  });

  it("Befristung verlängert sich beim erneuten Import", () => {
    const sp1 = tab("Personalnummer;Nachname;Vorname;Vertragsart;Befristet bis\n7;A;B;Teilzeit;31.12.2026");
    const bestand = uebernehmePersonal([], planePersonalImport(sp1, erkennePersonalSpalten(sp1.kopf), [], OPT, HEUTE, id)).crew;
    const sp2 = tab("Personalnummer;Nachname;Vorname;Vertragsart;Befristet bis\n7;A;B;Teilzeit;30.06.2027");
    const e = planePersonalImport(sp2, erkennePersonalSpalten(sp2.kopf), bestand, OPT, HEUTE, id);
    expect(e.zeilen[0].aktion).toBe("aktualisieren");
    expect(uebernehmePersonal(bestand, e).crew[0].contract?.gueltigBis).toBe("2027-06-30");
  });

  it("mehrere Vertragszeilen derselben Nummer: der aktuelle gewinnt", () => {
    const t = tab("Personalnummer;Nachname;Vorname;Beschäftigungsart;Eintritt;Befristet bis\n5;A;B;Kurzfristig;01.01.2025;31.03.2025\n5;A;B;Teilzeit;01.01.2026;\n5;A;B;Vollzeit;01.01.2027;");
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [], OPT, HEUTE, id);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0].person?.contract?.vertragsart).toBe("TZ");
    expect(e.zeilen[0].person?.contract?.gueltigBis).toBeNull();
  });

  it("unbekannte Vertragsarten werden abgefragt und danach übernommen", () => {
    const t = tab("Personalnummer;Nachname;Vorname;Beschäftigungsart\n8;A;B;Aushilfe");
    const sp = erkennePersonalSpalten(t.kopf);
    const e1 = planePersonalImport(t, sp, [], OPT, HEUTE, id);
    expect(e1.unbekannteVertraege).toEqual(["Aushilfe"]);
    expect(e1.zeilen[0].person?.contract).toBeNull();
    const e2 = planePersonalImport(t, sp, [], { ...OPT, vertragZuordnung: { Aushilfe: "kurzfristig" } }, HEUTE, id);
    expect(e2.zeilen[0].person?.contract?.vertragsart).toBe("kurzfristig");
  });

  it("Vertragsarten-Erkennung", () => {
    expect(erkenneVertragsart("Geringfügig Beschäftigte")).toBe("Minijob");
    expect(erkenneVertragsart("Minijob 538 €")).toBe("Minijob");
    expect(erkenneVertragsart("kurzfristig beschäftigt")).toBe("kurzfristig");
    expect(erkenneVertragsart("Werkstudent/in")).toBe("Werkstudent");
    expect(erkenneVertragsart("Teilzeit")).toBe("TZ");
    expect(erkenneVertragsart("Vollzeit")).toBe("VZ");
    expect(erkenneVertragsart("Aushilfe")).toBeNull();
  });

  it("ordnet eine Bewerber-Person mit vorläufiger Nummer über den Namen zu und gibt ihr die echte Nummer", () => {
    const bewerber = crewBasis({ id: "c-5", pnr: "B0001", vorname: "Eva", nachname: "Beispiel", status: "Bewerber" });
    const t = tab(zvoove);
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [bewerber], OPT, HEUTE, id);
    const z = e.zeilen.find((x) => x.name === "Eva Beispiel")!;
    expect(z.aktion).toBe("aktualisieren");
    expect(z.trefferId).toBe("c-5");
    expect(z.person?.pnr).toBe("1002");
    expect(z.person?.status).toBe("aktiv");
  });

  it("Personalnummer aus Excel („1234.0“) wird bereinigt; Namensänderungen stehen in der Vorschau", () => {
    const t = tab("Personalnummer;Nachname;Vorname\n1001.0;Neu;Person");
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [crewBasis({ pnr: "1001", vorname: "Anna", nachname: "Alt" })], OPT, HEUTE, id);
    expect(e.zeilen[0].aktion).toBe("aktualisieren");
    expect(e.zeilen[0].aenderungen.join(" ")).toContain("Vorname: Anna → Person");
  });

  it("Optionen: nichts anlegen, nichts aktualisieren, sofort freigeben, Ausgeschiedene weglassen", () => {
    const t = tab(zvoove);
    const sp = erkennePersonalSpalten(t.kopf);
    expect(planePersonalImport(t, sp, [], { ...OPT, neuAnlegen: false }, HEUTE, id).zusammenfassung.uebersprungen).toBe(3);
    const frei = planePersonalImport(t, sp, [], { ...OPT, sofortFreigeben: true }, HEUTE, id);
    expect(frei.zeilen[0].person?.freigabe).toMatchObject({ status: "bestaetigt", von: "Import" });
    const ohneAlte = planePersonalImport(t, sp, [], { ...OPT, ausgeschiedeneUebernehmen: false }, HEUTE, id);
    expect(ohneAlte.zeilen[2].aktion).toBe("uebersprungen");
  });

  it("fehlerhafte Zeilen werden gemeldet, nicht verschluckt", () => {
    const t = tab("Personalnummer;Nachname;Vorname;E-Mail;PLZ\n9;Nurnachname;;kaputt;123\n10;Ok;Person;ok@x.de;70173");
    const e = planePersonalImport(t, erkennePersonalSpalten(t.kopf), [], OPT, HEUTE, id);
    expect(e.zeilen[0].aktion).toBe("fehler");
    expect(e.zeilen[1].aktion).toBe("neu");
    expect(e.zeilen[1].person?.email).toBe("ok@x.de");
  });
});

describe("Auftrags-Import (Regio-Tabelle)", () => {
  const tabelle = [
    "Datum;Kunde;Veranstaltung;Ort;PLZ;Beginn;Ende;Anzahl;Tätigkeit",
    "01.12.2026;Messe Stuttgart;Aufbau Halle 1;Stuttgart;70629;07:00;15:00;8;Messeaufbau",
    "01.12.2026;Messe Stuttgart;Aufbau Halle 1;Stuttgart;70629;07:00;15:00;4;Gabelstapler",
    "02.12.2026;Messe Stuttgart;Aufbau Halle 1;Stuttgart;70629;07:00;15:00;8;Messeaufbau",
    "20.12.2026;Messe Stuttgart;Abbau Halle 1;Stuttgart;70629;08:00-16:00;;6;Abbau",
  ].join("\n");
  const lies = (t: string) => { const r = parseText(t); const k = findeKopfzeile(r, kopfAuftraege()); const tt = tabelleAusRohdaten(r, k); return { tt, sp: erkenneAuftragSpalten(tt) }; };
  const OPT_A = { sofortVeroeffentlichen: false, standardTaetigkeit: "Stagehand" as const };

  it("fasst Zeilen zu Aufträgen zusammen und erkennt Tätigkeit, Zeiten und Anzahl", () => {
    const { tt, sp } = lies(tabelle);
    const e = planeAuftragImport(tt, sp, [], OPT_A);
    expect(e.zusammenfassung.neu).toBe(2);
    const aufbau = e.plaene.find((p) => p.job.titel === "Aufbau Halle 1")!;
    expect(aufbau.job.schichten).toHaveLength(3);
    expect(aufbau.job.datumVon).toBe("2026-12-01");
    expect(aufbau.job.datumBis).toBe("2026-12-02");
    expect(aufbau.job.status).toBe("Entwurf");
    expect(aufbau.job.quelle).toBe("Planung Regios");
    expect(aufbau.job.schichten.map((s) => s.taetigkeit)).toEqual(expect.arrayContaining(["Messebau", "Stapler"]));
    expect(aufbau.job.schichten.reduce((n, s) => n + s.bedarf, 0)).toBe(20);
    const abbau = e.plaene.find((p) => p.job.titel === "Abbau Halle 1")!;
    expect(abbau.job.schichten[0]).toMatchObject({ start: "08:00", ende: "16:00", taetigkeit: "Stagehand", bedarf: 6 });
    for (const p of e.plaene) expect(KIND_SCHEMA.job.safeParse(p.job).success).toBe(true);
  });

  it("erneuter Import: unverändert; geänderte Zeit aktualisiert dieselbe Schicht; nichts wird gelöscht", () => {
    const { tt, sp } = lies(tabelle);
    const erst = planeAuftragImport(tt, sp, [], OPT_A);
    const r = uebernehmeAuftraege([], [], erst);
    expect(r.jobs).toHaveLength(2);
    expect(r.auftraege).toHaveLength(2);
    const zweit = planeAuftragImport(tt, sp, r.jobs, OPT_A);
    expect(zweit.zusammenfassung).toMatchObject({ neu: 0, aktualisieren: 0, unveraendert: 2 });

    const geaendert = lies(tabelle.replace("07:00;15:00;8;Messeaufbau\n01.12", "07:00;16:00;8;Messeaufbau\n01.12"));
    const dritt = planeAuftragImport(geaendert.tt, geaendert.sp, r.jobs, OPT_A);
    expect(dritt.zusammenfassung.aktualisieren).toBe(1);
    const p = dritt.plaene.find((x) => x.aktion === "aktualisieren")!;
    expect(p.schichtenGeaendert).toBe(1);
    // Schicht-IDs bleiben (Besetzungen hängen daran)
    const alteIds = r.jobs.find((j) => j.id === p.job.id)!.schichten.map((s) => s.id).sort();
    expect(p.job.schichten.map((s) => s.id).sort()).toEqual(alteIds);

    // Eine Zeile fehlt in der neuen Tabelle: Schicht bleibt bestehen
    const kuerzer = lies(tabelle.split("\n").filter((z) => !z.includes("Gabelstapler")).join("\n"));
    const viert = planeAuftragImport(kuerzer.tt, kuerzer.sp, r.jobs, OPT_A);
    const q = viert.plaene.find((x) => x.job.titel === "Aufbau Halle 1")!;
    expect(q.job.schichten).toHaveLength(3);
    expect(q.schichtenNichtInTabelle).toBe(1);
  });

  it("Status und Besetzung bestehender Aufträge bleiben, Auftragsnummer macht den Abgleich eindeutig", () => {
    const vorhanden: Job = { id: "AUF-2026-0007", kunde: "Alt", titel: "Alt", ort: "X", plz: "70173", datumVon: "2026-12-01", datumBis: "2026-12-01", schichten: [{ id: "AUF-2026-0007-s1", bezeichnung: "Schicht 1", datum: "2026-12-01", start: "07:00", ende: "15:00", taetigkeit: "Messebau", bedarf: 5 }], beschreibung: "", dresscode: "", psa: [], hoehe: false, verpflegung: "", parken: "", treffpunkt: "", ansprechpartner: "Anna", ablauf: [], status: "laufend", quelle: "manuell" };
    const { tt, sp } = lies("Auftragsnummer;Datum;Kunde;Veranstaltung;Ort;Beginn;Ende;Anzahl;Tätigkeit\nAUF-2026-0007;01.12.2026;Messe;Aufbau;Stuttgart;07:00;15:00;9;Messeaufbau");
    const e = planeAuftragImport(tt, sp, [vorhanden], OPT_A);
    expect(e.plaene[0].aktion).toBe("aktualisieren");
    expect(e.plaene[0].job.id).toBe("AUF-2026-0007");
    expect(e.plaene[0].job.status).toBe("laufend");
    expect(e.plaene[0].job.ansprechpartner).toBe("Anna");
    expect(e.plaene[0].job.schichten[0].id).toBe("AUF-2026-0007-s1");
    expect(e.plaene[0].job.schichten[0].bedarf).toBe(9);
  });

  it("gleiche Veranstaltung an weit auseinanderliegenden Tagen sind getrennte Aufträge", () => {
    const { tt, sp } = lies("Datum;Kunde;Veranstaltung;Ort;Beginn;Ende;Anzahl\n01.12.2026;K;E;O;08:00;16:00;2\n02.12.2026;K;E;O;08:00;16:00;2\n20.12.2026;K;E;O;08:00;16:00;2");
    expect(planeAuftragImport(tt, sp, [], OPT_A).plaene).toHaveLength(2);
  });

  it("fehlende Angaben werden eingesetzt und gemeldet; Veröffentlichen bleibt dann aus", () => {
    const { tt, sp } = lies("Datum;Kunde;Veranstaltung;Ort;Anzahl;Tätigkeit\n01.12.2026;K;E;O;;Zauberer");
    const e = planeAuftragImport(tt, sp, [], { sofortVeroeffentlichen: true, standardTaetigkeit: "Logistik" });
    const w = e.plaene[0].warnungen.join(" | ");
    expect(w).toContain("Uhrzeit fehlt");
    expect(w).toContain("Anzahl fehlt");
    expect(w).toContain("nicht erkannt");
    expect(w).toContain("PLZ fehlt");
    expect(e.plaene[0].job.status).toBe("Entwurf");
    expect(e.plaene[0].job.schichten[0].taetigkeit).toBe("Logistik");
  });

  it("Pflichtspalten fehlen: nichts wird geplant", () => {
    const { tt, sp } = lies("Kunde;Ort\nA;B");
    const e = planeAuftragImport(tt, sp, [], OPT_A);
    expect(e.fehlendePflicht).toContain("Datum");
    expect(e.plaene).toHaveLength(0);
  });

  it("„von“ und „bis“ als Uhrzeit oder Datum werden an den Werten erkannt", () => {
    const a = lies("Tag;Kunde;Ort;von;bis;Anzahl\n01.12.2026;K;O;08:00;16:00;2");
    expect(a.sp.start).toBe(3);
    expect(a.sp.ende).toBe(4);
  });

  it("Tätigkeiten aus Freitext", () => {
    expect(erkenneTaetigkeit("Barkeeper")).toBe("Bar");
    expect(erkenneTaetigkeit("Service / Catering")).toBe("Catering");
    expect(erkenneTaetigkeit("Einlass & Ticketing")).toBe("Einlass");
    expect(erkenneTaetigkeit("Gabelstaplerfahrer")).toBe("Stapler");
    expect(erkenneTaetigkeit("Auf- und Abbau")).toBe("Stagehand");
    expect(erkenneTaetigkeit("Flyer verteilen")).toBe("Promotion");
    expect(erkenneTaetigkeit("Zauberer")).toBeNull();
  });
});

describe("Freigabe", () => {
  const r = standardSchulung();
  const ack = { version: "x", bestaetigtAm: "2026-10-01", quizScore: 1 };
  const fertig = { grund: ack, brandschutz: ack };
  it("offen → wartet → freigegeben / abgelehnt", () => {
    expect(freigabeStand({ freigabe: undefined, profile: null, unterweisungen: {} }, r, HEUTE)).toBe("offen");
    const profil = antwortenZuProfil(leereAntworten());
    expect(freigabeStand({ freigabe: undefined, profile: profil, unterweisungen: {} }, r, HEUTE)).toBe("offen");
    expect(freigabeStand({ freigabe: undefined, profile: profil, unterweisungen: { grund: ack } }, r, HEUTE)).toBe("offen");
    expect(freigabeStand({ freigabe: undefined, profile: profil, unterweisungen: fertig }, r, HEUTE)).toBe("wartet");
    expect(freigabeStand({ freigabe: { status: "bestaetigt", am: HEUTE, von: "x", notiz: "" }, profile: null, unterweisungen: {} }, r, HEUTE)).toBe("freigegeben");
    expect(freigabeStand({ freigabe: { status: "abgelehnt", am: HEUTE, von: "x", notiz: "" }, profile: profil, unterweisungen: fertig }, r, HEUTE)).toBe("abgelehnt");
  });
  it("gesperrte und ausgeschiedene Personen sehen nie Aufträge, auch nicht mit alter Freigabe", () => {
    const frei = { status: "bestaetigt" as const, am: HEUTE, von: "x", notiz: "" };
    expect(freigabeStand({ freigabe: frei, profile: null, unterweisungen: {}, status: "aktiv" }, r, HEUTE)).toBe("freigegeben");
    expect(freigabeStand({ freigabe: frei, profile: null, unterweisungen: {}, status: "gesperrt" }, r, HEUTE)).toBe("abgelehnt");
    expect(freigabeStand({ freigabe: frei, profile: null, unterweisungen: {}, status: "ausgeschieden" }, r, HEUTE)).toBe("abgelehnt");
  });
  it("abgelaufene Unterweisung hält die Person zurück; ohne Voraussetzungs-Module genügt der Fragebogen", () => {
    const profil = antwortenZuProfil(leereAntworten());
    const alt = { ...ack, bestaetigtAm: "2025-01-01" };
    expect(freigabeStand({ freigabe: undefined, profile: profil, unterweisungen: { grund: alt, brandschutz: alt } }, r, HEUTE)).toBe("offen");
    expect(freigabeStand({ freigabe: undefined, profile: profil, unterweisungen: {} }, { ...r, freigabeModule: [] }, HEUTE)).toBe("wartet");
  });
});

describe("Schulungs-Pflicht einstellbar", () => {
  it("ohne eigene Regeln gilt der bisherige Standard", () => {
    expect(pflichtModule(["Stagehand"])).toEqual(["grund", "stagehand", "elektrik", "brandschutz"]);
    expect(pflichtModule(["Stagehand"], { hoehe: true })).toContain("hoehe");
    expect(pflichtModule(["Catering", "Bar"], {}, standardSchulung())).toEqual(["grund", "catering", "brandschutz"]);
  });
  it("eigene Regeln, Kundenregel und Zusatz im Auftrag", () => {
    const r = standardSchulung();
    r.pflichtJeTaetigkeit.Promotion = ["einlass"];
    r.pflichtAlle = ["grund"];
    r.jeKunde = [{ kunde: "Messe Stuttgart", module: ["hoehe", "elektrik"] }];
    expect(pflichtModule(["Promotion"], {}, r)).toEqual(["grund", "einlass"]);
    expect(pflichtModule(["Promotion"], { kunde: "  messe stuttgart " }, r)).toEqual(["grund", "elektrik", "hoehe", "einlass"].sort((a, b) => ["grund", "stagehand", "catering", "stapler", "hoehe", "elektrik", "einlass", "brandschutz"].indexOf(a) - ["grund", "stagehand", "catering", "stapler", "hoehe", "elektrik", "einlass", "brandschutz"].indexOf(b)));
    expect(pflichtModule(["Promotion"], { zusatz: ["stapler", "gibtesnicht"] }, r)).toEqual(["grund", "stapler", "einlass"]);
  });
  it("fehlende Module lassen sich damit berechnen", () => {
    const r = standardSchulung();
    r.pflichtAlle = ["grund", "brandschutz", "elektrik"];
    const pflicht = pflichtModule(["Promotion"], {}, r);
    expect(fehlendeModule(pflicht, { grund: { version: "x", bestaetigtAm: "2026-10-01", quizScore: 1 } }, HEUTE)).toEqual(["elektrik", "brandschutz"]);
  });
  it("gespeicherte Einstellungen werden bereinigt", () => {
    const s = bereinigeSchulung({ pflichtAlle: ["grund", "unbekannt"], jeKunde: [{ kunde: "X", module: ["hoehe", "quatsch"] }, { kein: "kunde" }], video: { grund: { url: "https://youtu.be/abcdefghijk", titel: "T", pflicht: true }, quatsch: { url: "x" } }, freigabeModule: "kaputt" });
    expect(s.pflichtAlle).toEqual(["grund"]);
    expect(s.jeKunde).toEqual([{ kunde: "X", module: ["hoehe"] }]);
    expect(Object.keys(s.video)).toEqual(["grund"]);
    expect(s.freigabeModule).toEqual(["grund", "brandschutz"]);
    expect(bereinigeSchulung(null)).toEqual(standardSchulung());
  });
});

describe("Arbeitskleidung", () => {
  const k = standardKleidung();
  it("Fragebogen verlangt bei Wunsch Artikel und die passenden Größen", () => {
    const a = leereAntworten();
    expect(kleidungFehler(a, k.artikel)).toBeNull();
    a.kleidungWunsch = false;
    expect(kleidungFehler(a, k.artikel)).toBeNull();
    a.kleidungWunsch = true;
    expect(kleidungFehler(a, k.artikel)).toContain("Artikel");
    a.kleidungArtikel = ["tshirt", "hose", "schuhe"];
    expect(kleidungFehler(a, k.artikel)).toContain("Shirtgröße");
    a.shirt = "M";
    expect(kleidungFehler(a, k.artikel)).toContain("Hosengröße");
    a.hosengroesse = "L";
    expect(kleidungFehler(a, k.artikel)).toContain("Schuhgröße");
    a.schuhgroesse = "43";
    expect(kleidungFehler(a, k.artikel)).toBeNull();
    const p = antwortenZuProfil(a);
    expect(p.schuhgroesse).toBe("43");
    expect(p.kleidung).toEqual({ wunsch: true, artikel: ["tshirt", "hose", "schuhe"], hosengroesse: "L" });
  });
  it("kein Wunsch → keine Artikel im Profil", () => {
    const a = leereAntworten();
    a.kleidungWunsch = false;
    a.kleidungArtikel = ["tshirt"];
    expect(antwortenZuProfil(a).kleidung?.artikel).toEqual([]);
  });
  it("Bedarf nach Größe und Pfand", () => {
    const mit = (id: string, shirt: string, schuh: string, artikel: string[], rest: Partial<Crew> = {}) => {
      const a = leereAntworten();
      a.shirt = shirt;
      a.schuhgroesse = schuh;
      a.kleidungWunsch = true;
      a.kleidungArtikel = artikel;
      a.hosengroesse = "L";
      return crewBasis({ id, pnr: id, profile: antwortenZuProfil(a), ...rest });
    };
    const crew = [mit("a", "M", "42", ["tshirt", "schuhe"]), mit("b", "M", "44", ["tshirt"]), mit("c", "XL", "40", ["tshirt"], { kleidungAusgabe: [{ id: "x", artikel: "tshirt", groesse: "XL", pfandEur: 10, ausgegebenAm: HEUTE, zurueckAm: null, notiz: "" }] }), mit("d", "S", "38", ["tshirt"], { status: "ausgeschieden" })];
    const z = bedarf(crew, k.artikel);
    const shirt = z.find((x) => x.artikel.id === "tshirt")!;
    expect(shirt.summe).toBe(2);
    expect(shirt.nachGroesse.get("M")).toHaveLength(2);
    const schuh = z.find((x) => x.artikel.id === "schuhe")!;
    expect(schuh.nachGroesse.get("42")).toHaveLength(1);
    expect(offenesPfand(crew)).toBe(10);
    expect(groesseFuer(crew[0], k.artikel.find((x) => x.id === "weste")!)).toBe("–");
    expect(sortiereGroessen(["XL", "S", "43", "M", "ohne Größe", "38"])).toEqual(["S", "M", "XL", "38", "43", "ohne Größe"]);
  });
  it("CSV: Anführungszeichen werden verdoppelt, mit BOM für Excel", () => {
    expect(csv([["a", 'b"c']])).toBe('﻿"a";"b""c"');
  });
  it("Einstellung wird bereinigt", () => {
    const k2 = bereinigeKleidung({ aktiv: false, artikel: [{ id: "x", label: "Hut", groessen: "kaputt", pfandEur: -3 }, { nix: 1 }] });
    expect(k2.aktiv).toBe(false);
    expect(k2.artikel).toEqual([{ id: "x", label: "Hut", groessen: "keine", pfandEur: null }]);
  });
});

describe("Video", () => {
  it("YouTube, Vimeo, Datei, Link – nur https", () => {
    expect(videoEinbettung("https://www.youtube.com/watch?v=abcDEF12345")).toEqual({ art: "iframe", src: "https://www.youtube-nocookie.com/embed/abcDEF12345" });
    expect(videoEinbettung("https://youtu.be/abcDEF12345?t=3")?.src).toBe("https://www.youtube-nocookie.com/embed/abcDEF12345");
    expect(videoEinbettung("https://youtube.com/shorts/abcDEF12345")?.art).toBe("iframe");
    expect(videoEinbettung("https://vimeo.com/123456789")).toEqual({ art: "iframe", src: "https://player.vimeo.com/video/123456789" });
    expect(videoEinbettung("https://cdn.example.de/uw/grund.mp4")).toEqual({ art: "video", src: "https://cdn.example.de/uw/grund.mp4" });
    expect(videoEinbettung("https://cloud.example.de/s/abc")?.art).toBe("link");
    expect(videoEinbettung("http://youtu.be/abcDEF12345")).toBeNull();
    expect(videoEinbettung("javascript:alert(1)")).toBeNull();
    expect(videoEinbettung("")).toBeNull();
  });
  it("Drehbuch-Entwurf aus den Lernkarten", () => {
    const d = drehbuch("grund", "de");
    expect(d).toContain("DREHBUCH");
    expect(d).toContain("Szene 1");
    expect(drehbuch("grund", "en")).toContain("SCRIPT");
    expect(drehbuch("gibtesnicht", "de")).toBe("");
  });
});

describe("Nachrichten", () => {
  it("Platzhalter und WhatsApp-Nummern", () => {
    const c = crewBasis({ vorname: "Eva", nachname: "Muster", pnr: "1002" });
    expect(fuelleVorlage("Hallo {vorname} {nachname} ({pnr}): {link}", c, "https://x/y")).toBe("Hallo Eva Muster (1002): https://x/y");
    expect(brauchtLink("ohne")).toBe(false);
    expect(brauchtLink("mit {link}")).toBe(true);
    expect(waNummer("0151 1234567")).toBe("491511234567");
    expect(waNummer("+49 151 1234567")).toBe("491511234567");
    expect(waNummer("0049151 1234567")).toBe("491511234567");
    expect(waNummer("12")).toBeNull();
    expect(waNummer("")).toBeNull();
    expect(waLink("0151 1234567", "Hi & du")).toBe("https://wa.me/491511234567?text=Hi%20%26%20du");
    expect(waLink("", "x")).toBeNull();
  });
});

describe("Rollen", () => {
  it("Schreibrechte je Rolle", () => {
    expect(darfSchreiben("admin", "einst")).toBe(true);
    expect(darfSchreiben("dispo", "job")).toBe(true);
    expect(darfSchreiben("dispo", "stunde")).toBe(false);
    expect(darfSchreiben("dispo", "einst")).toBe(false);
    expect(darfSchreiben("dispo", "benutzer")).toBe(false);
    expect(darfSchreiben("buchhaltung", "stunde")).toBe(true);
    expect(darfSchreiben("buchhaltung", "job")).toBe(false);
    expect(darfSchreiben("lesen", "notiz")).toBe(false);
  });
  it("Lesen: alle außer Benutzerliste nur Admin", () => {
    expect(darfLesen("lesen", "crew")).toBe(true);
    expect(darfLesen("dispo", "benutzer")).toBe(false);
    expect(darfLesen("admin", "benutzer")).toBe(true);
  });
  it("Aktionen und Seiten", () => {
    expect(darfAktion("admin", "import-personal")).toBe(true);
    expect(darfAktion("dispo", "import-personal")).toBe(false);
    expect(darfAktion("dispo", "import-auftraege")).toBe(true);
    expect(darfAktion("dispo", "benutzer")).toBe(false);
    expect(darfAktion("lesen", "nachrichten")).toBe(false);
    expect(darfSeite("admin", "/admin/schnittstelle")).toBe(true);
    expect(darfSeite("dispo", "/admin/stunden")).toBe(false);
    expect(darfSeite("dispo", "/admin/crew/c-1")).toBe(true);
    expect(darfSeite("buchhaltung", "/admin/dispo")).toBe(false);
    expect(darfSeite("buchhaltung", "/admin/stunden")).toBe(true);
    expect(darfSeite("lesen", "/admin/benutzer")).toBe(false);
    expect(darfSeite("lesen", "/admin")).toBe(true);
  });
});

describe("Schnittstelle zum bisherigen System: vorbereitet, aber aus", () => {
  it("ist ohne Umgebungsschalter aus – auch wenn der Schalter in den Einstellungen an ist", () => {
    expect(schnittstelleUmgebungAn({})).toBe(false);
    expect(schnittstelleUmgebungAn({ NEU_SCHNITTSTELLE: "aus" })).toBe(false);
    expect(schnittstelleUmgebungAn({ NEU_SCHNITTSTELLE: "1" })).toBe(false);
    expect(schnittstelleUmgebungAn({ NEU_SCHNITTSTELLE: "an" })).toBe(true);
    expect(schnittstelleStatus(true, {})).toMatchObject({ umgebung: false, einstellung: true, eingebaut: false, wirksam: false });
    expect(schnittstelleStatus(true, { NEU_SCHNITTSTELLE: "an" }).wirksam).toBe(false);
  });
  it("die beiden Adressen antworten 404 und mit „an“ nur 501 – nie mit Daten", async () => {
    const { GET } = await import("@/app/api/neu/schnittstelle/auftraege/route");
    const { POST } = await import("@/app/api/neu/schnittstelle/stunden/route");
    const vorher = process.env.NEU_SCHNITTSTELLE;
    try {
      delete process.env.NEU_SCHNITTSTELLE;
      expect((await GET()).status).toBe(404);
      expect((await POST()).status).toBe(404);
      process.env.NEU_SCHNITTSTELLE = "an";
      const g = await GET();
      expect(g.status).toBe(501);
      expect(await g.json()).toEqual({ error: "Die Schnittstelle ist vorbereitet, aber noch nicht eingebaut." });
      expect((await POST()).status).toBe(501);
    } finally {
      if (vorher === undefined) delete process.env.NEU_SCHNITTSTELLE;
      else process.env.NEU_SCHNITTSTELLE = vorher;
    }
  });
  it("Feed enthält keine Entwürfe und nur Nummer und Name der Besetzung", () => {
    const d = baueDemo();
    const jobs: Job[] = [{ ...d.jobs[0], status: "Entwurf" }, { ...d.jobs[1], status: "offen" }];
    const sid = jobs[1].schichten[0].id;
    const feed = baueAuftragFeed(jobs, { [sid]: [{ pnr: d.crew[0].pnr }, { pnr: "gibtesnicht" }] }, d.crew, "2026-10-10T00:00:00Z");
    expect(auftragFeedSchema.safeParse(feed).success).toBe(true);
    expect(feed.auftraege).toHaveLength(1);
    const besetzung = feed.auftraege[0].schichten[0].besetzung;
    expect(besetzung).toEqual([{ pnr: d.crew[0].pnr, vorname: d.crew[0].vorname, nachname: d.crew[0].nachname }]);
    expect(JSON.stringify(feed)).not.toContain(d.crew[0].telefon);
  });
  it("Stunden aus dem Einsatzzettel kommen als „offen“ mit Verweis auf die PDF; Unbekannte werden gemeldet", () => {
    const d = baueDemo();
    const r = stundenRueckmeldungSchema.parse({ version: 1, dateiRef: "zettel/2026/10/abc.pdf", dateiHash: "a".repeat(64), auftragId: d.jobs[0].id, erkanntAm: "2026-10-10T00:00:00Z", zeilen: [{ pnr: d.crew[0].pnr, datum: "2026-10-09", start: "08:00", ende: "16:30", pausen: [{ von: "12:00", bis: "12:30" }], bemerkung: "" }, { pnr: "99999", datum: "2026-10-09", start: "08:00", ende: "16:00", pausen: [] }] });
    const e = stundenZeilenAusRueckmeldung(r, d.jobs, d.crew);
    expect(e.unbekanntePnr).toEqual(["99999"]);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0]).toMatchObject({ status: "offen", quelle: "Zettel", sourceRef: "zettel/2026/10/abc.pdf", auftrag: d.jobs[0].id });
    expect(KIND_SCHEMA.stunde.safeParse(e.zeilen[0]).success).toBe(true);
    expect(stundenRueckmeldungSchema.safeParse({ ...r, dateiHash: "zu kurz" }).success).toBe(false);
  });
});

// Das neue System darf den Bestand des bisherigen Systems weder lesen noch schreiben.
describe("Trennung vom bisherigen System", () => {
  const wurzel = path.resolve(__dirname, "../../src");
  const ordner = ["lib/neu", "neu", "app/api/neu", "app/admin", "app/crew", "app/b", "preview"];
  const dateien = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const alle = ordner.flatMap((o) => dateien(path.join(wurzel, o)));
  const ERLAUBT = new Set(["@/lib/db", "@/lib/auth", "@/lib/einsatz/rate-limit", "@/lib/einsatz/base-url", "@/lib/claude"]);
  // Die Sicherung ist die einzige Stelle, die den Bestand LIEST (Dokumente, Belege, Personalstamm) – nur dort erlaubt, nur lesend
  const SICHERUNG = path.join("lib", "neu", "sicherung.ts");
  const NUR_SICHERUNG = new Set(["@/lib/receipts", "@/lib/einsatz/tz"]);
  const LESEND_NUR_SICHERUNG = new Set(["document", "receipt", "receiptFile", "employee"]);

  it("nutzt aus dem bisherigen System nur Anmeldung, Datenbank-Zugang, Rate-Limit, Basis-Adresse und die Beleg-Auslesung", () => {
    const verstoesse: string[] = [];
    for (const f of alle) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/from\s+["'](@\/lib\/[^"']+)["']/g)) {
        const mod = m[1];
        if (mod.startsWith("@/lib/neu/") || ERLAUBT.has(mod)) continue;
        if (NUR_SICHERUNG.has(mod) && f.endsWith(SICHERUNG)) continue;
        verstoesse.push(`${path.relative(wurzel, f)} → ${mod}`);
      }
      for (const m of text.matchAll(/from\s+["'](@\/(?:components|app\/\(app\))[^"']*)["']/g)) verstoesse.push(`${path.relative(wurzel, f)} → ${m[1]}`);
    }
    expect(verstoesse).toEqual([]);
  });

  it("greift in der Datenbank nur auf v2_-Tabellen zu (und lesend auf die Konten für die Benutzerliste)", () => {
    const verstoesse: string[] = [];
    for (const f of alle) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\bdb\.(\w+)/g)) {
        const modell = m[1];
        if (modell.startsWith("v2") || modell === "$transaction") continue;
        if (modell === "user" && f.endsWith(path.join("lib", "neu", "benutzer.ts"))) continue;
        if (modell === "user" && f.endsWith("lib/auth.ts")) continue;
        if (LESEND_NUR_SICHERUNG.has(modell) && f.endsWith(SICHERUNG)) continue;
        verstoesse.push(`${path.relative(wurzel, f)} → db.${modell}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("die Sicherung liest den Bestand nur – kein Anlegen, Ändern oder Löschen", () => {
    const text = readFileSync(path.join(wurzel, "lib/neu/sicherung.ts"), "utf8");
    expect(text).toMatch(/db\.document\.findMany/);
    expect(text).toMatch(/db\.receipt\.findMany/);
    expect(text).not.toMatch(/db\.(document|receipt|receiptFile|employee|v2File|v2Record)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/);
    expect(text).not.toMatch(/\$executeRaw|\$queryRaw|\$transaction/);
    // Und sonst fasst keine andere Datei diese Tabellen an
    const andere = alle.filter((f) => !f.endsWith(SICHERUNG)).filter((f) => /\bdb\.(document|receipt|receiptFile|employee)\b/.test(readFileSync(f, "utf8")));
    expect(andere.map((f) => path.relative(wurzel, f))).toEqual([]);
  });

  it("die Konten werden in der Benutzerliste nur gelesen", () => {
    const text = readFileSync(path.join(wurzel, "lib/neu/benutzer.ts"), "utf8");
    expect(text).toMatch(/db\.user\.findMany/);
    expect(text).toMatch(/db\.user\.findFirst/);
    expect(text).not.toMatch(/db\.user\.(create|update|delete|upsert)/);
  });
});

describe("Sicherung: Auswahl und Hilfen", () => {
  it("Monatsgrenzen in Berliner Zeit (Sommer- und Winterzeit)", () => {
    const okt = monatsGrenzen("2026-10");
    expect(okt.zeitVon.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(okt.zeitBis.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(okt.datumVon.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(okt.datumBis.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const dez = monatsGrenzen("2026-12");
    expect(dez.zeitBis.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(dez.datumBis.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("letzter voller Monat und Monatsname", () => {
    expect(letzterVollerMonat(new Date("2026-10-10T10:00:00Z"))).toBe("2026-09");
    expect(letzterVollerMonat(new Date("2027-01-02T10:00:00Z"))).toBe("2026-12");
    // Berliner Zeit zählt: 28.02. um 23:30 UTC ist schon der 1. März in Berlin
    expect(letzterVollerMonat(new Date("2026-02-28T23:30:00Z"))).toBe("2026-02");
    expect(letzterVollerMonat(new Date("2026-02-28T22:30:00Z"))).toBe("2026-01");
    expect(monatsName("2026-03")).toBe("März 2026");
  });
  it("Dateinamen sind sicher und eindeutig", () => {
    expect(sicherDateiname("../../etc/passwd")).toBe("..-..-etc-passwd".replace(/^\.+/, ""));
    expect(sicherDateiname('a/b\\c:d"e?.pdf')).toBe("a-b-cde.pdf");
    expect(sicherDateiname("   ")).toBe("Datei");
    expect(sicherDateiname("x".repeat(400)).length).toBe(150);
    const belegt = new Set<string>();
    expect(eindeutigerPfad(belegt, "Ordner/Beleg.pdf")).toBe("Ordner/Beleg.pdf");
    expect(eindeutigerPfad(belegt, "ordner/beleg.pdf")).toBe("ordner/beleg (2).pdf");
    expect(eindeutigerPfad(belegt, "Ordner/Beleg.pdf")).toBe("Ordner/Beleg (3).pdf");
    expect(eindeutigerPfad(belegt, "Ordner.v2/Ohne-Endung")).toBe("Ordner.v2/Ohne-Endung");
    expect(eindeutigerPfad(belegt, "Ordner.v2/Ohne-Endung")).toBe("Ordner.v2/Ohne-Endung (2)");
  });
  it("Anfrage: nur gültige Monate und bekannte Bereiche", () => {
    expect(sicherungsAnfrage.safeParse({ monat: "2026-09", bereiche: ["stundennachweis"] }).success).toBe(true);
    expect(sicherungsAnfrage.safeParse({ monat: "2026-13", bereiche: ["stundennachweis"] }).success).toBe(false);
    expect(sicherungsAnfrage.safeParse({ monat: "2026-9", bereiche: ["stundennachweis"] }).success).toBe(false);
    expect(sicherungsAnfrage.safeParse({ monat: "2026-09", bereiche: [] }).success).toBe(false);
    expect(sicherungsAnfrage.safeParse({ monat: "2026-09", bereiche: ["alles-moegliche"] }).success).toBe(false);
    const a = leseAnfrage("https://x.de/api/neu/sicherung?monat=2026-09&bereiche=konkretisierung,auslagen,konkretisierung&originale=1");
    expect(a.ok && a.anfrage).toMatchObject({ monat: "2026-09", bereiche: ["konkretisierung", "auslagen"], originale: true });
    expect(leseAnfrage("https://x.de/a?monat=2026-09").ok).toBe(false);
    expect(leseAnfrage("https://x.de/a?monat=../../&bereiche=export").ok).toBe(false);
    expect(BEREICHE.map((b) => b.id)).toEqual(expect.arrayContaining(["konkretisierung", "stundennachweis", "auslagen", "firmenbelege", "export", "personalstamm", "neu-gesamt"]));
  });
  it("Sicherung nur für die Administration", () => {
    expect(darfAktion("admin", "sicherung")).toBe(true);
    for (const r of ["dispo", "buchhaltung", "lesen"] as const) expect(darfAktion(r, "sicherung"), r).toBe(false);
    expect(darfSeite("dispo", "/admin/sicherung")).toBe(false);
    expect(darfSeite("buchhaltung", "/admin/sicherung")).toBe(false);
  });
});
