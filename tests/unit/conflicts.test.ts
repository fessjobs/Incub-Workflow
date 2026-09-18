import { describe, expect, it } from "vitest";
import { detectConflicts, type PlannedSlot } from "@/lib/einsatz/conflicts";
import { fromBerlin } from "@/lib/einsatz/tz";

function slot(employeeId: string, startKey: string, start: string, endKey: string, end: string, label: string, einsatz = "E1"): PlannedSlot {
  return { employeeId, name: `Person ${employeeId}`, start: fromBerlin(startKey, start), end: fromBerlin(endKey, end), label, einsatz };
}

describe("Arbeitszeit-Konflikte", () => {
  it("erkennt zu kurze Ruhezeit (Load-Out bis 3 Uhr, Frühschicht ab 8 Uhr)", () => {
    const c = detectConflicts([slot("a", "2026-09-18", "21:30", "2026-09-19", "03:00", "Load-Out"), slot("a", "2026-09-19", "08:00", "2026-09-19", "16:00", "Früh")]);
    expect(c.map((x) => x.kind)).toContain("ruhezeit");
  });

  it("erkennt mehr als 10 h in 24 h über zwei Schichten", () => {
    const c = detectConflicts([slot("a", "2026-09-18", "08:00", "2026-09-18", "14:00", "Call 2"), slot("a", "2026-09-19", "01:00", "2026-09-19", "07:00", "Nacht")]);
    expect(c.map((x) => x.kind)).toContain("arbeitszeit");
  });

  it("erkennt Doppelbuchungen in parallelen Einsätzen und ignoriert andere Personen", () => {
    const c = detectConflicts([
      slot("a", "2026-09-18", "08:00", "2026-09-18", "16:00", "Aufbau", "E1"),
      slot("a", "2026-09-18", "12:00", "2026-09-18", "18:00", "Catering", "E2"),
      slot("b", "2026-09-18", "12:00", "2026-09-18", "18:00", "Catering", "E2"),
    ]);
    expect(c.filter((x) => x.kind === "doppelbuchung")).toHaveLength(1);
    expect(c[0].employeeId).toBe("a");
  });

  it("meldet nichts bei sauberem Plan", () => {
    const c = detectConflicts([slot("a", "2026-09-18", "08:00", "2026-09-18", "16:00", "Früh"), slot("a", "2026-09-19", "08:00", "2026-09-19", "16:00", "Früh")]);
    expect(c).toHaveLength(0);
  });
});
