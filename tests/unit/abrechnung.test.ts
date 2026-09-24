import { describe, expect, it } from "vitest";
import { ABRECHNUNG_KURZ, ABRECHNUNG_WER, pruefeAbrechnungsfreigabe, summeErgaenzungen, vorzeichen } from "@/lib/einsatz/service/abrechnung";
import { canBillingNotes, canInvoice } from "@/lib/einsatz/access";

type Eintrag = { review: string; stunden: number; unterschrieben?: boolean };

function einsatz(opts: { personen?: Array<{ employeeId: string; storniert?: boolean; eintraege?: Eintrag[] }>; stundennachweis?: boolean }) {
  return {
    shifts: [
      {
        assignments: (opts.personen ?? []).map((p) => ({
          status: p.storniert ? "STORNIERT" : "ERFASST",
          employeeId: p.employeeId,
          timeEntries: (p.eintraege ?? []).map((e) => ({ review: e.review, stundenGesamt: e.stunden, unterschriftZeitpunkt: e.unterschrieben === false ? null : new Date() })),
        })),
      },
    ],
    documentLinks: opts.stundennachweis ? [{ document: { category: "stundennachweis" } }] : [],
  };
}

describe("Voraussetzungen für die Freigabe der Stunden", () => {
  it("ohne erfasste Zeiten geht nichts", () => {
    const p = pruefeAbrechnungsfreigabe(einsatz({ personen: [{ employeeId: "e1" }] }));
    expect(p.moeglich).toBe(false);
    expect(p.offen[0]).toMatch(/keine Zeiten erfasst/i);
    expect(p.stunden).toBe(0);
  });

  it("unterschriebene, nicht bestätigte Zeiten weisen auf den Knopf hin", () => {
    const p = pruefeAbrechnungsfreigabe(einsatz({ personen: [{ employeeId: "e1", eintraege: [{ review: "GEPRUEFT", stunden: 8 }] }] }));
    expect(p.moeglich).toBe(false);
    expect(p.offen[0]).toMatch(/Stunden bestätigen/);
    expect(p.offeneZeiten).toBe(1);
    expect(p.bestaetigbar).toBe(1);
  });

  it("offene Zeiten ohne Unterschrift werden getrennt benannt", () => {
    const p = pruefeAbrechnungsfreigabe(
      einsatz({
        personen: [
          { employeeId: "e1", eintraege: [{ review: "FREIGEGEBEN", stunden: 8 }] },
          { employeeId: "e2", eintraege: [{ review: "ERFASST", stunden: 7.5, unterschrieben: false }] },
        ],
      })
    );
    expect(p.moeglich).toBe(false);
    expect(p.bestaetigbar).toBe(0);
    expect(p.offen[0]).toMatch(/1 ohne Unterschrift/);
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
    expect(p.bestaetigbar).toBe(0);
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

describe("Ergänzungen: Bonus, Fahrtkosten, Abzüge", () => {
  it("nur der Abzug zählt negativ", () => {
    expect(vorzeichen("BONUS")).toBe(1);
    expect(vorzeichen("FAHRTKOSTEN")).toBe(1);
    expect(vorzeichen("SPESEN")).toBe(1);
    expect(vorzeichen("ZUSCHLAG")).toBe(1);
    expect(vorzeichen("SONSTIGES")).toBe(1);
    expect(vorzeichen("ABZUG")).toBe(-1);
  });

  it("die Summe verrechnet Zuschläge und Abzüge", () => {
    const summe = summeErgaenzungen([
      { art: "BONUS", betrag: 150 },
      { art: "FAHRTKOSTEN", betrag: 42.5 },
      { art: "ABZUG", betrag: 20.25 },
    ]);
    expect(summe).toBe(172.25);
  });

  it("ohne Ergänzungen ist die Summe null", () => {
    expect(summeErgaenzungen([])).toBe(0);
  });

  it("Dezimalstellen bleiben sauber", () => {
    expect(summeErgaenzungen([{ art: "BONUS", betrag: 0.1 }, { art: "BONUS", betrag: 0.2 }])).toBe(0.3);
  });
});

describe("Wer darf was in der Abrechnung", () => {
  it("Stunden freigeben und Rechnung schreiben: Buchhaltung und Admin", () => {
    expect(canInvoice({ role: "BUCHHALTUNG" })).toBe(true);
    expect(canInvoice({ role: "ADMIN" })).toBe(true);
    expect(canInvoice({ role: "DISPONENT" })).toBe(false);
    expect(canInvoice({ role: "MEMBER" })).toBe(false);
    expect(canInvoice({ role: "EINREICHER" })).toBe(false);
  });

  it("Angaben zur Abrechnung: Admin und Buchhaltung", () => {
    expect(canBillingNotes({ role: "ADMIN" })).toBe(true);
    expect(canBillingNotes({ role: "BUCHHALTUNG" })).toBe(true);
    expect(canBillingNotes({ role: "DISPONENT" })).toBe(false);
    expect(canBillingNotes({ role: "MEMBER" })).toBe(false);
    expect(canBillingNotes({ role: "EINREICHER" })).toBe(false);
  });

  it("jeder Stand hat ein Kürzel und sagt, wer dran ist", () => {
    const staende = ["OFFEN", "FREIGEGEBEN", "BEREIT", "BERECHNET"] as const;
    expect(Object.keys(ABRECHNUNG_KURZ).sort()).toEqual([...staende].sort());
    for (const st of staende) expect(ABRECHNUNG_WER[st]).toBeTruthy();
  });
});
