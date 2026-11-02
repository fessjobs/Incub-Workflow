import { describe, expect, it } from "vitest";
import {
  EintragSchema, STANDARD_VORLAGE, TageSchema, bruttoMinuten, datumAnzeige, eintragMinuten, eintragNotiz, endeDatum, formatStunden, fuelleVorlage, istMonat, kalenderWochen, kannAbschliessen, kundenNachricht, monatErsterTag, monatLetzterTag,
  monatsAuswahl, monatsName, neuerEintragId, pruefeEintrag, schichtBezeichnung, sortiert, stundenDezimal, stundenMinuten, summe, tageImMonat, ueberschneidungen, waLinkAn, waNummer, wochentagIndex, wochentagKurz, zettelStand,
  type MonatsEintrag,
} from "@/lib/einsatz/monatszettel";

const e = (p: Partial<MonatsEintrag> = {}): MonatsEintrag => ({ id: neuerEintragId(), datum: "2026-10-05", start: "08:00", ende: "16:30", pauseMin: 30, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "", ...p });

describe("Monatszettel (Einsatzmodul): Monat und Kalender", () => {
  it("Monat prüfen, benennen, erster und letzter Tag", () => {
    expect(istMonat("2026-10")).toBe(true);
    for (const x of ["2026-13", "2026-00", "26-10", "2026-1", "2026-10-01", ""]) expect(istMonat(x), x).toBe(false);
    expect(monatsName("2026-10")).toBe("Oktober 2026");
    expect(monatErsterTag("2026-10")).toBe("2026-10-01");
    expect(monatLetzterTag("2026-10")).toBe("2026-10-31");
    expect(monatLetzterTag("2026-02")).toBe("2026-02-28");
    expect(monatLetzterTag("2024-02")).toBe("2024-02-29");
  });
  it("Wochentage (1.10.2026 war ein Donnerstag) und Kalenderwochen Montag bis Sonntag", () => {
    expect(wochentagKurz("2026-10-01")).toBe("Do");
    expect(wochentagKurz("2026-10-05")).toBe("Mo");
    expect(wochentagKurz("2026-10-11")).toBe("So");
    expect(wochentagIndex("2026-10-04")).toBe(6);
    expect(datumAnzeige("2026-10-05")).toBe("Mo, 05.10.2026");
    expect(tageImMonat("2026-10")).toHaveLength(31);
    const w = kalenderWochen("2026-10");
    expect(w.every((x) => x.length === 7)).toBe(true);
    expect(w[0].slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(w.flat().filter(Boolean)).toHaveLength(31);
    // Der 1. fällt auf einen Montag: keine leeren Felder davor
    expect(kalenderWochen("2026-06")[0][0]).toBe("2026-06-01");
  });
  it("Auswahl: letzter und laufender Monat, auch über den Jahreswechsel", () => {
    expect(monatsAuswahl("2026-10-09").map((m) => m.wert)).toEqual(["2026-09", "2026-10"]);
    expect(monatsAuswahl("2027-01-05").map((m) => m.wert)).toEqual(["2026-12", "2027-01"]);
    expect(monatsAuswahl("2026-10-09")[1].label).toBe("Oktober 2026 (laufend)");
  });
});

describe("Monatszettel (Einsatzmodul): Rechnen", () => {
  it("Brutto, Pause und Nettostunden – auch über Mitternacht", () => {
    expect(bruttoMinuten("08:00", "16:30")).toBe(510);
    expect(bruttoMinuten("22:00", "06:00")).toBe(480);
    expect(bruttoMinuten("", "06:00")).toBe(0);
    expect(eintragMinuten({ start: "08:00", ende: "16:30", pauseMin: 30 })).toBe(480);
    expect(eintragMinuten({ start: "22:00", ende: "06:00", pauseMin: 45 })).toBe(435);
    expect(eintragMinuten({ start: "08:00", ende: "08:30", pauseMin: 60 })).toBe(0);
    expect(stundenDezimal(435)).toBe(7.25);
    expect(formatStunden(7.25)).toBe("7,25");
    expect(stundenMinuten(465)).toBe("7:45");
  });
  it("Summe über Tage, Fahrten, Kilometer und Spesen", () => {
    const s = summe([
      e({ datum: "2026-10-05" }),
      e({ datum: "2026-10-05", start: "18:00", ende: "20:00", pauseMin: 0 }),
      e({ datum: "2026-10-06", fahrten: [{ von: "A", nach: "B", km: 12.5 }, { von: "B", nach: "A", km: 12.5 }], spesen: 14.5 }),
    ]);
    expect(s).toEqual({ tage: 2, eintraege: 3, minuten: 1080, stunden: 18, km: 25, fahrten: 2, spesen: 14.5 });
    expect(sortiert([e({ datum: "2026-10-06" }), e({ datum: "2026-10-05", start: "18:00" }), e({ datum: "2026-10-05", start: "07:00" })]).map((x) => `${x.datum} ${x.start}`)).toEqual(["2026-10-05 07:00", "2026-10-05 18:00", "2026-10-06 08:00"]);
  });
  it("Über Mitternacht endet der Eintrag am Folgetag", () => {
    expect(endeDatum("2026-10-05", "22:00", "06:00")).toBe("2026-10-06");
    expect(endeDatum("2026-10-31", "22:00", "06:00")).toBe("2026-11-01");
    expect(endeDatum("2026-10-05", "08:00", "16:00")).toBe("2026-10-05");
  });
});

describe("Monatszettel (Einsatzmodul): Prüfen", () => {
  it("nur Beginn und Ende sind Pflicht, Unsinn wird erklärt", () => {
    expect(pruefeEintrag(e(), "2026-10")).toEqual([]);
    expect(pruefeEintrag(e({ start: "", ende: "" }), "2026-10")).toHaveLength(2);
    expect(pruefeEintrag(e({ start: "08:00", ende: "08:00" }), "2026-10").join(" ")).toContain("gleich");
    expect(pruefeEintrag(e({ start: "08:00", ende: "12:00", pauseMin: 240 }), "2026-10").join(" ")).toContain("Pause");
    expect(pruefeEintrag(e({ start: "06:00", ende: "23:30", pauseMin: 30 }), "2026-10").join(" ")).toContain("16 Stunden");
    expect(pruefeEintrag(e({ datum: "2026-09-30" }), "2026-10").join(" ")).toContain("nicht in diesem Monat");
    expect(pruefeEintrag(e({ fahrten: [{ von: "", nach: "", km: 10 }] }), "2026-10").join(" ")).toContain("Start und Ziel");
    expect(pruefeEintrag(e({ fahrten: [{ von: "A", nach: "B", km: null }], pkwArt: "PRIVAT" }), "2026-10").join(" ")).toContain("Kilometer");
    // Firmenfahrzeug ohne km ist in Ordnung; alles Freiwillige darf leer sein
    expect(pruefeEintrag(e({ fahrten: [{ von: "A", nach: "B", km: null }], pkwArt: "FIRMA" }), "2026-10")).toEqual([]);
  });
  it("Überschneidungen am selben Tag werden gemeldet, nebeneinander ist erlaubt", () => {
    expect(ueberschneidungen([e({ start: "08:00", ende: "12:00" }), e({ start: "13:00", ende: "17:00" })])).toEqual([]);
    expect(ueberschneidungen([e({ start: "08:00", ende: "12:00" }), e({ start: "11:00", ende: "17:00" })])).toHaveLength(1);
    expect(ueberschneidungen([e({ datum: "2026-10-05" }), e({ datum: "2026-10-06" })])).toEqual([]);
  });
  it("Abschließen geht nur mit mindestens einem sauberen Eintrag", () => {
    expect(kannAbschliessen("2026-10", []).ok).toBe(false);
    expect(kannAbschliessen("2026-10", [e()]).ok).toBe(true);
    const schlecht = kannAbschliessen("2026-10", [e({ start: "" })]);
    expect(schlecht.ok).toBe(false);
    expect(schlecht.gruende[0]).toContain("05.10.2026");
  });
  it("Das Format wird streng geprüft (Server)", () => {
    expect(EintragSchema.safeParse(e()).success).toBe(true);
    for (const schlecht of [{ start: "8:00" }, { ende: "24:00" }, { datum: "2026-02-30" }, { pauseMin: -5 }, { pauseMin: 1.5 }, { pkwArt: "BUS" }, { spesen: -1 }, { taetigkeit: "x".repeat(81) }, { getan: "x".repeat(1001) }, { fahrten: Array(9).fill({ von: "a", nach: "b", km: 1 }) }, { fahrten: [{ von: "a", nach: "b", km: 5000 }] }]) {
      expect(EintragSchema.safeParse({ ...e(), ...schlecht }).success, JSON.stringify(schlecht)).toBe(false);
    }
    expect(TageSchema.safeParse(Array.from({ length: 151 }, () => e())).success).toBe(false);
    expect(TageSchema.safeParse("kein array").success).toBe(false);
  });
});

describe("Monatszettel (Einsatzmodul): Stand", () => {
  it("von leer bis fertig, Rückgabe und erneute Unterschrift", () => {
    expect(zettelStand({ anzahlTage: 0, personSigniert: false, kundeStatus: "OFFEN" })).toBe("leer");
    expect(zettelStand({ anzahlTage: 2, personSigniert: false, kundeStatus: "OFFEN" })).toBe("in_arbeit");
    expect(zettelStand({ anzahlTage: 2, personSigniert: true, kundeStatus: "OFFEN" })).toBe("wartet_kunde");
    expect(zettelStand({ anzahlTage: 2, personSigniert: true, kundeStatus: "BESTAETIGT" })).toBe("fertig");
    expect(zettelStand({ anzahlTage: 2, personSigniert: false, kundeStatus: "ZURUECK" })).toBe("zurueck");
    expect(zettelStand({ anzahlTage: 2, personSigniert: true, kundeStatus: "ZURUECK" })).toBe("wartet_kunde");
  });
});

describe("Monatszettel (Einsatzmodul): Nachrichten und Übernahme", () => {
  it("Platzhalter werden gefüllt, nichts bleibt offen", () => {
    const t = fuelleVorlage(STANDARD_VORLAGE, { vorname: "Anna", kunde: "Nordlicht Live GmbH", monat: "Oktober 2026", link: "https://app.example/e/m/abc" });
    expect(t).toContain("Hallo Anna");
    expect(t).toContain("Nordlicht Live GmbH im Oktober 2026");
    expect(t).toContain("https://app.example/e/m/abc");
    expect(t).not.toMatch(/\{\w+\}/);
    const k = kundenNachricht({ anrede: "Frau Berger", kunde: "Nordlicht", monat: "Oktober 2026", link: "https://app.example/e/k/xyz" });
    expect(k).toContain("Guten Tag Frau Berger,");
    expect(k).toContain("https://app.example/e/k/xyz");
    expect(kundenNachricht({ anrede: "", kunde: "N", monat: "M", link: "L" }).startsWith("Guten Tag,")).toBe(true);
  });
  it("WhatsApp-Link mit deutscher Nummer, ohne Nummer an die Auswahl", () => {
    expect(waNummer("0151 1234 5678")).toBe("4915112345678");
    expect(waNummer("+49 151 1234567")).toBe("491511234567");
    expect(waNummer("0049 151 1234567")).toBe("491511234567");
    expect(waLinkAn("0151 1234 5678", "Hallo Welt")).toBe("https://wa.me/4915112345678?text=Hallo%20Welt");
    expect(waLinkAn(null, "x")).toBe("https://wa.me/?text=x");
  });
  it("Notiz im Zeiteintrag und Schichtbezeichnung im Monatseinsatz", () => {
    expect(eintragNotiz({ sonderabsprache: "", getan: "", notiz: "" })).toBeNull();
    expect(eintragNotiz({ sonderabsprache: "früher Feierabend", getan: "Aufbau", notiz: "Regen" })).toBe("Absprache: früher Feierabend · Getan: Aufbau · Regen");
    expect(eintragNotiz({ sonderabsprache: "", getan: "x".repeat(2000), notiz: "" })?.length).toBeLessThanOrEqual(1500);
    expect(schichtBezeichnung("2026-10-05", 1)).toBe("Monatszettel 05.10.");
    expect(schichtBezeichnung("2026-10-05", 2)).toBe("Monatszettel 05.10. (2)");
    expect(neuerEintragId()).not.toBe(neuerEintragId());
  });
});
