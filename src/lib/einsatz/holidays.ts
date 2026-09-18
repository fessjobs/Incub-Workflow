// Gesetzliche Feiertage je Bundesland (berechnet, kein externer Dienst).
// Regionale Sonderfälle (z. B. Fronleichnam nur in Teilen von SN/TH, Mariä
// Himmelfahrt nur in überwiegend katholischen Gemeinden Bayerns, Augsburger
// Friedensfest) sind bewusst NICHT enthalten – siehe docs/einsatzmodul.md.

export const BUNDESLAENDER: Record<string, string> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

export type Holiday = { dateKey: string; name: string };

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Ostersonntag (Gregorianisch, anonymer Algorithmus)
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, offset: number): string {
  const t = new Date(Date.UTC(year, month - 1, day + offset));
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Buß- und Bettag: Mittwoch vor dem 23. November
function bussUndBettag(year: number): string {
  const nov23 = new Date(Date.UTC(year, 10, 23));
  const wd = nov23.getUTCDay(); // 0 So … 3 Mi
  const diff = (wd - 3 + 7) % 7 || 7;
  return addDays(year, 11, 23, -diff);
}

export function holidaysForYear(year: number, bundesland: string): Holiday[] {
  const bl = bundesland.toUpperCase();
  const easter = easterSunday(year);
  const e = (offset: number) => addDays(year, easter.month, easter.day, offset);
  const list: Holiday[] = [
    { dateKey: key(year, 1, 1), name: "Neujahr" },
    { dateKey: e(-2), name: "Karfreitag" },
    { dateKey: e(1), name: "Ostermontag" },
    { dateKey: key(year, 5, 1), name: "Tag der Arbeit" },
    { dateKey: e(39), name: "Christi Himmelfahrt" },
    { dateKey: e(50), name: "Pfingstmontag" },
    { dateKey: key(year, 10, 3), name: "Tag der Deutschen Einheit" },
    { dateKey: key(year, 12, 25), name: "1. Weihnachtstag" },
    { dateKey: key(year, 12, 26), name: "2. Weihnachtstag" },
  ];
  const has = (...states: string[]) => states.includes(bl);
  if (has("BW", "BY", "ST")) list.push({ dateKey: key(year, 1, 6), name: "Heilige Drei Könige" });
  if (has("BE", "MV")) list.push({ dateKey: key(year, 3, 8), name: "Internationaler Frauentag" });
  if (has("BB")) {
    list.push({ dateKey: e(0), name: "Ostersonntag" });
    list.push({ dateKey: e(49), name: "Pfingstsonntag" });
  }
  if (has("BW", "BY", "HE", "NW", "RP", "SL")) list.push({ dateKey: e(60), name: "Fronleichnam" });
  if (has("SL")) list.push({ dateKey: key(year, 8, 15), name: "Mariä Himmelfahrt" });
  if (has("TH")) list.push({ dateKey: key(year, 9, 20), name: "Weltkindertag" });
  if (has("BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH")) {
    list.push({ dateKey: key(year, 10, 31), name: "Reformationstag" });
  }
  if (has("BW", "BY", "NW", "RP", "SL")) list.push({ dateKey: key(year, 11, 1), name: "Allerheiligen" });
  if (has("SN")) list.push({ dateKey: bussUndBettag(year), name: "Buß- und Bettag" });
  return list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

const cache = new Map<string, Map<string, string>>();

// Name des Feiertags oder null
export function holidayName(dateKey: string, bundesland: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  const cacheKey = `${year}-${bundesland.toUpperCase()}`;
  let map = cache.get(cacheKey);
  if (!map) {
    map = new Map(holidaysForYear(year, bundesland).map((h) => [h.dateKey, h.name]));
    cache.set(cacheKey, map);
  }
  return map.get(dateKey) ?? null;
}

export function isHoliday(dateKey: string, bundesland: string): boolean {
  return holidayName(dateKey, bundesland) !== null;
}
