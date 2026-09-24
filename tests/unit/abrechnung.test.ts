import { describe, expect, it } from "vitest";
import { ABRECHNUNG_KURZ, pruefeAbrechnungsfreigabe } from "@/lib/einsatz/service/abrechnung";
import { canBillingNotes, canInvoice } from "@/lib/einsatz/access";

type Eintrag = { review: string; stunden: number };

function einsatz(opts: { personen?: Array<{ employeeId: string; storniert?: boolean; eintraege?: Eintrag[] }>; stundennachweis?: boolean }) {
  return {
    shifts: [
      {
        assignments: (opts.personen ?? []).map((p) => ({
          status: p.storniert ? "STORNIERT" : "ERFASST",
          employeeId: p.employeeId,
          timeEntries: (p.eintraege ?? []).map((e) => ({ review: e.review, stundenGesamt: e.stunden, unterschriftZeitpunkt: new Date() })),
        })),
      },
    ],
    documentLinks: opts.stundennachweis ? [{ document: { category: "stundennachweis" } }] : [],
  };
}

describe("Voraussetzungen für die Abrechnungsfreigabe", () => {
  it("ohne erfasste Zeiten geht nichts", () => {
    const p = pruefeAbrechnungsfreigabe(einsatz({ personen: [{ employeeId: "e1" }] }));
    expect(p.moeglich).toBe(false);
    expect(p.offen[0]).toMatch(/keine Zeiten erfasst/i);
    expect(p.stunden).toBe(0);
  });

  it("erfasste, aber nicht freigegebene Zeiten blockieren", () => {
    const p = pruefeAbrechnungsfreigabe(einsatz({ personen: [{ employeeId: "e1", eintraege: [{ review: "GEPRUEFT", stunden: 8 }] }] }));
    expect(p.moeglich).toBe(false);
    expect(p.offen[0]).toMatch(/Keine Zeit ist freigegeben/);
    expect(p.offeneZeiten).toBe(1);
  });

  it("eine offene Zeit neben freigegebenen blockiert ebenfalls", () => {
    const p = pruefeAbrechnungsfreigabe(
      einsatz({
        personen: [
          { employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8 }] },
          { employeeId: "e2", eintraege: [{ review: "ERFASST", stunden: 7.5 }] },
        ],
      })
    );
    expect(p.moeglich).toBe(false);
    expect(p.offen[0]).toMatch(/1 Zeiteintrag/);
    expect(p.stunden).toBe(8);
  });

  it("alles freigegeben: möglich, Stunden und Personen stimmen", () => {
    const p = pruefeAbrechnungsfreigabe(
      einsatz({
        stundennachweis: true,
        personen: [
          { employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8.25 }] },
          { employeeId: "e2", eintraege: [{ review: "FREIGEGEBEN", stunden: 7.5 }] },
        ],
      })
    );
    expect(p.moeglich).toBe(true);
    expect(p.offen).toEqual([]);
    expect(p.stunden).toBe(15.75);
    expect(p.personen).toBe(2);
    expect(p.stundennachweis).toBe(true);
  });

  it("der fehlende Stundennachweis ist ein Hinweis, kein Riegel", () => {
    const p = pruefeAbrechnungsfreigabe(einsatz({ personen: [{ employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8 }] }] }));
    expect(p.moeglich).toBe(true);
    expect(p.stundennachweis).toBe(false);
    expect(p.offen[0]).toMatch(/Stundennachweis/);
  });

  it("stornierte Einteilungen zählen nicht mit", () => {
    const p = pruefeAbrechnungsfreigabe(
      einsatz({
        personen: [
          { employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8 }] },
          { employeeId: "e2", storniert: true, eintraege: [{ review: "ERFASST", stunden: 6 }] },
        ],
      })
    );
    expect(p.moeglich).toBe(true);
    expect(p.personen).toBe(1);
    expect(p.stunden).toBe(8);
  });

  it("dieselbe Person in zwei Schichten wird einmal gezählt", () => {
    const e = einsatz({ personen: [{ employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8 }] }] });
    e.shifts.push({ assignments: [{ status: "ERFASST", employeeId: "e1", timeEntries: [{ review: "FREIGEGEBEN", stundenGesamt: 4, unterschriftZeitpunkt: new Date() }] }] });
    const p = pruefeAbrechnungsfreigabe(e);
    expect(p.personen).toBe(1);
    expect(p.stunden).toBe(12);
  });
});

describe("Wer darf was in der Abrechnung", () => {
  it("nur Buchhaltung und Admin schreiben die Rechnung", () => {
    expect(canInvoice({ role: "BUCHHALTUNG" })).toBe(true);
    expect(canInvoice({ role: "ADMIN" })).toBe(true);
    expect(canInvoice({ role: "DISPONENT" })).toBe(false);
    expect(canInvoice({ role: "MEMBER" })).toBe(false);
    expect(canInvoice({ role: "EINREICHER" })).toBe(false);
  });

  it("Angebotsnummer und Konditionen pflegen Dispo und Buchhaltung", () => {
    for (const role of ["ADMIN", "BUCHHALTUNG", "DISPONENT", "MEMBER"] as const) expect(canBillingNotes({ role })).toBe(true);
    expect(canBillingNotes({ role: "EINREICHER" })).toBe(false);
  });

  it("die Kürzel für die Liste sind vollständig", () => {
    expect(Object.keys(ABRECHNUNG_KURZ).sort()).toEqual(["BERECHNET", "FREIGEGEBEN", "OFFEN"]);
  });
});
