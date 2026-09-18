import { describe, expect, it } from "vitest";
import { easterSunday, holidayName, holidaysForYear } from "@/lib/einsatz/holidays";
import { deriveBundesland, resolveBundesland } from "@/lib/einsatz/bundesland";

describe("Feiertage", () => {
  it("berechnet Ostern korrekt", () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });

  it("kennt bundesweite und landesspezifische Feiertage", () => {
    expect(holidayName("2026-10-03", "BW")).toBe("Tag der Deutschen Einheit");
    expect(holidayName("2026-01-06", "BW")).toBe("Heilige Drei Könige");
    expect(holidayName("2026-01-06", "NW")).toBeNull();
    expect(holidayName("2026-11-01", "NW")).toBe("Allerheiligen");
    expect(holidayName("2026-10-31", "SN")).toBe("Reformationstag");
    expect(holidayName("2026-11-18", "SN")).toBe("Buß- und Bettag");
    expect(holidayName("2026-03-08", "BE")).toBe("Internationaler Frauentag");
    expect(holidayName("2026-09-18", "BW")).toBeNull();
  });

  it("liefert eine sortierte Jahresliste", () => {
    const list = holidaysForYear(2026, "BY");
    expect(list.map((h) => h.dateKey)).toEqual([...list.map((h) => h.dateKey)].sort());
    expect(list.some((h) => h.name === "Fronleichnam")).toBe(true);
  });
});

describe("Bundesland aus Einsatzort", () => {
  it("erkennt Städte, PLZ und explizite Kürzel", () => {
    expect(deriveBundesland("Porsche Arena Stuttgart")).toBe("BW");
    expect(deriveBundesland("Messe, 80339 München")).toBe("BY");
    expect(deriveBundesland("Halle 4, 20457 Hamburg")).toBe("HH");
    expect(deriveBundesland("Irgendwo (NW)")).toBe("NW");
    expect(deriveBundesland("Festwiese")).toBeNull();
    expect(resolveBundesland(null, undefined, deriveBundesland("Festwiese"))).toBe("BW");
  });
});
