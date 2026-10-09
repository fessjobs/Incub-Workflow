import { describe, expect, it } from "vitest";
import { addTage, bruttoMinuten, dezimal, gesamtzeit, istUeberMitternacht, normalizeTime, pauseMinuten } from "@/preview/logic/zeit";
import { pruefeZeilen, vertragAm, zaehleWarnungen, type PruefKontext } from "@/preview/logic/stunden";
import type { Contract, StundenRow } from "@/preview/logic/types";

describe("Zeiteingaben werden tolerant gelesen", () => {
  it.each([
    ["7", "07:00"],
    ["730", "07:30"],
    ["0730", "07:30"],
    ["7.30", "07:30"],
    ["7,30", "07:30"],
    ["7h30", "07:30"],
    ["7:5", "07:05"],
    ["22 Uhr", "22:00"],
    ["23:59", "23:59"],
  ])("%s → %s", (eingabe, soll) => expect(normalizeTime(eingabe)).toBe(soll));

  it.each(["", "abc", "24:00", "7:60", "12345"])("lehnt „%s“ ab", (eingabe) => expect(normalizeTime(eingabe)).toBeNull());
});

describe("Gesamtzeit: Ende minus Start minus Pausen", () => {
  it("einfache Schicht mit einer Pause", () => {
    expect(gesamtzeit("07:00", "15:30", [{ von: "11:00", bis: "11:30" }])).toBe(8);
  });

  it("erkennt die Schicht über Mitternacht", () => {
    expect(istUeberMitternacht("22:00", "06:00")).toBe(true);
    expect(istUeberMitternacht("07:00", "15:00")).toBe(false);
    expect(bruttoMinuten("22:00", "06:00")).toBe(480);
    expect(gesamtzeit("22:00", "06:00", [{ von: "02:00", bis: "02:30" }])).toBe(7.5);
  });

  it("mehrere Pausen werden addiert, auch über Mitternacht", () => {
    expect(pauseMinuten([{ von: "10:00", bis: "10:15" }, { von: "13:00", bis: "13:30" }])).toBe(45);
    expect(pauseMinuten([{ von: "23:45", bis: "00:15" }])).toBe(30);
  });

  it("unvollständige Pausen zählen nicht, nie unter null", () => {
    expect(pauseMinuten([{ von: "10:00", bis: "" }])).toBe(0);
    expect(gesamtzeit("07:00", "07:30", [{ von: "07:00", bis: "08:00" }])).toBe(0);
  });

  it("rundet auf zwei Dezimalstellen wie zvoove", () => {
    expect(dezimal(50)).toBe(0.83);
    expect(dezimal(20)).toBe(0.33);
  });

  it("Tage addieren über Monatsgrenzen", () => {
    expect(addTage("2026-10-31", 1)).toBe("2026-11-01");
    expect(addTage("2026-03-01", -1)).toBe("2026-02-28");
  });
});

const VERTRAG_MINI: Contract = { vertragsart: "Minijob", wochenstunden: 10, monatsgrenzeStd: 40, monatsgrenzeEur: 603, stundenlohn: 14, gueltigVon: "2026-01-01", gueltigBis: null, docusignId: "D1" };
const VERTRAG_ABGELAUFEN: Contract = { ...VERTRAG_MINI, gueltigBis: "2026-09-30" };

function row(p: Partial<StundenRow> & { id: string }): StundenRow {
  return {
    datum: "2026-10-05", pnr: "P1", start: "07:00", pausen: [{ von: "11:00", bis: "11:30" }], ende: "15:30", pauschale: 0, kunde: "K", auftrag: "A1",
    spesen: 0, reiseKm: 0, reiseGesch: 0, bonus: 0, abzug: 0, bemerkung: "", status: "offen", quelle: "Zettel", sourceRef: null, ...p,
  };
}

function ctx(vertrag: Contract[] = [VERTRAG_MINI]): PruefKontext {
  return { personen: new Map([["P1", { vertraege: vertrag }], ["P2", { vertraege: [VERTRAG_MINI] }]]) };
}

const codes = (m: Map<string, unknown[]>, id: string) => ((m.get(id) as Array<{ code: string }> | undefined) ?? []).map((w) => w.code);

describe("Plausibilität der Stundentabelle", () => {
  it("eine saubere Zeile hat keine Hinweise", () => {
    expect(pruefeZeilen([row({ id: "r1" })], ctx()).size).toBe(0);
  });

  it("Schicht über 10 Stunden", () => {
    const m = pruefeZeilen([row({ id: "r1", start: "06:00", ende: "19:00", pausen: [{ von: "12:00", bis: "12:45" }] })], ctx());
    expect(codes(m, "r1")).toContain("ueber10");
  });

  it("Pause fehlt bei Schicht über 6 Stunden", () => {
    const m = pruefeZeilen([row({ id: "r1", pausen: [] })], ctx());
    expect(codes(m, "r1")).toContain("pause_fehlt");
  });

  it("zu kurze Pause: 30 min ab 6 h, 45 min ab 9 h", () => {
    expect(codes(pruefeZeilen([row({ id: "r1", pausen: [{ von: "11:00", bis: "11:15" }] })], ctx()), "r1")).toContain("pause_kurz");
    expect(codes(pruefeZeilen([row({ id: "r2", start: "07:00", ende: "17:00", pausen: [{ von: "11:00", bis: "11:30" }] })], ctx()), "r2")).toContain("pause_kurz");
    expect(pruefeZeilen([row({ id: "r3", start: "07:00", ende: "17:00", pausen: [{ von: "11:00", bis: "11:45" }] })], ctx()).size).toBe(0);
  });

  it("kurze Schichten brauchen keine Pause", () => {
    expect(pruefeZeilen([row({ id: "r1", start: "08:00", ende: "13:00", pausen: [] })], ctx()).size).toBe(0);
  });

  it("Doppeleinsatz: beide Zeilen bekommen den Fehler", () => {
    const m = pruefeZeilen([row({ id: "r1", auftrag: "A1" }), row({ id: "r2", auftrag: "A2", start: "12:00", ende: "20:00", pausen: [{ von: "15:00", bis: "15:30" }] })], ctx());
    expect(codes(m, "r1")).toContain("doppelt");
    expect(codes(m, "r2")).toContain("doppelt");
    expect(zaehleWarnungen(m).zeilenMitFehler).toBe(2);
  });

  it("Doppeleinsatz erkennt auch die Schicht über Mitternacht in den nächsten Tag", () => {
    const m = pruefeZeilen([row({ id: "r1", datum: "2026-10-05", start: "20:00", ende: "04:00", pausen: [{ von: "23:00", bis: "23:30" }] }), row({ id: "r2", datum: "2026-10-06", start: "02:00", ende: "08:00", pausen: [] })], ctx());
    expect(codes(m, "r2")).toContain("doppelt");
  });

  it("Ruhezeit unter 11 Stunden", () => {
    const m = pruefeZeilen([row({ id: "r1", datum: "2026-10-05", start: "14:00", ende: "23:00", pausen: [{ von: "18:00", bis: "18:45" }] }), row({ id: "r2", datum: "2026-10-06", start: "06:00", ende: "11:00", pausen: [] })], ctx());
    expect(codes(m, "r2")).toContain("ruhezeit");
    expect(codes(m, "r2")).not.toContain("doppelt");
  });

  it("genau 11 Stunden Ruhe sind in Ordnung", () => {
    const m = pruefeZeilen([row({ id: "r1", datum: "2026-10-05", start: "12:00", ende: "21:00", pausen: [{ von: "15:00", bis: "15:45" }] }), row({ id: "r2", datum: "2026-10-06", start: "08:00", ende: "12:00", pausen: [] })], ctx());
    expect(codes(m, "r2")).not.toContain("ruhezeit");
  });

  it("kein gültiger Vertrag am Tag der Schicht", () => {
    const m = pruefeZeilen([row({ id: "r1" })], ctx([VERTRAG_ABGELAUFEN]));
    expect(codes(m, "r1")).toContain("vertrag");
    expect(vertragAm([VERTRAG_ABGELAUFEN], "2026-09-30")).not.toBeNull();
    expect(vertragAm([VERTRAG_ABGELAUFEN], "2026-10-01")).toBeNull();
  });

  it("unbekannte Personalnummer und fehlende Zeiten sind Fehler", () => {
    const m = pruefeZeilen([row({ id: "r1", pnr: "P9" }), row({ id: "r2", ende: "" })], ctx());
    expect(codes(m, "r1")).toContain("pnr");
    expect(codes(m, "r2")).toContain("zeit");
  });

  it("Monatsgrenze: markiert erst die Zeile, die sie überschreitet", () => {
    const tage = ["01", "02", "03", "05", "06", "07"];
    const rows = tage.map((t) => row({ id: `t${t}`, datum: `2026-10-${t}` })); // je 8 h → 48 h gegen 40 h
    const m = pruefeZeilen(rows, ctx());
    expect(codes(m, "t05")).not.toContain("monatsgrenze"); // 32 h
    expect(codes(m, "t06")).not.toContain("monatsgrenze"); // 40 h, genau auf der Grenze
    expect(codes(m, "t07")).toContain("monatsgrenze"); // 48 h
  });

  it("zählt Fehler und Warnungen getrennt", () => {
    const m = pruefeZeilen([row({ id: "r1", pausen: [] }), row({ id: "r2", pnr: "P9" })], ctx());
    const z = zaehleWarnungen(m);
    expect(z.zeilenMitFehler).toBe(1);
    expect(z.warnungen).toBeGreaterThan(0);
  });
});
