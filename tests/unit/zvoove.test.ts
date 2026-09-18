import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, buildZvooveRows, decodeCp1252, detectMappingFromSample, encodeCp1252, renderZvooveCsv, validateZvooveRows } from "@/lib/export/zvoove";
import type { EntryRow } from "@/lib/einsatz/analytics";
import { fromBerlin } from "@/lib/einsatz/tz";
import type { WageLine } from "@/lib/einsatz/wage";

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: "e1",
    datumKey: "2026-09-18",
    istStart: fromBerlin("2026-09-18", "08:00"),
    istEnde: fromBerlin("2026-09-18", "16:00"),
    pauseMinuten: 30,
    stunden: 7.5,
    taetigkeit: "Hands",
    notiz: null,
    pkw: false,
    pkwArt: null,
    tripsKm: 0,
    spesen: false,
    spesenBetrag: null,
    review: "FREIGEGEBEN",
    version: 1,
    unterschrieben: true,
    quelle: "MITARBEITER",
    employee: { id: "m1", vorname: "Samira", nachname: "Gülhan", personalnummer: "10004", zulagen: [] },
    customer: { id: "c1", name: "Mannheimer Power GmbH" },
    assignment: { id: "a1", einsatznummer: "2026-0918-01", projekt: "Reezy", bundesland: "BW", einsatzort: "Stuttgart" },
    shift: { bezeichnung: "Call 2", taetigkeit: "Hands", garantieStunden: null },
    ...over,
  };
}

const line = (lohnart: string, menge: number, einheit: WageLine["einheit"] = "Stunden", betrag: number | null = null): WageLine => ({ ruleId: "r", typ: "NORMAL", lohnart, bezeichnung: "Normalstunden", menge, einheit, faktor: 1, betrag, grundlage: "" });

describe("zvoove-Export", () => {
  it("rendert CSV nach Mapping mit Komma-Dezimal, deutschem Datum und Windows-1252", () => {
    const rows = buildZvooveRows([row()], new Map([["e1", [line("100", 7.5)]]]), [], DEFAULT_MAPPING);
    const csv = renderZvooveCsv(rows, DEFAULT_MAPPING);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Personalnummer;Datum;Lohnart;Stunden;Kunde;Auftrag;Tätigkeit;Betrag;Bemerkung");
    expect(lines[1]).toBe("10004;18.09.2026;100;7,50;Mannheimer Power GmbH;2026-0918-01;Hands;;Normalstunden · Call 2");
    const bytes = encodeCp1252(csv);
    // "ä" in Tätigkeit ist ein einzelnes Byte 0xE4, "€" wäre 0x80
    expect(bytes.includes(0xe4)).toBe(true);
    expect(decodeCp1252(bytes)).toBe(csv.replace("·", "·"));
    expect(encodeCp1252("€")[0]).toBe(0x80);
  });

  it("validiert fehlende Personalnummer, Null-Stunden, unbekannte Lohnart und Datum außerhalb", () => {
    const rows = buildZvooveRows(
      [row({ id: "e1", employee: { id: "m2", vorname: "Neu", nachname: "Ohne", personalnummer: null, zulagen: [] } }), row({ id: "e2", datumKey: "2026-10-02" })],
      new Map([
        ["e1", [line("100", 0)]],
        ["e2", [line("999", 8)]],
      ]),
      [],
      DEFAULT_MAPPING
    );
    const errors = validateZvooveRows(rows, { von: "2026-09-01", bis: "2026-09-30", bekannteLohnarten: new Set(["100"]), mapping: DEFAULT_MAPPING });
    const problems = errors.map((e) => e.problem);
    expect(problems).toContain("Personalnummer fehlt");
    expect(problems).toContain("Stunden gleich null");
    expect(problems).toContain("unbekannte Lohnart 999");
    expect(problems.some((p) => p.includes("außerhalb des Zeitraums"))).toBe(true);
  });

  it("leitet Mapping aus einer Beispieldatei ab", () => {
    const sample = Buffer.from("Pers.-Nr\tDatum\tLohnart\tAnzahl\tKostenstelle\tBemerkung\r\n4711\t2026-09-18\t100\t8.00\tK-1\tTest\r\n", "utf8");
    const m = detectMappingFromSample(sample);
    expect(m.trennzeichen).toBe("\t");
    expect(m.datumsformat).toBe("YYYY-MM-DD");
    expect(m.dezimaltrennzeichen).toBe(".");
    expect(m.zeichensatz).toBe("utf-8");
    expect(m.spalten.map((s) => s.feld)).toEqual(["personalnummer", "datum", "lohnart", "stunden", "einsatznummer", "bemerkung"]);
    expect(m.pflichtfelder).toEqual(["personalnummer", "datum", "lohnart", "stunden"]);
    expect(m.sampleHash).toHaveLength(64);
    const cp = detectMappingFromSample(Buffer.concat([Buffer.from("Personalnummer;Datum;Lohnart;Stunden;T", "latin1"), Buffer.from([0xe4]), Buffer.from("tigkeit\r\n1;18.09.26;100;7,5;Hands\r\n", "latin1")]));
    expect(cp.zeichensatz).toBe("windows-1252");
    expect(cp.datumsformat).toBe("DD.MM.YY");
    expect(cp.spalten[4].feld).toBe("taetigkeit");
  });
});
