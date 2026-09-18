// Zeitzonen-Helfer für Europe/Berlin. Speicherung erfolgt immer in UTC
// (Date-Objekte), Anzeige und Wandzeit-Logik (Nachtfenster, Tageswechsel,
// Sonntag/Feiertag) laufen über diese Funktionen. Keine externe Bibliothek,
// damit der Build auf Railway schlank bleibt.

export const TZ = "Europe/Berlin";

export type LocalParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sonntag … 6 = Samstag
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toBerlin(date: Date): LocalParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

// Offset Berlin gegenüber UTC in Minuten zu einem Zeitpunkt (+60 / +120)
export function berlinOffsetMinutes(date: Date): number {
  const p = toBerlin(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Wandzeit in Berlin → UTC-Zeitpunkt. dateKey "YYYY-MM-DD", time "HH:mm".
export function fromBerlin(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error(`Ungültige Wandzeit: ${dateKey} ${time}`);
  }
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let result = guess - berlinOffsetMinutes(new Date(guess)) * 60000;
  // Zweiter Durchlauf für die DST-Kante (Offset am Ergebnis prüfen)
  const offset2 = berlinOffsetMinutes(new Date(result));
  result = guess - offset2 * 60000;
  return new Date(result);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" des Berliner Kalendertags
export function berlinDateKey(date: Date): string {
  const p = toBerlin(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// "HH:mm" Berliner Wandzeit
export function berlinTime(date: Date): string {
  const p = toBerlin(date);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

// Kalendertag verschieben (auf Schlüssel-Ebene, DST-sicher)
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function startOfBerlinDay(dateKey: string): Date {
  return fromBerlin(dateKey, "00:00");
}

export function endOfBerlinDay(dateKey: string): Date {
  return startOfBerlinDay(addDaysToKey(dateKey, 1));
}

// Prisma @db.Date-Spalten liefern ein Date um 00:00 UTC – der Kalendertag ist
// der UTC-Tag, nicht der Berliner Tag.
export function dateOnlyKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function keyToDateOnly(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isValidDateKey(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = keyToDateOnly(v);
  return !Number.isNaN(d.getTime()) && dateOnlyKey(d) === v;
}

export function isValidTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// Deutsches Datumsformat aus Schlüssel
export function formatKeyDE(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

export function weekdayDE(weekday: number): string {
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][weekday] ?? "";
}

export function nowBerlinKey(): string {
  return berlinDateKey(new Date());
}
