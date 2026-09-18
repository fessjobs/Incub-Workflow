import { describe, expect, it } from "vitest";
import { minutesInWindows, minutesOnDays, netHours, splitByBerlinDay } from "@/lib/einsatz/hours";
import { berlinDateKey, berlinOffsetMinutes, berlinTime, fromBerlin } from "@/lib/einsatz/tz";

describe("Zeitzone Europe/Berlin", () => {
  it("wandelt Wandzeit in UTC (Sommerzeit +2, Winterzeit +1)", () => {
    expect(fromBerlin("2026-09-18", "08:00").toISOString()).toBe("2026-09-18T06:00:00.000Z");
    expect(fromBerlin("2026-12-18", "08:00").toISOString()).toBe("2026-12-18T07:00:00.000Z");
    expect(berlinOffsetMinutes(new Date("2026-07-01T12:00:00Z"))).toBe(120);
    expect(berlinOffsetMinutes(new Date("2026-01-01T12:00:00Z"))).toBe(60);
  });

  it("formatiert zurück in Wandzeit", () => {
    const d = fromBerlin("2026-09-18", "21:30");
    expect(berlinDateKey(d)).toBe("2026-09-18");
    expect(berlinTime(d)).toBe("21:30");
  });
});

describe("Stundenberechnung", () => {
  it("rechnet Netto mit Pause", () => {
    const s = fromBerlin("2026-09-18", "08:00");
    const e = fromBerlin("2026-09-18", "16:30");
    expect(netHours(s, e, 30)).toBe(8);
  });

  it("behandelt Schichten über Mitternacht", () => {
    const s = fromBerlin("2026-09-18", "21:30");
    const e = fromBerlin("2026-09-19", "03:15");
    expect(netHours(s, e, 15)).toBe(5.5);
    const parts = splitByBerlinDay(s, e);
    expect(parts.map((p) => [p.dateKey, p.minutes])).toEqual([
      ["2026-09-18", 150],
      ["2026-09-19", 195],
    ]);
  });

  it("zählt Minuten im Nachtfenster 23–6 Uhr, auch über Mitternacht", () => {
    const s = fromBerlin("2026-09-18", "21:30");
    const e = fromBerlin("2026-09-19", "03:15");
    // 23:00–03:15 = 255 min
    expect(minutesInWindows(s, e, [{ von: "23:00", bis: "06:00" }])).toBe(255);
    // reine Tagschicht: 0
    expect(minutesInWindows(fromBerlin("2026-09-18", "08:00"), fromBerlin("2026-09-18", "16:00"), [{ von: "23:00", bis: "06:00" }])).toBe(0);
    // Frühschicht ab 5:00: 60 min
    expect(minutesInWindows(fromBerlin("2026-09-18", "05:00"), fromBerlin("2026-09-18", "13:00"), [{ von: "23:00", bis: "06:00" }])).toBe(60);
  });

  it("zählt Sonntagsminuten (Samstag 22:00 bis Sonntag 02:00 → 120)", () => {
    const s = fromBerlin("2026-09-19", "22:00"); // Samstag
    const e = fromBerlin("2026-09-20", "02:00"); // Sonntag
    expect(minutesOnDays(s, e, (_k, wd) => wd === 0)).toBe(120);
  });

  it("DST-Wechsel: Nacht der Zeitumstellung (Oktober) hat 25 Stunden", () => {
    const s = fromBerlin("2026-10-24", "22:00");
    const e = fromBerlin("2026-10-25", "06:00");
    expect(netHours(s, e, 0)).toBe(9);
  });
});
