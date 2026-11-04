import { describe, expect, it } from "vitest";
import { linkSperre, SPERR_TEXT, tokenState } from "@/lib/einsatz/service/time-entries";

const SCHICHT = "shift-1";
const morgen = new Date(Date.now() + 86400000);
const gestern = new Date(Date.now() - 86400000);

function sa(opts: { status?: string; confirmations?: Array<{ shiftId: string | null }>; ablauf?: Date } = {}) {
  return {
    status: opts.status ?? "ERFASST",
    shiftId: SCHICHT,
    tokenExpiresAt: opts.ablauf ?? morgen,
    shift: { assignment: { confirmations: opts.confirmations ?? [] } },
  };
}

describe("Bis wann darf im Link geändert werden", () => {
  it("vor jeder Unterschrift: offen", () => {
    expect(linkSperre({ status: "GEPLANT", shiftId: SCHICHT, confirmations: [] })).toBeNull();
  });

  it("die eigene Unterschrift sperrt nicht mehr", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, confirmations: [] })).toBeNull();
  });

  it("die Bestätigung des Kunden für diese Schicht sperrt", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, confirmations: [{ shiftId: SCHICHT }] })).toBe("kunde");
  });

  it("die Bestätigung für den ganzen Einsatz sperrt auch", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, confirmations: [{ shiftId: null }] })).toBe("kunde");
  });

  it("die Bestätigung einer anderen Schicht sperrt nicht", () => {
    expect(linkSperre({ status: "ERFASST", shiftId: SCHICHT, confirmations: [{ shiftId: "shift-2" }] })).toBeNull();
  });

  it("eine stornierte Einteilung geht vor allem anderen", () => {
    expect(linkSperre({ status: "STORNIERT", shiftId: SCHICHT, confirmations: [{ shiftId: null }] })).toBe("storniert");
  });

  it("jeder Grund hat einen Text für die Oberfläche", () => {
    for (const grund of ["storniert", "kunde"] as const) expect(SPERR_TEXT[grund]).toMatch(/\S/);
  });
});

describe("Zustand des Einzellinks", () => {
  it("bleibt offen, solange nachgebessert werden darf", () => {
    expect(tokenState(sa())).toBe("offen");
  });

  it("wird erfasst, sobald der Kunde gezeichnet hat", () => {
    expect(tokenState(sa({ confirmations: [{ shiftId: SCHICHT }] }))).toBe("erfasst");
  });

  it("storniert und abgelaufen bleiben, wie sie waren", () => {
    expect(tokenState(sa({ status: "STORNIERT" }))).toBe("storniert");
    expect(tokenState(sa({ ablauf: gestern }))).toBe("abgelaufen");
    // Eine Sperre geht dem Ablauf vor – die Begründung ist die hilfreichere
    expect(tokenState(sa({ ablauf: gestern, confirmations: [{ shiftId: null }] }))).toBe("erfasst");
  });
});
