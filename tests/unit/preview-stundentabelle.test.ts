import { describe, expect, it } from "vitest";
import { BEARBEITBAR, SPALTEN, einfuegen, feldWert, istTabellenText, neueZeile, parseDatum, parseEinfuegen, parseZahl, setzeFeld, setzePausen, spaltenFuerWarnung, type EditKontext } from "@/preview/logic/stundentabelle";
import { EXCEL_KOPF } from "@/preview/logic/export";
import type { StundenRow } from "@/preview/logic/types";

const ctx: EditKontext = {
  jahr: 2026,
  auftraege: new Map([["FESS-2026-0101", "Nordlicht Live GmbH"], ["FESS-2026-0102", "Rheinbühne Events"]]),
  kunden: ["Nordlicht Live GmbH", "Rheinbühne Events"],
};

const basis = (): StundenRow => ({ ...neueZeile("z1", "2026-10-05"), pnr: "P1001", start: "08:00", ende: "16:30", pausen: [{ von: "12:00", bis: "12:30" }], kunde: "Nordlicht Live GmbH", auftrag: "FESS-2026-0101" });

describe("Spalten der Stundentabelle", () => {
  it("es sind 18, in der Reihenfolge des Excel-Musters", () => {
    expect(SPALTEN).toHaveLength(18);
    expect(SPALTEN).toHaveLength(EXCEL_KOPF.length);
    expect(SPALTEN.map((s) => s.key)).toEqual([
      "datum", "pnr", "vorname", "nachname", "start", "pauseVon", "pauseBis", "ende", "gesamt", "pauschale",
      "kunde", "auftrag", "spesen", "reiseKm", "reiseGesch", "bonus", "abzug", "bemerkung",
    ]);
  });
  it("berechnete Spalten sind nicht bearbeitbar", () => {
    expect(BEARBEITBAR).not.toContain("gesamt");
    expect(BEARBEITBAR).not.toContain("vorname");
    expect(BEARBEITBAR).toHaveLength(15);
  });
});

describe("Datum und Zahlen tolerant lesen", () => {
  it("Datum in mehreren Schreibweisen", () => {
    expect(parseDatum("5.10.2026", 2026)).toBe("2026-10-05");
    expect(parseDatum("05.10.26", 2026)).toBe("2026-10-05");
    expect(parseDatum("5.10.", 2026)).toBe("2026-10-05");
    expect(parseDatum("2026-10-05", 2026)).toBe("2026-10-05");
  });
  it("unmögliche Tage werden abgelehnt", () => {
    expect(parseDatum("31.02.2026", 2026)).toBeNull();
    expect(parseDatum("morgen", 2026)).toBeNull();
    expect(parseDatum("5.13.2026", 2026)).toBeNull();
  });
  it("Zahlen mit Komma, Tausenderpunkt und Eurozeichen", () => {
    expect(parseZahl("12,5")).toBe(12.5);
    expect(parseZahl("1.234,50")).toBe(1234.5);
    expect(parseZahl("1.234")).toBe(1234);
    expect(parseZahl("7 €")).toBe(7);
    expect(parseZahl("12.5")).toBe(12.5);
    expect(parseZahl("")).toBe(0);
  });
  it("Text und negative Zahlen sind keine Zahlen", () => {
    expect(parseZahl("abc")).toBeNull();
    expect(parseZahl("-5")).toBeNull();
  });
});

describe("Feld ändern", () => {
  it("Uhrzeit wird normalisiert und die Gesamtzeit rechnet mit", () => {
    const r = setzeFeld(basis(), "ende", "1830", ctx);
    expect(r.fehler).toBeUndefined();
    expect(r.row.ende).toBe("18:30");
    expect(feldWert(r.row, "gesamt")).toBe("10,00");
    expect(r.aenderungen).toEqual([{ feld: "ende", alt: "16:30", neu: "18:30" }]);
  });
  it("ungültige Uhrzeit ändert nichts und sagt warum", () => {
    const r = setzeFeld(basis(), "start", "25:99", ctx);
    expect(r.fehler).toMatch(/keine Uhrzeit/);
    expect(r.row.start).toBe("08:00");
    expect(r.aenderungen).toEqual([]);
  });
  it("gleicher Wert ist keine Änderung (kein Audit-Eintrag)", () => {
    expect(setzeFeld(basis(), "start", "8", ctx).aenderungen).toEqual([]);
  });
  it("Schicht über Mitternacht: Ende vor Start", () => {
    const r = setzeFeld({ ...basis(), pausen: [] }, "ende", "02:00", ctx);
    expect(feldWert(r.row, "gesamt")).toBe("18,00");
  });
  it("Auftrag setzt den Kunden mit und schreibt beides ins Protokoll", () => {
    const r = setzeFeld(basis(), "auftrag", "fess-2026-0102", ctx);
    expect(r.row.auftrag).toBe("FESS-2026-0102");
    expect(r.row.kunde).toBe("Rheinbühne Events");
    expect(r.aenderungen.map((a) => a.feld)).toEqual(["auftrag", "kunde"]);
  });
  it("unbekannter Auftrag oder Kunde wird abgelehnt", () => {
    expect(setzeFeld(basis(), "auftrag", "XYZ", ctx).fehler).toMatch(/gibt es nicht/);
    expect(setzeFeld(basis(), "kunde", "Foo AG", ctx).fehler).toMatch(/nicht angelegt/);
  });
  it("Personalnummer wird groß geschrieben", () => {
    expect(setzeFeld(basis(), "pnr", " p1002 ", ctx).row.pnr).toBe("P1002");
  });
  it("Beträge mit Komma", () => {
    const r = setzeFeld(basis(), "spesen", "14,00", ctx);
    expect(r.row.spesen).toBe(14);
    expect(feldWert(r.row, "spesen")).toBe("14,00");
  });
  it("Pause: nur ‚von‘ eingeben lässt die Pause halb offen, leeren entfernt sie", () => {
    const a = setzeFeld({ ...basis(), pausen: [] }, "pauseVon", "12", ctx);
    expect(a.row.pausen).toEqual([{ von: "12:00", bis: "" }]);
    const b = setzeFeld(basis(), "pauseVon", "", ctx);
    const c = setzeFeld(b.row, "pauseBis", "", ctx);
    expect(c.row.pausen).toEqual([]);
  });
  it("mehrere Pausen bleiben erhalten, wenn die erste geändert wird", () => {
    const r = { ...basis(), pausen: [{ von: "10:00", bis: "10:15" }, { von: "13:00", bis: "13:30" }] };
    const n = setzeFeld(r, "pauseBis", "10:20", ctx);
    expect(n.row.pausen).toEqual([{ von: "10:00", bis: "10:20" }, { von: "13:00", bis: "13:30" }]);
  });
  it("Pausen als Ganzes setzen", () => {
    const r = setzePausen(basis(), [{ von: "11:00", bis: "11:30" }, { von: "15:00", bis: "15:15" }]);
    expect(r.aenderungen).toEqual([{ feld: "pausen", alt: "12:00–12:30", neu: "11:00–11:30, 15:00–15:15" }]);
  });
});

describe("Einfügen aus Excel", () => {
  it("Zeilen und Zellen aus der Zwischenablage trennen", () => {
    expect(parseEinfuegen("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(istTabellenText("a\tb")).toBe(true);
    expect(istTabellenText("12:30")).toBe(false);
  });

  const zeilen = (): StundenRow[] => [neueZeile("a", "2026-10-01"), neueZeile("b", "2026-10-01"), neueZeile("c", "2026-10-01")];

  it("ein 18-Spalten-Block ab Datum füllt die Zeilen und überspringt Name und Gesamtzeit", () => {
    const block = parseEinfuegen(
      "05.10.2026\tP1001\tMax\tMuster\t08:00\t12:00\t12:30\t16:30\t8,00\t0\tNordlicht Live GmbH\tFESS-2026-0101\t0\t0\t0\t0\t0\tvon Excel\n" +
        "06.10.2026\tP1002\t\t\t09:00\t\t\t17:00\t\t4\tRheinbühne Events\tFESS-2026-0102\t7\t\t\t\t\t"
    );
    const e = einfuegen(zeilen(), 0, "datum", block, ctx);
    expect(e.fehler).toEqual([]);
    expect(e.geaendert).toHaveLength(2);
    const a = e.geaendert[0].row;
    expect(a.datum).toBe("2026-10-05");
    expect(a.pnr).toBe("P1001");
    expect(a.pausen).toEqual([{ von: "12:00", bis: "12:30" }]);
    expect(a.bemerkung).toBe("von Excel");
    expect(e.geaendert[1].row.pauschale).toBe(4);
    expect(e.geaendert[1].row.spesen).toBe(7);
  });

  it("Fehler in einzelnen Zellen brechen nicht alles ab", () => {
    const e = einfuegen(zeilen(), 0, "start", parseEinfuegen("8:00\t12:00\nfoo\t13:00"), ctx);
    expect(e.fehler).toHaveLength(1);
    expect(e.fehler[0]).toMatch(/Zeile 2, Start/);
    expect(e.geaendert).toHaveLength(2);
    expect(e.geaendert[1].row.pausen[0].von).toBe("13:00");
  });

  it("mehr eingefügte Zeilen als Zielzeilen: Hinweis statt Absturz", () => {
    const e = einfuegen(zeilen().slice(0, 1), 0, "pnr", parseEinfuegen("P1\nP2\nP3"), ctx);
    expect(e.geaendert).toHaveLength(1);
    expect(e.fehler[0]).toMatch(/keine Zielzeile/);
  });

  it("Einfügen mitten in der Tabelle läuft in Spaltenreihenfolge weiter", () => {
    const e = einfuegen(zeilen(), 1, "ende", parseEinfuegen("17:00\t\t4"), ctx);
    expect(e.geaendert[0].row.ende).toBe("17:00");
    expect(e.geaendert[0].row.pauschale).toBe(4);
  });
});

describe("Warnungen färben Spalten", () => {
  it("jede Warnart hat Spalten", () => {
    for (const code of ["pnr", "zeit", "doppelt", "vertrag", "ueber10", "pause_fehlt", "pause_kurz", "ruhezeit", "monatsgrenze"]) {
      expect(spaltenFuerWarnung(code).length).toBeGreaterThan(0);
    }
    expect(spaltenFuerWarnung("unbekannt")).toEqual([]);
  });
});
