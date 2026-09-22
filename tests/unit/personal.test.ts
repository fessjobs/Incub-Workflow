import { describe, expect, it } from "vitest";
import { bilanzUrteil, stufe, STUFEN, taetigkeitKey } from "@/lib/einsatz/service/personal";
import { erfahrungKurz } from "@/app/(app)/einsaetze/rating-badges";

describe("Erfahrungsstufe", () => {
  it("steigt mit der Zahl geleisteter Schichten", () => {
    expect(stufe(0)).toBe("neu");
    expect(stufe(1)).toBe("eingearbeitet");
    expect(stufe(7)).toBe("eingearbeitet");
    expect(stufe(8)).toBe("geübt");
    expect(stufe(24)).toBe("geübt");
    expect(stufe(25)).toBe("erfahren");
    expect(stufe(300)).toBe("erfahren");
  });

  it("ist lückenlos definiert", () => {
    // Jede Zahl von 0 bis 100 bekommt eine Stufe, keine fällt durch
    for (let n = 0; n <= 100; n++) expect(STUFEN.some((s) => s.name === stufe(n))).toBe(true);
  });
});

describe("Tätigkeiten zusammenfassen", () => {
  it("fasst Schreibweisen zusammen", () => {
    expect(taetigkeitKey(" Hands ")).toBe("hands");
    expect(taetigkeitKey("HANDS")).toBe(taetigkeitKey("hands"));
    expect(taetigkeitKey("Catering  Hilfe")).toBe("catering hilfe");
  });

  it("hält verschiedene Tätigkeiten auseinander", () => {
    expect(taetigkeitKey("Rigger")).not.toBe(taetigkeitKey("Hands"));
  });
});

describe("Bewertungsbilanz", () => {
  it("nennt eine leere Bilanz offen", () => {
    expect(bilanzUrteil({ positiv: 0, neutral: 0, negativ: 0 })).toBe("offen");
  });

  it("nur Positives ist positiv, ein Negativ macht es gemischt", () => {
    expect(bilanzUrteil({ positiv: 5, neutral: 0, negativ: 0 })).toBe("positiv");
    expect(bilanzUrteil({ positiv: 5, neutral: 2, negativ: 0 })).toBe("positiv");
    expect(bilanzUrteil({ positiv: 5, neutral: 0, negativ: 1 })).toBe("gemischt");
  });

  it("überwiegt Negatives, fällt das auf", () => {
    expect(bilanzUrteil({ positiv: 1, neutral: 0, negativ: 2 })).toBe("negativ");
    expect(bilanzUrteil({ positiv: 0, neutral: 3, negativ: 1 })).toBe("negativ");
    // Gleichstand ist noch kein Urteil
    expect(bilanzUrteil({ positiv: 2, neutral: 0, negativ: 2 })).toBe("gemischt");
  });

  it("nur Neutrales ist weder positiv noch negativ", () => {
    expect(bilanzUrteil({ positiv: 0, neutral: 4, negativ: 0 })).toBe("gemischt");
  });
});

describe("Kurzform für die Einteilung", () => {
  const basis = {
    schichten: 12,
    taetigkeiten: [
      { taetigkeit: "Hands", schichten: 9 },
      { taetigkeit: "Rigger", schichten: 3 },
    ],
    bilanz: { positiv: 4, neutral: 1, negativ: 0 },
  };

  it("stellt die passende Tätigkeit voran", () => {
    expect(erfahrungKurz(basis, "Hands")).toMatch(/^Hands 9×/);
    expect(erfahrungKurz(basis, "hands")).toMatch(/^Hands 9×/);
  });

  it("sagt ausdrücklich 0×, wenn jemand die Tätigkeit noch nie gemacht hat", () => {
    expect(erfahrungKurz(basis, "Stapler")).toMatch(/^Stapler 0×/);
  });

  it("warnt bei überwiegend negativer Bilanz", () => {
    expect(erfahrungKurz({ ...basis, bilanz: { positiv: 0, neutral: 0, negativ: 3 } })).toMatch(/überwiegend negativ/);
    expect(erfahrungKurz(basis)).not.toMatch(/negativ/);
  });

  it("kommt ohne Tätigkeit aus", () => {
    expect(erfahrungKurz(basis)).toBe("12 Schichten · 4× positiv");
  });
});
