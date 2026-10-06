import { describe, expect, it } from "vitest";
import { standVon, zahlenFuer } from "@/lib/einsatz/service/projekte";

type Abrechnung = "OFFEN" | "FREIGEGEBEN" | "BEREIT" | "BERECHNET";

function einsatz(abrechnung: Abrechnung, stunden: number[] = [], ergaenzungen: Array<{ art: "BONUS" | "ABZUG"; betrag: number }> = []) {
  return {
    abrechnung,
    ergaenzungen,
    shifts: [
      {
        assignments: [
          { status: "ERFASST", timeEntries: stunden.map((h) => ({ review: "FREIGEGEBEN", stundenGesamt: h })) },
          // Eine stornierte Einteilung zählt nie mit
          { status: "STORNIERT", timeEntries: [{ review: "FREIGEGEBEN", stundenGesamt: 99 }] },
        ],
      },
    ],
  };
}

describe("Zahlen einer Projektmappe", () => {
  it("summiert freigegebene Stunden über alle Einsätze", () => {
    const z = zahlenFuer([einsatz("FREIGEGEBEN", [8, 7.5]), einsatz("FREIGEGEBEN", [6.25])]);
    expect(z.einsaetze).toBe(2);
    expect(z.stunden).toBe(21.75);
    expect(z.offeneEinsaetze).toBe(0);
  });

  it("zählt Einsätze mit offenen Stunden", () => {
    const z = zahlenFuer([einsatz("OFFEN", [8]), einsatz("FREIGEGEBEN", [8]), einsatz("OFFEN")]);
    expect(z.offeneEinsaetze).toBe(2);
  });

  it("nicht freigegebene Zeiten bleiben außen vor", () => {
    const z = zahlenFuer([
      {
        abrechnung: "OFFEN",
        ergaenzungen: [],
        shifts: [{ assignments: [{ status: "ERFASST", timeEntries: [{ review: "GEPRUEFT", stundenGesamt: 8 }] }] }],
      },
    ]);
    expect(z.stunden).toBe(0);
  });

  it("verrechnet die Ergänzungen aller Einsätze", () => {
    const z = zahlenFuer([einsatz("FREIGEGEBEN", [8], [{ art: "BONUS", betrag: 150 }]), einsatz("FREIGEGEBEN", [8], [{ art: "ABZUG", betrag: 20.5 }])]);
    expect(z.ergaenzungen).toBe(129.5);
  });

  it("ein leeres Projekt hat keine Zahlen", () => {
    expect(zahlenFuer([])).toEqual({ einsaetze: 0, stunden: 0, ergaenzungen: 0, offeneEinsaetze: 0 });
  });
});

describe("Abgeleiteter Stand des Projekts", () => {
  const leer = { angabenAm: null, rechnungsnummer: null };

  it("ein leeres Projekt ist offen", () => {
    expect(standVon(leer, [])).toBe("OFFEN");
  });

  it("ein offener Einsatz hält das ganze Projekt offen", () => {
    expect(standVon(leer, [{ abrechnung: "FREIGEGEBEN" }, { abrechnung: "OFFEN" }])).toBe("OFFEN");
  });

  it("alle Stunden frei, aber ohne Angaben: freigegeben", () => {
    expect(standVon(leer, [{ abrechnung: "FREIGEGEBEN" }, { abrechnung: "FREIGEGEBEN" }])).toBe("FREIGEGEBEN");
  });

  it("mit gemeldeten Angaben: bereit für die Rechnung", () => {
    expect(standVon({ angabenAm: new Date(), rechnungsnummer: null }, [{ abrechnung: "BEREIT" }])).toBe("BEREIT");
  });

  it("mit Rechnungsnummer: berechnet – unabhängig vom Rest", () => {
    expect(standVon({ angabenAm: new Date(), rechnungsnummer: "RE-1" }, [{ abrechnung: "BERECHNET" }])).toBe("BERECHNET");
    expect(standVon({ angabenAm: null, rechnungsnummer: "RE-1" }, [{ abrechnung: "OFFEN" }])).toBe("BERECHNET");
  });
});
