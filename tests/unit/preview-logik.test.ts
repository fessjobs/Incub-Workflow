import { describe, expect, it } from "vitest";
import { ablaufDatum, erinnerungAm, fehlendeModule, istGueltig, mischen, pflichtModule, quizBestanden, statusFuer } from "@/preview/logic/unterweisung";
import { BELEGARTEN, BELEG_BEZEICHNUNG, BEIBLATT_VORLAGEN, beiblattText, belegAbweichungen, belegDateiNameOk, simuliereAuslesung } from "@/preview/logic/beleg";
import { DEFAULT_EXPORT, DEFAULT_LOHNARTEN, excelCsv, exportZeilen, pruefbericht, zvooveCsv, EXCEL_KOPF } from "@/preview/logic/export";
import { distanzKm, fahrminuten, geocodePlz, naechsterPool, poolZeiten } from "@/preview/logic/geo";
import { crewKategorie, fahrgemeinschaftsVorschlaege, passung, schichtStunden } from "@/preview/logic/passung";
import { pruefeZeilen, zaehleWarnungen } from "@/preview/logic/stunden";
import { baueDemo, DEMO_HEUTE } from "@/preview/data/demo";
import { MODULE, modulById } from "@/preview/data/trainings";
import type { Contract, Crew, Job, StundenRow } from "@/preview/logic/types";
import { MODUL_IDS } from "@/preview/logic/unterweisung";
import { gesamtzeit } from "@/preview/logic/zeit";

describe("Gültigkeit der Unterweisungen", () => {
  it("12 Monate gültig, ohne Überlauf am Monatsende", () => {
    expect(ablaufDatum("2025-10-20")).toBe("2026-10-20");
    expect(ablaufDatum("2024-02-29")).toBe("2025-02-28");
  });

  it("Status: fehlt, gültig, läuft in 14 Tagen ab, abgelaufen", () => {
    const heute = "2026-10-09";
    expect(statusFuer(undefined, heute)).toBe("fehlt");
    expect(statusFuer({ version: "1", bestaetigtAm: "2026-03-12", quizScore: 1 }, heute)).toBe("gueltig");
    expect(statusFuer({ version: "1", bestaetigtAm: "2025-10-23", quizScore: 1 }, heute)).toBe("laeuftBaldAb"); // läuft am 23.10. ab
    expect(statusFuer({ version: "1", bestaetigtAm: "2025-10-24", quizScore: 1 }, heute)).toBe("gueltig"); // 15 Tage
    expect(statusFuer({ version: "1", bestaetigtAm: "2025-10-08", quizScore: 1 }, heute)).toBe("abgelaufen");
    expect(statusFuer({ version: "1", bestaetigtAm: "2025-10-09", quizScore: 1 }, heute)).toBe("laeuftBaldAb"); // heute letzter Tag
  });

  it("die Erinnerung kommt 14 Tage vor Ablauf", () => {
    expect(erinnerungAm("2025-10-20")).toBe("2026-10-06");
  });

  it("gültig heißt: gültig oder läuft bald ab", () => {
    expect(istGueltig({ version: "1", bestaetigtAm: "2026-03-12", quizScore: 1 }, "2026-10-09")).toBe(true);
    expect(istGueltig({ version: "1", bestaetigtAm: "2025-10-23", quizScore: 1 }, "2026-10-09")).toBe(true);
    expect(istGueltig({ version: "1", bestaetigtAm: "2025-01-01", quizScore: 1 }, "2026-10-09")).toBe(false);
  });

  it("Pflichtmodule je Tätigkeit: Grund und Brandschutz immer, Höhe nur auf Wunsch des Auftrags", () => {
    expect(pflichtModule(["Stagehand"])).toEqual(["grund", "stagehand", "elektrik", "brandschutz"]);
    expect(pflichtModule(["Catering"])).toEqual(["grund", "catering", "brandschutz"]);
    expect(pflichtModule(["Stapler"])).toContain("stapler");
    expect(pflichtModule(["Promotion"])).toEqual(["grund", "brandschutz"]);
    expect(pflichtModule(["Stagehand"], { hoehe: true })).toContain("hoehe");
    expect(pflichtModule(["Stagehand"])).not.toContain("hoehe");
  });

  it("fehlende Module = Pflicht ohne gültigen Nachweis", () => {
    const acks = { grund: { version: "1", bestaetigtAm: "2026-03-12", quizScore: 1 }, stagehand: { version: "1", bestaetigtAm: "2024-01-01", quizScore: 1 } };
    expect(fehlendeModule(pflichtModule(["Stagehand"]), acks, "2026-10-09")).toEqual(["stagehand", "elektrik", "brandschutz"]);
  });

  it("Quiz: bestanden ab 80 %", () => {
    expect(quizBestanden(4, 5)).toBe(true);
    expect(quizBestanden(3, 5)).toBe(false);
    expect(quizBestanden(5, 5)).toBe(true);
    expect(quizBestanden(0, 0)).toBe(false);
  });

  it("Mischen ist reproduzierbar und verliert nichts", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(mischen(a, 42)).toEqual(mischen(a, 42));
    expect([...mischen(a, 42)].sort()).toEqual(a);
    expect(mischen(a, 1)).not.toEqual(mischen(a, 2));
    expect(a).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("Unterweisungs-Inhalte", () => {
  it("alle acht Module gibt es, zweisprachig, mit vier Karten und fünf Quizfragen", () => {
    expect(MODULE.map((m) => m.id).sort()).toEqual([...MODUL_IDS].sort());
    for (const m of MODULE) {
      expect(m.karten, m.id).toHaveLength(4);
      expect(m.quiz, m.id).toHaveLength(5);
      expect(m.titel.de && m.titel.en).toBeTruthy();
      for (const k of m.karten) expect(k.titel.de && k.titel.en && k.text.de && k.text.en, `${m.id}/${k.titel.de}`).toBeTruthy();
    }
  });

  it("jede Quizfrage hat genau eine richtige Antwort und verweist auf eine vorhandene Karte", () => {
    for (const m of MODULE) {
      for (const q of m.quiz) {
        expect(q.optionen.filter((o) => o.richtig), `${m.id}: ${q.frage.de}`).toHaveLength(1);
        expect(q.optionen.length).toBe(3);
        expect(q.karte).toBeGreaterThanOrEqual(0);
        expect(q.karte).toBeLessThan(m.karten.length);
        for (const o of q.optionen) expect(o.text.de && o.text.en).toBeTruthy();
      }
    }
  });

  it("die richtige Antwort steht nicht immer an derselben Stelle", () => {
    const positionen = new Set<number>();
    for (const m of MODULE) for (const q of m.quiz) positionen.add(q.optionen.findIndex((o) => o.richtig));
    expect(positionen.size).toBe(3);
  });

  it("Stapler und Einlass tragen den Hinweis auf Fahrausweis bzw. § 34a", () => {
    expect(modulById("stapler")?.hinweis?.de).toMatch(/Fahrausweis/);
    expect(modulById("einlass")?.hinweis?.de).toMatch(/34a/);
  });
});

describe("Beleg-Link", () => {
  it("jede Belegart hat ein Beiblatt mit allen Platzhaltern", () => {
    expect(BELEGARTEN).toHaveLength(7);
    for (const art of BELEGARTEN) {
      const v = BEIBLATT_VORLAGEN[art];
      for (const p of ["{auftrag_id}", "{kunde}", "{ort}", "{datum}", "{mitarbeiter}", "{zweck}"]) expect(v, art).toContain(p);
    }
  });

  it("Platzhalter werden ersetzt, leere Werte bleiben sichtbar leer", () => {
    const t = beiblattText(BEIBLATT_VORLAGEN.Tanken, { auftrag_id: "FESS-2026-0142", kunde: "Nordlicht", ort: "Stuttgart", datum: "09.10.2026", mitarbeiter: "Mara Beispiel", zweck: "" });
    expect(t).toContain("FESS-2026-0142");
    expect(t).toContain("Zweck: –.");
    expect(t).not.toMatch(/[{}]/);
  });

  it("Abweichungen zwischen Eingabe und Auslesung werden erkannt", () => {
    const gelesen = { betrag: 42.5, datum: "2026-10-09", haendler: "Aral Tankstelle" };
    expect(belegAbweichungen({ betrag: 42.5, datum: "2026-10-09", haendler: "Aral" }, gelesen)).toEqual([]);
    expect(belegAbweichungen({ betrag: 42.0, datum: "2026-10-09", haendler: "" }, gelesen).map((a) => a.feld)).toEqual(["betrag"]);
    expect(belegAbweichungen({ betrag: 42.5, datum: "2026-10-08", haendler: "Shell" }, gelesen).map((a) => a.feld)).toEqual(["datum", "haendler"]);
    expect(belegAbweichungen({ betrag: null, datum: "", haendler: "" }, gelesen).map((a) => a.feld)).toEqual(["betrag"]);
  });

  it("die simulierte Auslesung ist für denselben Dateinamen stabil", () => {
    expect(simuliereAuslesung("tank.jpg", "Tanken", "2026-10-09")).toEqual(simuliereAuslesung("tank.jpg", "Tanken", "2026-10-09"));
  });

  it("nur Foto- und PDF-Dateien werden angenommen", () => {
    expect(belegDateiNameOk("beleg.JPG")).toBe(true);
    expect(belegDateiNameOk("beleg.pdf")).toBe(true);
    expect(belegDateiNameOk("beleg.exe")).toBe(false);
  });
});

function sRow(p: Partial<StundenRow> & { id: string }): StundenRow {
  return { datum: "2026-10-05", pnr: "P1", start: "07:00", pausen: [{ von: "11:00", bis: "11:30" }], ende: "15:30", pauschale: 0, kunde: "K", auftrag: "A1", spesen: 0, reiseKm: 0, reiseGesch: 0, bonus: 0, abzug: 0, bemerkung: "", status: "freigegeben", quelle: "Zettel", sourceRef: null, ...p };
}

describe("Export", () => {
  const taet = () => "Stagehand";

  it("Arbeitszeit, Garantie-Aufstockung, Spesen, km × Satz, Bonus und Abzug werden getrennte Zeilen", () => {
    const { zeilen } = exportZeilen([sRow({ id: "r1", start: "09:00", ende: "11:00", pausen: [], pauschale: 4, spesen: 14, reiseKm: 50, reiseGesch: 25, bonus: 20, abzug: 10 })], taet, { ...DEFAULT_EXPORT, lohnarten: DEFAULT_LOHNARTEN.map((l) => (l.lohnart ? l : { ...l, lohnart: "210" })) });
    expect(zeilen.map((z) => z.lohnart)).toEqual(["100", "100", "800", "700", "701", "210", "900"]);
    expect(zeilen[0].stunden).toBe(2);
    expect(zeilen[1].stunden).toBe(2); // 4 h Garantie − 2 h gearbeitet
    expect(zeilen[3].betrag).toBe(15); // 50 km × 0,30 €
    expect(zeilen[6].betrag).toBe(-10);
  });

  it("keine Garantie-Zeile, wenn mehr als die Pauschale gearbeitet wurde", () => {
    const { zeilen } = exportZeilen([sRow({ id: "r1", pauschale: 4 })], taet, DEFAULT_EXPORT);
    expect(zeilen).toHaveLength(1);
  });

  it("der km-Satz kommt aus den Einstellungen", () => {
    const { zeilen } = exportZeilen([sRow({ id: "r1", reiseKm: 100 })], taet, { ...DEFAULT_EXPORT, kmSatzPrivat: 0.38 });
    expect(zeilen.find((z) => z.lohnart === "700")?.betrag).toBe(38);
  });

  it("nicht abgestimmte Lohnarten (Bonus) landen im Prüfbericht statt stillschweigend im Export", () => {
    const { probleme } = exportZeilen([sRow({ id: "r1", bonus: 50 })], taet, DEFAULT_EXPORT);
    expect(probleme).toHaveLength(1);
    expect(probleme[0].text).toMatch(/Bonus.*nicht abgestimmt/);
  });

  it("zvoove-CSV: Semikolon, Dezimalkomma, Datum TT.MM.JJJJ, Kopfzeile, CRLF", () => {
    const { zeilen } = exportZeilen([sRow({ id: "r1" })], taet, DEFAULT_EXPORT);
    const csv = zvooveCsv(zeilen);
    const [kopf, zeile] = csv.split("\r\n");
    expect(kopf).toBe("Personalnummer;Datum;Lohnart;Stunden;Kunde;Auftrag;Tätigkeit;Betrag;Bemerkung");
    expect(zeile).toBe("P1;05.10.2026;100;8,00;K;A1;Stagehand;;");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("Felder mit Trennzeichen werden maskiert", () => {
    const { zeilen } = exportZeilen([sRow({ id: "r1", bemerkung: "a;b" })], taet, DEFAULT_EXPORT);
    expect(zvooveCsv(zeilen)).toContain('"a;b"');
  });

  it("Excel hat die 18 Spalten des Plans, weitere Pausen hängen an der Bemerkung", () => {
    expect(EXCEL_KOPF).toHaveLength(18);
    const crew = new Map([["P1", { vorname: "Mara", nachname: "Beispiel" } as Crew]]);
    const csv = excelCsv([sRow({ id: "r1", pausen: [{ von: "10:00", bis: "10:15" }, { von: "13:00", bis: "13:30" }] })], crew);
    const zeile = csv.split("\r\n")[1].split(";");
    expect(zeile).toHaveLength(18);
    expect(zeile[2]).toBe("Mara");
    expect(zeile[8]).toBe("7,75"); // 8,5 h brutto − 45 min Pause
    expect(zeile[17]).toBe("Pause 13:00–13:30");
  });

  it("der Prüfbericht zählt exportierbare Zeilen, Fehler und Warnungen", () => {
    const rows = [sRow({ id: "a" }), sRow({ id: "b", status: "offen" }), sRow({ id: "c" })];
    const warn = new Map([["c", [{ code: "doppelt", level: "fehler" as const, text: "x" }]], ["a", [{ code: "ueber10", level: "warnung" as const, text: "y" }]]]);
    expect(pruefbericht(rows, warn, [])).toMatchObject({ zeilenGesamt: 3, exportierbar: 1, ohneFreigabe: 1, mitFehler: 1, warnungen: 1 });
  });
});

describe("Geo und Pools", () => {
  it("PLZ → Ort, mit Sonderfall Idar-Oberstein", () => {
    expect(geocodePlz("70173")?.name).toBe("Stuttgart");
    expect(geocodePlz("55743")?.name).toBe("Idar-Oberstein");
    expect(geocodePlz("55116")?.name).toBe("Mainz");
    expect(geocodePlz("123")).toBeNull();
    expect(geocodePlz("01234")).toBeNull();
  });

  it("Entfernungen sind plausibel", () => {
    const s = geocodePlz("70173")!;
    const m = geocodePlz("68159")!;
    expect(distanzKm(s, m)).toBeGreaterThan(80);
    expect(distanzKm(s, m)).toBeLessThan(110);
    expect(fahrminuten(s, geocodePlz("73033")!)).toBeLessThan(45);
    expect(fahrminuten(s, m)).toBeGreaterThan(fahrminuten(s, geocodePlz("73033")!));
  });

  it("der nächste Pool wird zugeordnet", () => {
    expect(naechsterPool(geocodePlz("73033")!).pool).toBe("Stuttgart");
    expect(naechsterPool(geocodePlz("69115")!).pool).toBe("Mannheim");
    expect(naechsterPool(geocodePlz("63065")!).pool).toBe("Frankfurt");
    expect(naechsterPool(geocodePlz("55743")!).pool).toBe("Idar-Oberstein");
    expect(naechsterPool(geocodePlz("44135")!).pool).toBe("NRW");
  });

  it("die Fahrzeit zu allen fünf Pools wird einmal berechnet", () => {
    expect(Object.keys(poolZeiten(geocodePlz("70173")!)).sort()).toEqual(["Frankfurt", "Idar-Oberstein", "Mannheim", "NRW", "Stuttgart"]);
  });
});

const VERTRAG: Contract = { vertragsart: "Minijob", wochenstunden: 10, monatsgrenzeStd: 40, monatsgrenzeEur: 603, stundenlohn: 14, gueltigVon: "2026-01-01", gueltigBis: null, docusignId: "D" };

describe("Passung und Konflikte (Disposition)", () => {
  const demo = baueDemo();
  const job = demo.jobs[0];
  const schicht = job.schichten[0];
  const ctx = { heute: DEMO_HEUTE, bestehende: [], monatsStunden: 0 };

  function crewMit(p: Partial<Crew>): Crew {
    return { ...demo.crew.find((c) => c.profile && c.status === "aktiv")!, ...p };
  }

  it("liefert Score 0..100, Kategorie und Chips", () => {
    const r = passung(demo.crew[0], job, schicht, ctx);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(["A", "B", "C"]).toContain(r.kategorie);
    expect(r.chips.length).toBeGreaterThan(2);
  });

  it("wer näher wohnt und gültige Unterweisungen hat, passt besser", () => {
    const nah = crewMit({ plz: "70173", unterweisungen: { grund: { version: "1", bestaetigtAm: "2026-06-01", quizScore: 1 }, brandschutz: { version: "1", bestaetigtAm: "2026-06-01", quizScore: 1 }, stagehand: { version: "1", bestaetigtAm: "2026-06-01", quizScore: 1 }, elektrik: { version: "1", bestaetigtAm: "2026-06-01", quizScore: 1 } }, contract: VERTRAG });
    const fern = crewMit({ plz: "50667", unterweisungen: {}, contract: VERTRAG });
    const a = passung(nah, job, schicht, ctx);
    const b = passung(fern, job, schicht, ctx);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.konflikte.map((k) => k.code)).not.toContain("unterweisung");
    expect(b.konflikte.map((k) => k.code)).toContain("unterweisung");
    expect(a.chips.some((c) => c.text === "Unterweisung gültig")).toBe(true);
  });

  it("doppelt gebucht ist ein schwerer Konflikt und verlangt eine Begründung", () => {
    const c = crewMit({ contract: VERTRAG });
    const r = passung(c, job, schicht, { ...ctx, bestehende: [{ datum: schicht.datum, start: "12:00", ende: "20:00", auftrag: "FESS-2026-0099" }] });
    const k = r.konflikte.find((x) => x.code === "doppelt");
    expect(k?.schwer).toBe(true);
    expect(r.braucht_begruendung).toBe(true);
  });

  it("Ruhezeit unter 11 Stunden zum letzten Einsatz", () => {
    const c = crewMit({ contract: VERTRAG });
    const r = passung(c, job, schicht, { ...ctx, bestehende: [{ datum: schicht.datum, start: "00:00", ende: "03:00", auftrag: "FESS-2026-0099" }] });
    expect(r.konflikte.map((k) => k.code)).toContain("ruhezeit");
  });

  it("kein gültiger Vertrag und abgelaufener Vertrag sind Konflikte", () => {
    expect(passung(crewMit({ contract: null }), job, schicht, ctx).konflikte.find((k) => k.code === "vertrag")?.schwer).toBe(true);
    expect(passung(crewMit({ contract: { ...VERTRAG, gueltigBis: "2026-09-30" } }), job, schicht, ctx).konflikte.find((k) => k.code === "vertrag")?.schwer).toBe(true);
  });

  it("die Monatsgrenze wird gewarnt, wenn die Schicht sie reißt", () => {
    const c = crewMit({ contract: VERTRAG });
    expect(passung(c, job, schicht, { ...ctx, monatsStunden: 38 }).konflikte.map((k) => k.code)).toContain("grenze");
    expect(passung(c, job, schicht, { ...ctx, monatsStunden: 0 }).konflikte.map((k) => k.code)).not.toContain("grenze");
  });

  it("ohne Konflikte braucht das Einplanen keine Begründung", () => {
    const c = crewMit({ plz: "70173", contract: VERTRAG, unterweisungen: Object.fromEntries(["grund", "brandschutz", "stagehand", "elektrik"].map((m) => [m, { version: "1", bestaetigtAm: "2026-06-01", quizScore: 1 }])) });
    const r = passung(c, job, schicht, ctx);
    expect(r.konflikte).toEqual([]);
    expect(r.braucht_begruendung).toBe(false);
  });

  it("Schichtlänge über Mitternacht", () => {
    expect(schichtStunden({ ...schicht, start: "23:30", ende: "04:00" })).toBe(4.5);
  });

  it("Kategorie ohne Profil ist C", () => {
    expect(crewKategorie({ ...demo.crew[0], profile: null })).toBe("C");
  });

  it("Fahrgemeinschaften: nah beieinander und mindestens ein Auto", () => {
    const a = crewMit({ id: "x1", plz: "70173", profile: { ...demo.crew[0].profile!, eigenesAuto: true } });
    const b = crewMit({ id: "x2", plz: "70563", profile: { ...demo.crew[0].profile!, eigenesAuto: false } });
    const c = crewMit({ id: "x3", plz: "50667", profile: { ...demo.crew[0].profile!, eigenesAuto: true } });
    const v = fahrgemeinschaftsVorschlaege([a, b, c]);
    expect(v).toHaveLength(1);
    expect([v[0].a.id, v[0].b.id].sort()).toEqual(["x1", "x2"]);
  });
});

describe("Belegbezeichnungen", () => {
  it("jede Belegart hat einen lesbaren Namen", () => {
    for (const a of BELEGARTEN) expect(BELEG_BEZEICHNUNG[a]).toBeTruthy();
    expect(BELEG_BEZEICHNUNG.Tanken).toBe("Tankbeleg");
  });
});

describe("Beispieldaten", () => {
  const demo = baueDemo();

  it("sind deterministisch", () => {
    expect(baueDemo().stunden.map((r) => r.id)).toEqual(demo.stunden.map((r) => r.id));
    expect(baueDemo().crew[3]).toEqual(demo.crew[3]);
  });

  it("reichen für den Belastungstest: über 1.000 Stundenzeilen, 120 Crew, 8 Aufträge", () => {
    expect(demo.stunden.length).toBeGreaterThan(1000);
    expect(demo.crew).toHaveLength(120);
    expect(demo.jobs).toHaveLength(8);
    expect(demo.bewerbungen.length).toBeGreaterThan(60);
  });

  it("Namen kommen nicht doppelt vor", () => {
    const namen = demo.crew.map((c) => `${c.vorname} ${c.nachname}`);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it("Stunden passen zu den Verträgen: die meisten Minijobber liegen unter der Grenze", () => {
    const rows = demo.stunden.filter((r) => r.datum.startsWith("2026-09"));
    const minijobber = demo.crew.filter((c) => c.status === "aktiv" && c.contract?.vertragsart === "Minijob");
    let drueber = 0;
    for (const c of minijobber) {
      const std = rows.filter((r) => r.pnr === c.pnr).reduce((n, r) => n + Math.max(gesamtzeit(r.start, r.ende, r.pausen), r.pauschale), 0);
      if (c.contract && c.contract.monatsgrenzeStd !== null && std > c.contract.monatsgrenzeStd) drueber++;
    }
    expect(drueber / minijobber.length).toBeLessThan(0.35);
  });

  it("Personalnummern und IDs sind eindeutig", () => {
    expect(new Set(demo.crew.map((c) => c.pnr)).size).toBe(demo.crew.length);
    expect(new Set(demo.stunden.map((r) => r.id)).size).toBe(demo.stunden.length);
  });

  it("zeigen jede Warnart der Plausibilitätsprüfung mindestens einmal", () => {
    const ctx = { personen: new Map(demo.crew.map((c) => [c.pnr, { vertraege: c.contract ? [c.contract] : [] }])) };
    const w = pruefeZeilen(demo.stunden, ctx);
    const codes = new Set([...w.values()].flat().map((x) => x.code));
    for (const code of ["doppelt", "pause_fehlt", "ueber10", "pnr", "vertrag"]) expect(codes.has(code), code).toBe(true);
    const z = zaehleWarnungen(w);
    expect(z.zeilenMitFehler).toBeGreaterThan(0);
    expect(z.zeilenMitFehler).toBeLessThan(demo.stunden.length * 0.2); // Auffälligkeiten sind die Ausnahme
  });

  it("alle Zeilen verweisen auf bekannte Aufträge, Status folgen dem Datum", () => {
    const ids = new Set(demo.auftraege.map((a) => a.id));
    for (const r of demo.stunden) expect(ids.has(r.auftrag), r.auftrag).toBe(true);
    expect(demo.stunden.filter((r) => r.datum < "2026-10-01").every((r) => r.status === "exportiert")).toBe(true);
  });

  it("enthalten gültige, bald ablaufende und abgelaufene Unterweisungen und Verträge", () => {
    const stati = new Set<string>();
    for (const c of demo.crew) for (const a of Object.values(c.unterweisungen)) stati.add(statusFuer(a, DEMO_HEUTE));
    expect([...stati].sort()).toEqual(["abgelaufen", "gueltig", "laeuftBaldAb"]);
    expect(demo.crew.some((c) => c.contract?.gueltigBis === "2026-09-30")).toBe(true);
  });

  it("die Person der Crew-Seite startet ohne Profil und ohne Unterweisung", () => {
    expect(demo.self.profile).toBeNull();
    expect(Object.keys(demo.self.unterweisungen)).toHaveLength(0);
  });

  it("keine echten Kontaktdaten: Mails und Nummern sind erkennbar Beispiel", () => {
    for (const c of demo.crew) {
      expect(c.email).toMatch(/@beispiel\.invalid$/);
      expect(c.telefon).toMatch(/^0151 0000 /);
    }
  });

  it("jede Schicht hat einen Bedarf und liegt im Zeitraum des Auftrags", () => {
    for (const j of demo.jobs as Job[]) {
      expect(j.schichten.length).toBeGreaterThan(0);
      for (const s of j.schichten) {
        expect(s.bedarf).toBeGreaterThan(0);
        expect(s.datum >= j.datumVon && s.datum <= j.datumBis).toBe(true);
      }
    }
  });
});
