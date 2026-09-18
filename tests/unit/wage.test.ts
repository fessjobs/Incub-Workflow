import { describe, expect, it } from "vitest";
import { DEFAULT_WAGE_RULES, computeWageLines, deductionLine, type WageContext, type WageRule } from "@/lib/einsatz/wage";
import { netHours } from "@/lib/einsatz/hours";
import { fromBerlin } from "@/lib/einsatz/tz";

const rules: WageRule[] = DEFAULT_WAGE_RULES.map((r, i) => ({ ...r, id: `r${i}` }));

function ctx(startKey: string, start: string, endKey: string, end: string, extra: Partial<WageContext["entry"]> = {}, shift: Partial<WageContext["shift"]> = {}, bundesland = "BW"): WageContext {
  const istStart = fromBerlin(startKey, start);
  const istEnde = fromBerlin(endKey, end);
  const pauseMinuten = extra.pauseMinuten ?? 0;
  return {
    entry: {
      id: "e1",
      istStart,
      istEnde,
      pauseMinuten,
      stundenGesamt: netHours(istStart, istEnde, pauseMinuten),
      taetigkeit: null,
      pkw: false,
      pkwArt: null,
      spesen: false,
      spesenBetrag: null,
      tripsKm: 0,
      ...extra,
    },
    shift: { taetigkeit: "Hands", garantieStunden: null, ...shift },
    bundesland,
  };
}

const byType = (lines: ReturnType<typeof computeWageLines>, typ: string) => lines.filter((l) => l.typ === typ);

describe("Lohnarten-Ableitung", () => {
  it("Normalstunden ohne Zuschläge an einem Werktag", () => {
    const lines = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "16:30", { pauseMinuten: 30 }), rules);
    expect(byType(lines, "NORMAL")[0]).toMatchObject({ lohnart: "100", menge: 8 });
    expect(byType(lines, "NACHT")).toHaveLength(0);
    expect(byType(lines, "SONNTAG")).toHaveLength(0);
    expect(byType(lines, "FEIERTAG")).toHaveLength(0);
    expect(byType(lines, "GARANTIE")).toHaveLength(0);
  });

  it("Nachtzuschlag anteilig über Mitternacht, Pause anteilig verteilt", () => {
    // 21:30–03:30 = 360 min brutto, 60 min Pause → Faktor 5/6; im Fenster 23–03:30 = 270 min → 225 min = 3.75 h
    const lines = computeWageLines(ctx("2026-09-18", "21:30", "2026-09-19", "03:30", { pauseMinuten: 60 }), rules);
    expect(byType(lines, "NORMAL")[0].menge).toBe(5);
    expect(byType(lines, "NACHT")[0]).toMatchObject({ lohnart: "166", menge: 3.75 });
  });

  it("Sonntagszuschlag nur für den Sonntagsanteil", () => {
    // Samstag 20:00 – Sonntag 02:00 → 120 min Sonntag
    const lines = computeWageLines(ctx("2026-09-19", "20:00", "2026-09-20", "02:00"), rules);
    expect(byType(lines, "SONNTAG")[0]).toMatchObject({ lohnart: "146", menge: 2 });
    // Nacht 23–02 = 180 min
    expect(byType(lines, "NACHT")[0].menge).toBe(3);
  });

  it("Feiertag hat Vorrang vor Sonntag (Ostersonntag in BB) und gilt je Bundesland", () => {
    // 3. Oktober 2027 ist ein Sonntag: Feiertag bundesweit
    const lines = computeWageLines(ctx("2027-10-03", "10:00", "2027-10-03", "18:00"), rules);
    expect(byType(lines, "FEIERTAG")[0]).toMatchObject({ lohnart: "156", menge: 8 });
    expect(byType(lines, "SONNTAG")).toHaveLength(0);
    // Fronleichnam 2026 (4. Juni): BW ja, BE nein
    expect(byType(computeWageLines(ctx("2026-06-04", "08:00", "2026-06-04", "12:00", {}, {}, "BW"), rules), "FEIERTAG")).toHaveLength(1);
    expect(byType(computeWageLines(ctx("2026-06-04", "08:00", "2026-06-04", "12:00", {}, {}, "BE"), rules), "FEIERTAG")).toHaveLength(0);
  });

  it("Garantiestunden füllen auf und werden separat ausgewiesen", () => {
    const lines = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "10:30"), rules);
    expect(byType(lines, "NORMAL")[0].menge).toBe(2.5);
    expect(byType(lines, "GARANTIE")[0]).toMatchObject({ menge: 1.5, lohnart: "100" });
    // Schicht-Override 6 h
    const lines6 = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "10:30", {}, { garantieStunden: 6 }), rules);
    expect(byType(lines6, "GARANTIE")[0].menge).toBe(3.5);
    // Zwei Schichten am selben Tag = zwei Garantien (je Eintrag)
    const a = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "10:00"), rules);
    const b = computeWageLines(ctx("2026-09-18", "21:30", "2026-09-18", "23:30"), rules);
    expect(byType(a, "GARANTIE")[0].menge + byType(b, "GARANTIE")[0].menge).toBe(4);
  });

  it("Fahrtkosten getrennt nach privat und Firma, Zulage nach Tätigkeit, Spesen", () => {
    const privat = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "16:00", { pkw: true, pkwArt: "PRIVAT", tripsKm: 42.5, spesen: true }), rules);
    expect(byType(privat, "FAHRT_PRIVAT")[0]).toMatchObject({ menge: 42.5, betrag: 12.75, einheit: "km" });
    expect(byType(privat, "FAHRT_FIRMA")).toHaveLength(0);
    expect(byType(privat, "SPESEN")[0]).toMatchObject({ betrag: 14 });

    const firma = computeWageLines(ctx("2026-09-18", "08:00", "2026-09-18", "16:00", { pkw: true, pkwArt: "FIRMA", tripsKm: 10, taetigkeit: "Stapler Halle 3" }), rules);
    expect(byType(firma, "FAHRT_FIRMA")[0]).toMatchObject({ menge: 10, betrag: null });
    expect(byType(firma, "ZULAGE")[0]).toMatchObject({ lohnart: "210", menge: 8, betrag: 12 });
  });

  it("inaktive Regeln werden ignoriert, manuelle Abzüge sind negativ", () => {
    const off = rules.map((r) => (r.typ === "NACHT" ? { ...r, aktiv: false } : r));
    const lines = computeWageLines(ctx("2026-09-18", "22:00", "2026-09-19", "02:00"), off);
    expect(byType(lines, "NACHT")).toHaveLength(0);
    expect(deductionLine({ id: "d", lohnart: "900", stunden: 1.5, betrag: null, grund: "Verspätung" })).toMatchObject({ menge: -1.5, typ: "ABZUG" });
  });
});
