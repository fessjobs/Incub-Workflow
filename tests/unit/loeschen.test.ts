import { describe, expect, it } from "vitest";
import { pruefeEinsatzLoeschbar } from "@/lib/einsatz/service/loeschen";

const admin = { role: "ADMIN" as const };
const dispo = { role: "DISPONENT" as const };
const mitglied = { role: "MEMBER" as const };

function einsatz(opts: {
  eintraege?: Array<{ review: string; unterschrieben: boolean }>;
  kunde?: boolean;
  dokumente?: number;
  status?: string;
}) {
  return {
    status: opts.status ?? "KONKRETISIERT",
    confirmations: opts.kunde ? [{}] : [],
    documentLinks: Array.from({ length: opts.dokumente ?? 0 }, () => ({})),
    shifts: [
      {
        assignments: [
          {
            timeEntries: (opts.eintraege ?? []).map((e) => ({ review: e.review, unterschriftZeitpunkt: e.unterschrieben ? new Date() : null })),
          },
        ],
      },
    ],
  };
}

describe("Einsatz löschen: wer darf was", () => {
  it("ein unberührter Entwurf darf weg – auch für die Disposition, ohne Eintippen", () => {
    const p = pruefeEinsatzLoeschbar(dispo, einsatz({}));
    expect(p).toMatchObject({ moeglich: true, bestaetigungNoetig: false, grund: null, unterschriften: 0, kundeBestaetigt: false });
  });

  it("eingeteilt und erfasst, aber ohne Unterschrift: immer noch ein Entwurf", () => {
    const p = pruefeEinsatzLoeschbar(dispo, einsatz({ eintraege: [{ review: "ERFASST", unterschrieben: false }] }));
    expect(p.moeglich).toBe(true);
    expect(p.bestaetigungNoetig).toBe(false);
  });

  it("sobald jemand unterschrieben hat, darf nur der Admin – und muss tippen", () => {
    const mitUnterschrift = einsatz({ eintraege: [{ review: "ERFASST", unterschrieben: true }] });
    expect(pruefeEinsatzLoeschbar(dispo, mitUnterschrift)).toMatchObject({ moeglich: false, bestaetigungNoetig: false });
    expect(pruefeEinsatzLoeschbar(dispo, mitUnterschrift).grund).toMatch(/Unterschriften/);
    expect(pruefeEinsatzLoeschbar(admin, mitUnterschrift)).toMatchObject({ moeglich: true, bestaetigungNoetig: true, unterschriften: 1 });
  });

  it("nach der Kundenbestätigung ebenso – und die Begründung nennt den Kunden", () => {
    const bestaetigt = einsatz({ kunde: true });
    expect(pruefeEinsatzLoeschbar(dispo, bestaetigt).grund).toMatch(/Kunde/);
    expect(pruefeEinsatzLoeschbar(admin, bestaetigt)).toMatchObject({ moeglich: true, bestaetigungNoetig: true, kundeBestaetigt: true });
  });

  it("freigegebene Zeiten sperren das Löschen für alle, auch für den Admin", () => {
    const freigegeben = einsatz({ eintraege: [{ review: "FREIGEGEBEN", unterschrieben: true }] });
    for (const wer of [admin, dispo, mitglied]) {
      const p = pruefeEinsatzLoeschbar(wer, freigegeben);
      expect(p.moeglich).toBe(false);
      expect(p.grund).toMatch(/Freigabe zurücknehmen/);
    }
  });

  it("ein abgerechneter Einsatz bleibt stehen", () => {
    const p = pruefeEinsatzLoeschbar(admin, einsatz({ status: "ABGERECHNET" }));
    expect(p.moeglich).toBe(false);
    expect(p.grund).toMatch(/abgerechnet/);
  });

  it("die Freigabe hat Vorrang vor allem anderen", () => {
    // Auch wenn es nur ein Entwurf wäre: eine freigegebene Zeile blockiert
    const p = pruefeEinsatzLoeschbar(admin, einsatz({ eintraege: [{ review: "FREIGEGEBEN", unterschrieben: false }] }));
    expect(p.moeglich).toBe(false);
  });

  it("zählt mit, was mitgeht", () => {
    const p = pruefeEinsatzLoeschbar(admin, einsatz({ eintraege: [{ review: "ERFASST", unterschrieben: true }], kunde: true, dokumente: 2 }));
    expect(p).toMatchObject({ unterschriften: 1, kundeBestaetigt: true, dokumente: 2 });
  });
});
