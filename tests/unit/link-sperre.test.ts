import { describe, expect, it } from "vitest";
import { linkSperre, SPERR_TEXT, tokenState } from "@/lib/einsatz/service/time-entries";

const SCHICHT = "shift-1";
const morgen = new Date(Date.now() + 86400000);
const gestern = new Date(Date.now() - 86400000);

function sa(opts: { status?: string; review?: string | null; confirmations?: Array<{ shiftId: string | null }>; ablauf?: Date } = {}) {
  return {
    status: opts.status ?? "ERFASST",
    shiftId: SCHICHT,
    tokenExpiresAt: opts.ablauf ?? morgen,
    timeEntries: opts.review ? [{ review: opts.review }] : [],
    shift: { assignment: { confirmations: opts.confirmations ?? [] } },
  };
}

describe("Bis wann darf im Link geändert werden", () => {
  it("vor jeder Unterschrift: offen", () => {
    expect(linkSperre({ status: "GEPLANT", shiftId: SCHICHT, review: null, confirmations: [] })).toBeNull();
  });

  it("die eigene Unterschrift sperrt nicht mehr", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: "ERFASST", confirmations: [] })).toBeNull();
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: "GEPRUEFT", confirmations: [] })).toBeNull();
  });

  it("die Bestätigung des Kunden für diese Schicht sperrt", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: "ERFASST", confirmations: [{ shiftId: SCHICHT }] })).toBe("kunde");
  });

  it("die Bestätigung für den ganzen Einsatz sperrt auch", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: null, confirmations: [{ shiftId: null }] })).toBe("kunde");
  });

  it("die Bestätigung einer anderen Schicht sperrt nicht", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: "ERFASST", confirmations: [{ shiftId: "shift-2" }] })).toBeNull();
  });

  it("freigegebene Stunden sind die Grundlage für Lohn und Rechnung – gesperrt", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, review: "FREIGEGEBEN", confirmations: [] })).toBe("freigegeben");
  });

  it("eine stornierte Einteilung geht vor allem anderen", () => {
    expect(linkSperre({ status: "STORNIERT", shiftId: SCHICHT, review: "FREIGEGEBEN", confirmations: [{ shiftId: null }] })).toBe("storniert");
  });

  it("jeder Grund hat einen Text für die Oberfläche", () => {
    for (const grund of ["storniert", "kunde", "freigegeben"] as const) expect(SPERR_TEXT[grund]).toMatch(/\S/);
  });
});

describe("Zustand des Einzellinks", () => {
  it("bleibt offen, solange nachgebessert werden darf", () => {
    expect(tokenState(sa())).toBe("offen");
    expect(tokenState(sa({ review: "ERFASST" }))).toBe("offen");
  });

  it("wird erfasst, sobald der Kunde gezeichnet hat", () => {
    expect(tokenState(sa({ review: "ERFASST", confirmations: [{ shiftId: SCHICHT }] }))).toBe("erfasst");
  });

  it("wird erfasst, sobald die Stunden freigegeben sind", () => {
    expect(tokenState(sa({ review: "FREIGEGEBEN" }))).toBe("erfasst");
  });

  it("storniert und abgelaufen bleiben, wie sie waren", () => {
    expect(tokenState(sa({ status: "STORNIERT" }))).toBe("storniert");
    expect(tokenState(sa({ ablauf: gestern }))).toBe("abgelaufen");
    // Eine Sperre geht dem Ablauf vor – die Begründung ist die hilfreichere
    expect(tokenState(sa({ ablauf: gestern, confirmations: [{ shiftId: null }] }))).toBe("erfasst");
  });
});
