// Lohnarten-Ableitung je Zeiteintrag nach konfigurierbaren Regeln
// (Tabelle wage_rules). Reine Funktion, damit sie testbar bleibt und in
// Auswertung, Excel- und zvoove-Export identisch rechnet.
import { z } from "zod";
import { holidayName } from "./holidays";
import { berlinDateKey } from "./tz";
import { minutesInWindows, minutesOnDays, netFactor, round2, splitByBerlinDay, type TimeWindow } from "./hours";

export type WageRuleType =
  | "NORMAL"
  | "NACHT"
  | "SONNTAG"
  | "FEIERTAG"
  | "GARANTIE"
  | "FAHRT_PRIVAT"
  | "FAHRT_FIRMA"
  | "ZULAGE"
  | "SPESEN"
  | "ABZUG";

export type WageRule = {
  id: string;
  name: string;
  typ: WageRuleType;
  bedingung: unknown;
  lohnart: string;
  faktor: number;
  aktiv: boolean;
  sortOrder?: number;
};

// Regelparameter je Typ (alles optional, Vorbelegung siehe DEFAULT_*)
export const NachtBedingung = z.object({
  fenster: z.array(z.object({ von: z.string(), bis: z.string() })).default([{ von: "23:00", bis: "06:00" }]),
});
export const GarantieBedingung = z.object({ stunden: z.number().min(0).default(0) });
export const FahrtBedingung = z.object({ satzProKm: z.number().min(0).default(0) });
export const ZulageBedingung = z.object({
  taetigkeiten: z.array(z.string()).default([]),
  proStunde: z.number().min(0).default(0),
});
export const SpesenBedingung = z.object({ pauschale: z.number().min(0).default(0) });
export const TagBedingung = z.object({
  // Feiertag hat Vorrang vor Sonntag, wenn beides zutrifft
  nichtWennFeiertag: z.boolean().default(true),
});

export type WageEinheit = "Stunden" | "km" | "EUR";

export type WageLine = {
  ruleId: string | null;
  typ: WageRuleType;
  lohnart: string;
  bezeichnung: string;
  menge: number;
  einheit: WageEinheit;
  faktor: number;
  // Betrag nur, wenn ein Satz konfiguriert ist (Fahrten, Zulagen, Spesen)
  betrag: number | null;
  grundlage: string;
};

export type WageEntryInput = {
  id: string;
  istStart: Date;
  istEnde: Date;
  pauseMinuten: number;
  stundenGesamt: number;
  taetigkeit: string | null;
  pkw: boolean;
  pkwArt: "PRIVAT" | "FIRMA" | null;
  spesen: boolean;
  spesenBetrag: number | null;
  tripsKm: number;
};

export type WageContext = {
  entry: WageEntryInput;
  shift: { taetigkeit: string; garantieStunden: number | null };
  bundesland: string;
  employeeZulagen?: string[];
};

function param<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as z.output<S>;
}

function hoursFromMinutes(m: number): number {
  return round2(m / 60);
}

export function computeWageLines(ctx: WageContext, rules: WageRule[]): WageLine[] {
  const { entry, shift, bundesland } = ctx;
  const active = rules.filter((r) => r.aktiv).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const lines: WageLine[] = [];
  const factor = netFactor(entry.istStart, entry.istEnde, entry.pauseMinuten);
  const taetigkeit = (entry.taetigkeit || shift.taetigkeit || "").toLowerCase();
  const holidayDays = splitByBerlinDay(entry.istStart, entry.istEnde)
    .map((s) => holidayName(s.dateKey, bundesland))
    .filter((n): n is string => n !== null);
  const hasHolidayRule = active.some((r) => r.typ === "FEIERTAG");

  for (const rule of active) {
    switch (rule.typ) {
      case "NORMAL": {
        if (entry.stundenGesamt > 0) {
          lines.push(line(rule, entry.stundenGesamt, "Stunden", null, `Netto ${entry.stundenGesamt} h (Pause ${entry.pauseMinuten} min)`));
        }
        break;
      }
      case "GARANTIE": {
        const cfg = param(GarantieBedingung, rule.bedingung);
        const garantie = shift.garantieStunden ?? cfg.stunden;
        if (garantie > 0 && entry.stundenGesamt < garantie) {
          const diff = round2(garantie - entry.stundenGesamt);
          lines.push(line(rule, diff, "Stunden", null, `Auffüllung auf ${garantie} h Garantie (erfasst ${entry.stundenGesamt} h)`));
        }
        break;
      }
      case "NACHT": {
        const cfg = param(NachtBedingung, rule.bedingung);
        const gross = minutesInWindows(entry.istStart, entry.istEnde, cfg.fenster as TimeWindow[]);
        const net = Math.round(gross * factor);
        if (net > 0) {
          const fensterText = cfg.fenster.map((f) => `${f.von}–${f.bis}`).join(", ");
          lines.push(line(rule, hoursFromMinutes(net), "Stunden", null, `${net} min im Nachtfenster ${fensterText}`));
        }
        break;
      }
      case "SONNTAG": {
        const cfg = param(TagBedingung, rule.bedingung);
        const gross = minutesOnDays(entry.istStart, entry.istEnde, (dateKey, weekday) => {
          if (weekday !== 0) return false;
          if (cfg.nichtWennFeiertag && hasHolidayRule && holidayName(dateKey, bundesland)) return false;
          return true;
        });
        const net = Math.round(gross * factor);
        if (net > 0) lines.push(line(rule, hoursFromMinutes(net), "Stunden", null, `${net} min an einem Sonntag`));
        break;
      }
      case "FEIERTAG": {
        const gross = minutesOnDays(entry.istStart, entry.istEnde, (dateKey) => holidayName(dateKey, bundesland) !== null);
        const net = Math.round(gross * factor);
        if (net > 0) {
          lines.push(line(rule, hoursFromMinutes(net), "Stunden", null, `${net} min am Feiertag (${[...new Set(holidayDays)].join(", ")}, ${bundesland})`));
        }
        break;
      }
      case "FAHRT_PRIVAT":
      case "FAHRT_FIRMA": {
        const wanted = rule.typ === "FAHRT_PRIVAT" ? "PRIVAT" : "FIRMA";
        if (entry.pkw && entry.pkwArt === wanted && entry.tripsKm > 0) {
          const cfg = param(FahrtBedingung, rule.bedingung);
          const km = round2(entry.tripsKm);
          const betrag = cfg.satzProKm > 0 ? round2(km * cfg.satzProKm) : null;
          lines.push(line(rule, km, "km", betrag, `${km} km mit ${wanted === "PRIVAT" ? "Privat-PKW (steuerfrei)" : "Firmenfahrzeug (versteuert)"}${cfg.satzProKm ? ` à ${cfg.satzProKm.toFixed(2)} €` : ""}`));
        }
        break;
      }
      case "ZULAGE": {
        const cfg = param(ZulageBedingung, rule.bedingung);
        const keys = cfg.taetigkeiten.map((t) => t.toLowerCase()).filter(Boolean);
        const matchesTaetigkeit = keys.some((k) => taetigkeit.includes(k));
        const matchesEmployee = (ctx.employeeZulagen ?? []).some((z) => keys.includes(z.toLowerCase()));
        if ((matchesTaetigkeit || matchesEmployee) && entry.stundenGesamt > 0) {
          const betrag = cfg.proStunde > 0 ? round2(entry.stundenGesamt * cfg.proStunde) : null;
          lines.push(line(rule, entry.stundenGesamt, "Stunden", betrag, `Zulage ${rule.name} für Tätigkeit „${entry.taetigkeit || shift.taetigkeit}“`));
        }
        break;
      }
      case "SPESEN": {
        if (entry.spesen) {
          const cfg = param(SpesenBedingung, rule.bedingung);
          const betrag = entry.spesenBetrag ?? (cfg.pauschale > 0 ? cfg.pauschale : null);
          lines.push(line(rule, 1, "EUR", betrag, entry.spesenBetrag !== null ? "Spesen laut Erfassung" : "Spesenpauschale"));
        }
        break;
      }
      case "ABZUG":
        // Abzüge werden manuell erfasst (manual_deductions), nicht regelbasiert
        break;
    }
  }
  return lines;
}

function line(rule: WageRule, menge: number, einheit: WageEinheit, betrag: number | null, grundlage: string): WageLine {
  return {
    ruleId: rule.id,
    typ: rule.typ,
    lohnart: rule.lohnart,
    bezeichnung: rule.name,
    menge,
    einheit,
    faktor: rule.faktor,
    betrag,
    grundlage,
  };
}

// Manueller Abzug als Lohnzeile
export function deductionLine(d: { id: string; lohnart: string; stunden: number | null; betrag: number | null; grund: string }): WageLine {
  return {
    ruleId: null,
    typ: "ABZUG",
    lohnart: d.lohnart,
    bezeichnung: "Abzug",
    menge: d.stunden !== null ? -Math.abs(d.stunden) : 1,
    einheit: d.stunden !== null ? "Stunden" : "EUR",
    faktor: 1,
    betrag: d.betrag !== null ? -Math.abs(d.betrag) : null,
    grundlage: d.grund,
  };
}

// Standard-Regelsatz (Seed / "Standard wiederherstellen")
export const DEFAULT_WAGE_RULES: Array<Omit<WageRule, "id"> & { sortOrder: number }> = [
  { name: "Normalstunden", typ: "NORMAL", bedingung: {}, lohnart: "100", faktor: 1, aktiv: true, sortOrder: 10 },
  { name: "Garantiestunden", typ: "GARANTIE", bedingung: { stunden: 4 }, lohnart: "100", faktor: 1, aktiv: true, sortOrder: 20 },
  { name: "Nachtzuschlag 23–6 Uhr", typ: "NACHT", bedingung: { fenster: [{ von: "23:00", bis: "06:00" }] }, lohnart: "166", faktor: 0.25, aktiv: true, sortOrder: 30 },
  { name: "Sonntagszuschlag", typ: "SONNTAG", bedingung: { nichtWennFeiertag: true }, lohnart: "146", faktor: 0.5, aktiv: true, sortOrder: 40 },
  { name: "Feiertagszuschlag", typ: "FEIERTAG", bedingung: {}, lohnart: "156", faktor: 1, aktiv: true, sortOrder: 50 },
  { name: "Fahrtkosten Privat-PKW", typ: "FAHRT_PRIVAT", bedingung: { satzProKm: 0.3 }, lohnart: "700", faktor: 1, aktiv: true, sortOrder: 60 },
  { name: "Fahrtkosten Firmenfahrzeug", typ: "FAHRT_FIRMA", bedingung: { satzProKm: 0 }, lohnart: "701", faktor: 1, aktiv: true, sortOrder: 61 },
  { name: "Zulage Stapler", typ: "ZULAGE", bedingung: { taetigkeiten: ["stapler", "gabelstapler", "forklift"], proStunde: 1.5 }, lohnart: "210", faktor: 1, aktiv: true, sortOrder: 70 },
  { name: "Zulage Rigger", typ: "ZULAGE", bedingung: { taetigkeiten: ["rigger", "rigging"], proStunde: 2 }, lohnart: "211", faktor: 1, aktiv: true, sortOrder: 71 },
  { name: "Spesen", typ: "SPESEN", bedingung: { pauschale: 14 }, lohnart: "800", faktor: 1, aktiv: true, sortOrder: 80 },
  { name: "Abzug (manuell)", typ: "ABZUG", bedingung: {}, lohnart: "900", faktor: 1, aktiv: true, sortOrder: 90 },
];

export function berlinDayOf(entry: Pick<WageEntryInput, "istStart">): string {
  return berlinDateKey(entry.istStart);
}
