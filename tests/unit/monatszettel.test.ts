import { describe, expect, it } from "vitest";
import {
  BEISPIEL_UNTERSCHRIFT, STANDARD_VORLAGE, alsStundenZeilen, beispielDaten, beispielToken, eintragMinuten, fuelleVorlage, kalenderWochen, kannAbschliessen, leererEintrag, monatListeUm, pauseAlsZeitraum,
  personenLink, pruefeEintrag, stundenMinuten, summe, tageImMonat, ueberschneidungen, waLink, wochentagIndex, wochentagKurz, zettelStatus, type MonatsEintrag, type MonatsZettel,
} from "@/preview/logic/monatszettel";
import { baueDemo } from "@/preview/data/demo";
import { nettoMinuten } from "@/preview/logic/zeit";

const e = (p: Partial<MonatsEintrag> = {}): MonatsEintrag => ({ ...leererEintrag("2026-10-05"), id: `e-${Math.random()}`, ...p });
const zettel = (p: Partial<MonatsZettel> = {}): MonatsZettel => ({
  id: "MZ-1", token: "m-abc", pnr: "1001", kunde: "Nordlicht Live GmbH", monat: "2026-10", eintraege: [], gesendetAm: null, personUnterschriftAm: null, personUnterschrift: null,
  kundeStatus: "offen", kundeAm: null, kundeName: "", kundeFunktion: "", kundeHinweis: "", kundeUnterschrift: null, inStundentabelle: false, ...p,
});

describe("Monatszettel: Kalender", () => {
  it("Wochentage stimmen (1.10.2026 war ein Donnerstag)", () => {
    expect(wochentagKurz("2026-10-01")).toBe("Do");
    expect(wochentagKurz("2026-10-05")).toBe("Mo");
    expect(wochentagKurz("2026-10-11")).toBe("So");
    expect(wochentagIndex("2024-02-29")).toBe(3);
  });
  it("Tage im Monat inklusive Schaltjahr", () => {
    expect(tageImMonat("2026-10")).toHaveLength(31);
    expect(tageImMonat("2026-02")).toHaveLength(28);
    expect(tageImMonat("2024-02")).toHaveLength(29);
    expect(tageImMonat("2026-10")[0]).toBe("2026-10-01");
  });
  it("Wochen laufen Montag bis Sonntag mit leeren Feldern davor und danach", () => {
    const w = kalenderWochen("2026-10");
    expect(w.every((x) => x.length === 7)).toBe(true);
    expect(w[0].slice(0, 3)).toEqual([null, null, null]);
    expect(w[0][3]).toBe("2026-10-01");
    expect(w.flat().filter(Boolean)).toHaveLength(31);
    expect(w).toHaveLength(5);
  });
  it("Monatsliste: letzter und laufender Monat, auch über den Jahreswechsel", () => {
    expect(monatListeUm("2026-10-09").map((m) => m.wert)).toEqual(["2026-09", "2026-10"]);
    expect(monatListeUm("2027-01-05").map((m) => m.wert)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("Monatszettel: Rechnen und Prüfen", () => {
  it("Nettostunden: Pause abgezogen, über Mitternacht gerechnet", () => {
    expect(eintragMinuten({ start: "08:00", ende: "16:30", pauseMin: 30 })).toBe(480);
    expect(eintragMinuten({ start: "22:00", ende: "06:00", pauseMin: 45 })).toBe(435);
    expect(eintragMinuten({ start: "08:00", ende: "08:30", pauseMin: 60 })).toBe(0);
  });
  it("Summe über Tage, Fahrten und Spesen", () => {
    const s = summe({ eintraege: [e({ datum: "2026-10-05" }), e({ datum: "2026-10-05", start: "18:00", ende: "20:00", pauseMin: 0 }), e({ datum: "2026-10-06", fahrten: [{ von: "A", nach: "B", km: 12.5 }, { von: "B", nach: "A", km: 12.5 }], spesen: 14.5 })] });
    expect(s.tage).toBe(2);
    expect(s.eintraege).toBe(3);
    expect(s.minuten).toBe(480 + 120 + 480);
    expect(s.stunden).toBe(18);
    expect(s.km).toBe(25);
    expect(s.fahrten).toBe(2);
    expect(s.spesen).toBe(14.5);
  });
  it("Eintrag: nur Beginn und Ende sind Pflicht, Unsinn wird erklärt", () => {
    expect(pruefeEintrag(e(), "2026-10")).toEqual([]);
    expect(pruefeEintrag(e({ start: "", ende: "" }), "2026-10")).toHaveLength(2);
    expect(pruefeEintrag(e({ start: "08:00", ende: "08:00" }), "2026-10").join(" ")).toContain("gleich");
    expect(pruefeEintrag(e({ start: "08:00", ende: "12:00", pauseMin: 300 }), "2026-10").join(" ")).toContain("Pause");
    expect(pruefeEintrag(e({ start: "06:00", ende: "23:30", pauseMin: 30 }), "2026-10").join(" ")).toContain("16 Stunden");
    expect(pruefeEintrag(e({ datum: "2026-09-30" }), "2026-10").join(" ")).toContain("nicht in diesem Monat");
    expect(pruefeEintrag(e({ fahrten: [{ von: "", nach: "", km: 10 }] }), "2026-10").join(" ")).toContain("Start und Ziel");
    expect(pruefeEintrag(e({ spesen: -3 }), "2026-10").join(" ")).toContain("Spesen");
    // alles Freiwillige darf leer bleiben
    expect(pruefeEintrag(e({ taetigkeit: "", getan: "", sonderabsprache: "", notiz: "", fahrten: [], spesen: null }), "2026-10")).toEqual([]);
  });
  it("Überschneidungen am selben Tag werden gemeldet, nebeneinander ist erlaubt", () => {
    expect(ueberschneidungen([e({ start: "08:00", ende: "12:00" }), e({ start: "13:00", ende: "17:00" })])).toEqual([]);
    expect(ueberschneidungen([e({ start: "08:00", ende: "12:00" }), e({ start: "11:00", ende: "17:00" })])).toHaveLength(1);
    expect(ueberschneidungen([e({ datum: "2026-10-05", start: "08:00", ende: "12:00" }), e({ datum: "2026-10-06", start: "09:00", ende: "11:00" })])).toEqual([]);
  });
  it("Abschließen geht nur mit mindestens einem sauberen Eintrag", () => {
    expect(kannAbschliessen(zettel()).ok).toBe(false);
    expect(kannAbschliessen(zettel({ eintraege: [e()] })).ok).toBe(true);
    const schlecht = kannAbschliessen(zettel({ eintraege: [e({ start: "" })] }));
    expect(schlecht.ok).toBe(false);
    expect(schlecht.gruende[0]).toContain("05.10.2026");
  });
});

describe("Monatszettel: Stand", () => {
  it("von leer bis fertig", () => {
    expect(zettelStatus(zettel())).toBe("leer");
    expect(zettelStatus(zettel({ eintraege: [e()] }))).toBe("in_arbeit");
    expect(zettelStatus(zettel({ eintraege: [e()], personUnterschriftAm: "2026-10-31T10:00:00Z" }))).toBe("wartet_kunde");
    expect(zettelStatus(zettel({ eintraege: [e()], personUnterschriftAm: "2026-10-31T10:00:00Z", kundeStatus: "unterschrieben" }))).toBe("fertig");
    // zurückgegeben: die Person muss neu unterschreiben
    expect(zettelStatus(zettel({ eintraege: [e()], kundeStatus: "zurueckgegeben", personUnterschriftAm: null }))).toBe("zurueck");
    expect(zettelStatus(zettel({ eintraege: [e()], kundeStatus: "zurueckgegeben", personUnterschriftAm: "2026-11-02T10:00:00Z" }))).toBe("wartet_kunde");
  });
});

describe("Monatszettel: Anzeige", () => {
  it("Stunden:Minuten für den Kalender", () => {
    expect(stundenMinuten(465)).toBe("7:45");
    expect(stundenMinuten(480)).toBe("8:00");
    expect(stundenMinuten(5)).toBe("0:05");
  });
  it("die Beispiel-Unterschrift ist ein SVG zum Anzeigen", () => {
    expect(BEISPIEL_UNTERSCHRIFT.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });
});

describe("Monatszettel: Nachricht und Links", () => {
  it("Platzhalter werden gefüllt", () => {
    const t = fuelleVorlage(STANDARD_VORLAGE, { vorname: "Anna", kunde: "Nordlicht Live GmbH", monat: "Oktober 2026", link: personenLink("m-abc") });
    expect(t).toContain("Hallo Anna");
    expect(t).toContain("Nordlicht Live GmbH im Oktober 2026");
    expect(t).toContain("https://app.fess.jobs/m/m-abc");
    expect(t).not.toMatch(/\{\w+\}/);
  });
  it("WhatsApp-Link mit deutscher Nummer", () => {
    expect(waLink("0151 1234 5678", "Hallo Welt")).toBe("https://wa.me/4915112345678?text=Hallo%20Welt");
    expect(waLink("+49 151 1234567", "x")).toContain("wa.me/491511234567");
  });
  it("Tokens sind lang, eindeutig je Zähler und ohne Sonderzeichen", () => {
    const a = beispielToken("m", 1);
    expect(a).toMatch(/^m-[a-z2-9]{10}$/);
    expect(beispielToken("m", 2)).not.toBe(a);
    expect(beispielToken("m", 1)).toBe(a);
  });
});

describe("Monatszettel: Übernahme in die Stundentabelle", () => {
  it("Pause wird als Zeitraum in die Tagesmitte gelegt und stimmt mit den Nettominuten überein", () => {
    const p = pauseAlsZeitraum("08:00", "16:30", 30);
    expect(p).toHaveLength(1);
    expect(nettoMinuten("08:00", "16:30", p)).toBe(480);
    expect(pauseAlsZeitraum("08:00", "16:00", 0)).toEqual([]);
    const nacht = pauseAlsZeitraum("22:00", "06:00", 45);
    expect(nettoMinuten("22:00", "06:00", nacht)).toBe(435);
  });
  it("jede Zeile wird eine Stundenzeile mit Verweis auf den Zettel", () => {
    const z = zettel({ eintraege: [e({ datum: "2026-10-06", taetigkeit: "Stagehand", sonderabsprache: "früher Feierabend", getan: "Aufbau", spesen: 14, fahrten: [{ von: "A", nach: "B", km: 20 }], privatPkw: true }), e({ datum: "2026-10-05" })] });
    const zeilen = alsStundenZeilen(z);
    expect(zeilen.map((r) => r.datum)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(zeilen[1]).toMatchObject({ pnr: "1001", kunde: "Nordlicht Live GmbH", auftrag: "Monatszettel 2026-10", spesen: 14, reiseKm: 20, status: "offen", quelle: "App", sourceRef: "Monatszettel MZ-1" });
    expect(zeilen[1].bemerkung).toContain("Absprache: früher Feierabend");
    expect(zeilen[1].bemerkung).toContain("Getan: Aufbau");
    expect(new Set(zeilen.map((r) => r.id)).size).toBe(2);
    // ohne privaten PKW keine Reisekilometer
    expect(alsStundenZeilen(zettel({ eintraege: [e({ fahrten: [{ von: "A", nach: "B", km: 20 }], privatPkw: false })] }))[0].reiseKm).toBe(0);
  });
});

describe("Monatszettel: Beispieldaten", () => {
  it("drei Personen bei einem Kunden in drei Zuständen und ein Kundenlink", () => {
    const d = baueDemo();
    const b = beispielDaten([...d.crew, d.self], "2026-10-09");
    expect(b.zettel).toHaveLength(3);
    expect(b.zettel.map(zettelStatus)).toEqual(["wartet_kunde", "in_arbeit", "leer"]);
    expect(b.kunden).toHaveLength(1);
    expect(b.zettel.every((z) => z.monat === "2026-10" && z.kunde === b.kunden[0].kunde)).toBe(true);
    expect(new Set(b.zettel.map((z) => z.token)).size).toBe(3);
    // nur Arbeitstage bis heute, alles prüfbar
    expect(kannAbschliessen(b.zettel[0]).ok).toBe(true);
    expect(b.zettel[0].eintraege.every((x) => x.datum <= "2026-10-09" && wochentagIndex(x.datum) < 5)).toBe(true);
  });
});
