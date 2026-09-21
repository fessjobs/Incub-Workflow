import { describe, expect, it } from "vitest";
import { teileEingabe } from "@/lib/einsatz/service/crew-roster";
import { CrewNameSchema, CrewPersonSchema } from "@/lib/einsatz/schemas";

describe("Namenseingabe der Crew", () => {
  it("räumt Leerraum auf, ohne Doppelnamen zu zerstören", () => {
    expect(teileEingabe("  Saad  Mohammad ", " Hassan ")).toEqual({ vorname: "Saad Mohammad", nachname: "Hassan" });
    expect(teileEingabe("Jana", "von der Heide")).toEqual({ vorname: "Jana", nachname: "von der Heide" });
  });
});

describe("Schemas für die Selbstkorrektur", () => {
  it("verlangt Vor- und Nachnamen", () => {
    // Die Konkretisierung nach AÜG benennt die Person namentlich
    expect(CrewNameSchema.safeParse({ aktion: "name-korrigieren", shiftAssignmentId: "x", vorname: "Tobias", nachname: "" }).success).toBe(false);
    expect(CrewPersonSchema.safeParse({ aktion: "person-ergaenzen", shiftId: "s", vorname: "", nachname: "Weidner" }).success).toBe(false);
  });

  it("nimmt vollständige Angaben an und trennt die beiden Aktionen sauber", () => {
    expect(CrewNameSchema.safeParse({ aktion: "name-korrigieren", shiftAssignmentId: "x", vorname: "Tobias", nachname: "Krämer" }).success).toBe(true);
    expect(CrewPersonSchema.safeParse({ aktion: "person-ergaenzen", shiftId: "s", vorname: "Jana", nachname: "Weidner" }).success).toBe(true);
    // Eine Aktion darf nicht als die andere durchgehen
    expect(CrewPersonSchema.safeParse({ aktion: "name-korrigieren", shiftId: "s", vorname: "Jana", nachname: "Weidner" }).success).toBe(false);
  });

  it("begrenzt die Länge, damit nichts das PDF sprengt", () => {
    expect(CrewNameSchema.safeParse({ aktion: "name-korrigieren", shiftAssignmentId: "x", vorname: "A".repeat(81), nachname: "Krämer" }).success).toBe(false);
  });
});
