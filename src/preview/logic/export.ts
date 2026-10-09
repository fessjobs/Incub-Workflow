// Export der Stundentabelle (Modul E): zvoove-CSV mit einstellbarem Mapping,
// Excel-Spalten, Prüfbericht. Nacht, Sonntag und Feiertag rechnet zvoove über
// den Tarifvertrag – hier gehen nur Arbeitszeiten und Beträge hinaus.
import type { Crew, StundenRow, Warnung } from "./types";
import { formatDatumDE, gesamtzeit } from "./zeit";

export interface LohnartZeile {
  schluessel: "arbeitszeit" | "garantie" | "spesen" | "reisePrivat" | "reiseGesch" | "bonus" | "abzug";
  label: string;
  lohnart: string;
  // Noch nicht mit der Lohnbuchhaltung abgestimmt (Plan: „mit Daniel abstimmen“)
  abgestimmt: boolean;
}

export const DEFAULT_LOHNARTEN: LohnartZeile[] = [
  { schluessel: "arbeitszeit", label: "Arbeitszeit", lohnart: "100", abgestimmt: true },
  { schluessel: "garantie", label: "Garantiestunden (Aufstockung)", lohnart: "100", abgestimmt: true },
  { schluessel: "spesen", label: "Spesen", lohnart: "800", abgestimmt: true },
  { schluessel: "reisePrivat", label: "Reisekosten privat (km × Satz)", lohnart: "700", abgestimmt: true },
  { schluessel: "reiseGesch", label: "Reisekosten geschäftlich", lohnart: "701", abgestimmt: true },
  { schluessel: "bonus", label: "Bonus", lohnart: "", abgestimmt: false },
  { schluessel: "abzug", label: "Abzug", lohnart: "900", abgestimmt: false },
];

export interface ExportEinstellungen {
  kmSatzPrivat: number; // € je km, steuerfreier Satz für Privat-PKW
  lohnarten: LohnartZeile[];
  trennzeichen: string;
}

export const DEFAULT_EXPORT: ExportEinstellungen = {
  kmSatzPrivat: 0.3,
  lohnarten: DEFAULT_LOHNARTEN,
  trennzeichen: ";",
};

export interface ExportZeile {
  personalnummer: string;
  datum: string;
  lohnart: string;
  stunden: number | null;
  kunde: string;
  auftrag: string;
  taetigkeit: string;
  betrag: number | null;
  bemerkung: string;
  quelleZeile: string;
}

const dez = (n: number, st = 2) => n.toFixed(st).replace(".", ",");

export function exportZeilen(rows: StundenRow[], taetigkeitJeAuftrag: (auftrag: string) => string, s: ExportEinstellungen): { zeilen: ExportZeile[]; probleme: Array<{ zeile: string; text: string }> } {
  const zeilen: ExportZeile[] = [];
  const probleme: Array<{ zeile: string; text: string }> = [];
  const la = (k: LohnartZeile["schluessel"]) => s.lohnarten.find((l) => l.schluessel === k)?.lohnart ?? "";

  const push = (r: StundenRow, k: LohnartZeile["schluessel"], stunden: number | null, betrag: number | null, extra = "") => {
    const lohnart = la(k);
    if (!lohnart) probleme.push({ zeile: r.id, text: `${s.lohnarten.find((l) => l.schluessel === k)?.label ?? k}: Lohnart nicht abgestimmt (${formatDatumDE(r.datum)}, ${r.pnr}).` });
    zeilen.push({
      personalnummer: r.pnr,
      datum: formatDatumDE(r.datum),
      lohnart,
      stunden,
      kunde: r.kunde,
      auftrag: r.auftrag,
      taetigkeit: taetigkeitJeAuftrag(r.auftrag),
      betrag,
      bemerkung: [r.bemerkung, extra].filter(Boolean).join(" · "),
      quelleZeile: r.id,
    });
  };

  for (const r of rows) {
    const ist = gesamtzeit(r.start, r.ende, r.pausen);
    push(r, "arbeitszeit", ist, null);
    if (r.pauschale > ist) push(r, "garantie", Math.round((r.pauschale - ist) * 100) / 100, null, `Garantie ${dez(r.pauschale)} h`);
    if (r.spesen > 0) push(r, "spesen", null, r.spesen);
    if (r.reiseKm > 0) push(r, "reisePrivat", null, Math.round(r.reiseKm * s.kmSatzPrivat * 100) / 100, `${dez(r.reiseKm, 1)} km`);
    if (r.reiseGesch > 0) push(r, "reiseGesch", null, r.reiseGesch);
    if (r.bonus > 0) push(r, "bonus", null, r.bonus);
    if (r.abzug > 0) push(r, "abzug", null, -r.abzug);
  }
  return { zeilen, probleme };
}

export const ZVOOVE_KOPF = ["Personalnummer", "Datum", "Lohnart", "Stunden", "Kunde", "Auftrag", "Tätigkeit", "Betrag", "Bemerkung"];

export function zvooveCsv(zeilen: ExportZeile[], trennzeichen = ";"): string {
  const esc = (v: string) => (v.includes(trennzeichen) || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [ZVOOVE_KOPF.join(trennzeichen)];
  for (const z of zeilen) {
    lines.push(
      [z.personalnummer, z.datum, z.lohnart, z.stunden === null ? "" : dez(z.stunden), z.kunde, z.auftrag, z.taetigkeit, z.betrag === null ? "" : dez(z.betrag), z.bemerkung].map(esc).join(trennzeichen)
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export const EXCEL_KOPF = [
  "Datum", "Personalnummer", "Vorname", "Nachname", "Startzeit", "Pause von", "Pause bis", "Endzeit", "Gesamtzeit", "Pauschale",
  "Kunde", "Auftrag", "Spesen", "Reisekosten privat (km)", "Reisekosten geschäftlich", "Bonus", "Abzug", "Bemerkung",
];

// Die 18 Spalten der Stundentabelle; weitere Pausen hängen sich an die Bemerkung
export function excelCsv(rows: StundenRow[], crew: Map<string, Crew>, trennzeichen = ";"): string {
  const esc = (v: string) => (v.includes(trennzeichen) || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [EXCEL_KOPF.join(trennzeichen)];
  for (const r of rows) {
    const c = crew.get(r.pnr);
    const p1 = r.pausen[0];
    const weitere = r.pausen.slice(1).map((p) => `Pause ${p.von}–${p.bis}`);
    lines.push(
      [
        formatDatumDE(r.datum), r.pnr, c?.vorname ?? "", c?.nachname ?? "", r.start, p1?.von ?? "", p1?.bis ?? "", r.ende,
        dez(gesamtzeit(r.start, r.ende, r.pausen)), dez(r.pauschale), r.kunde, r.auftrag, dez(r.spesen), dez(r.reiseKm, 1), dez(r.reiseGesch), dez(r.bonus), dez(r.abzug),
        [r.bemerkung, ...weitere].filter(Boolean).join(" · "),
      ].map(String).map(esc).join(trennzeichen)
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export interface Pruefbericht {
  zeilenGesamt: number;
  exportierbar: number;
  ohneFreigabe: number;
  mitFehler: number;
  warnungen: number;
  lohnartProbleme: Array<{ zeile: string; text: string }>;
}

export function pruefbericht(rows: StundenRow[], warn: Map<string, Warnung[]>, probleme: Array<{ zeile: string; text: string }>): Pruefbericht {
  const mitFehler = rows.filter((r) => (warn.get(r.id) ?? []).some((w) => w.level === "fehler")).length;
  const warnungen = rows.reduce((n, r) => n + (warn.get(r.id) ?? []).filter((w) => w.level === "warnung").length, 0);
  const ohneFreigabe = rows.filter((r) => r.status === "offen" || r.status === "geprueft").length;
  return {
    zeilenGesamt: rows.length,
    exportierbar: rows.filter((r) => r.status === "freigegeben" && !(warn.get(r.id) ?? []).some((w) => w.level === "fehler")).length,
    ohneFreigabe,
    mitFehler,
    warnungen,
    lohnartProbleme: probleme,
  };
}
