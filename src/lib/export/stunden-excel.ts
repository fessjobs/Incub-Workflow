// Excel-Export der Zeiteinträge (exceljs): 4 Blätter – Rohdaten, Summen je
// Person, Summen je Kunde, Lohnarten je Person und Monat. Spaltenbreiten,
// Zahlenformate, Filterzeile, Summenzeile.
import ExcelJS from "exceljs";
import type { DeductionRow, EntryRow } from "@/lib/einsatz/analytics";
import { berlinTime, formatKeyDE } from "@/lib/einsatz/tz";
import type { WageLine } from "@/lib/einsatz/wage";

const HOURS = "0.00";
const MONEY = "#,##0.00 €";
const KM = "0.0";
const REVIEW: Record<string, string> = { ERFASST: "erfasst", GEPRUEFT: "geprüft", FREIGEGEBEN: "freigegeben" };

function header(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3682E" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function sumRow(ws: ExcelJS.Worksheet, label: string, sumCols: string[]) {
  const last = ws.rowCount;
  if (last < 2) return;
  const row = ws.addRow({});
  row.getCell(1).value = label;
  row.font = { bold: true };
  for (const key of sumCols) {
    const col = ws.getColumn(key);
    const letter = col.letter;
    row.getCell(col.number).value = { formula: `SUBTOTAL(9,${letter}2:${letter}${last})` };
    row.getCell(col.number).numFmt = col.numFmt ?? HOURS;
  }
}

export type ExcelInput = {
  rows: EntryRow[];
  wageLines: Map<string, WageLine[]>;
  deductions: DeductionRow[];
  titel: string;
  zeitraum: string;
};

export async function buildStundenExcel(input: ExcelInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "incub:workflow · Einsatzmodul";
  wb.created = new Date();

  // Blatt 1: Zeiteinträge (Rohform)
  const ws1 = wb.addWorksheet("Zeiteinträge");
  ws1.columns = [
    { header: "Datum", key: "datum", width: 12 },
    { header: "Personalnummer", key: "pn", width: 14 },
    { header: "Nachname", key: "nachname", width: 18 },
    { header: "Vorname", key: "vorname", width: 16 },
    { header: "Kunde", key: "kunde", width: 26 },
    { header: "Einsatz-Nr.", key: "nr", width: 14 },
    { header: "Projekt", key: "projekt", width: 22 },
    { header: "Schicht", key: "schicht", width: 14 },
    { header: "Tätigkeit", key: "taetigkeit", width: 16 },
    { header: "Start", key: "start", width: 8 },
    { header: "Ende", key: "ende", width: 8 },
    { header: "Pause (min)", key: "pause", width: 11 },
    { header: "Stunden", key: "stunden", width: 10, style: { numFmt: HOURS } },
    { header: "PKW", key: "pkw", width: 9 },
    { header: "km", key: "km", width: 8, style: { numFmt: KM } },
    { header: "Spesen", key: "spesen", width: 9 },
    { header: "Spesen €", key: "spesenBetrag", width: 11, style: { numFmt: MONEY } },
    { header: "Status", key: "status", width: 12 },
    { header: "Unterschrift", key: "sig", width: 12 },
    { header: "Version", key: "version", width: 8 },
    { header: "Notiz", key: "notiz", width: 30 },
  ];
  for (const r of input.rows) {
    ws1.addRow({
      datum: formatKeyDE(r.datumKey),
      pn: r.employee.personalnummer ?? "",
      nachname: r.employee.nachname,
      vorname: r.employee.vorname,
      kunde: r.customer.name,
      nr: r.assignment.einsatznummer,
      projekt: r.assignment.projekt,
      schicht: r.shift.bezeichnung,
      taetigkeit: r.taetigkeit,
      start: berlinTime(r.istStart),
      ende: berlinTime(r.istEnde),
      pause: r.pauseMinuten,
      stunden: r.stunden,
      pkw: r.pkw ? (r.pkwArt === "FIRMA" ? "Firma" : "privat") : "",
      km: r.pkw ? r.tripsKm : null,
      spesen: r.spesen ? "ja" : "",
      spesenBetrag: r.spesenBetrag,
      status: REVIEW[r.review] ?? r.review,
      sig: r.unterschrieben ? "ja" : "nein",
      version: r.version,
      notiz: r.notiz ?? "",
    });
  }
  header(ws1);
  ws1.autoFilter = { from: "A1", to: `${ws1.getColumn(ws1.columnCount).letter}1` };
  sumRow(ws1, "Summe", ["stunden", "km", "spesenBetrag"]);

  // Blatt 2: Summen je Person
  const ws2 = wb.addWorksheet("Je Person");
  ws2.columns = [
    { header: "Personalnummer", key: "pn", width: 14 },
    { header: "Name", key: "name", width: 28 },
    { header: "Einträge", key: "n", width: 10 },
    { header: "Stunden", key: "stunden", width: 10, style: { numFmt: HOURS } },
    { header: "km privat", key: "kmPrivat", width: 10, style: { numFmt: KM } },
    { header: "km Firma", key: "kmFirma", width: 10, style: { numFmt: KM } },
    { header: "Spesenfälle", key: "spesen", width: 11 },
  ];
  const byPerson = new Map<string, { pn: string; name: string; n: number; stunden: number; kmPrivat: number; kmFirma: number; spesen: number }>();
  for (const r of input.rows) {
    const k = r.employee.id;
    const p = byPerson.get(k) ?? { pn: r.employee.personalnummer ?? "", name: `${r.employee.nachname}, ${r.employee.vorname}`, n: 0, stunden: 0, kmPrivat: 0, kmFirma: 0, spesen: 0 };
    p.n++;
    p.stunden += r.stunden;
    if (r.pkw && r.pkwArt === "PRIVAT") p.kmPrivat += r.tripsKm;
    if (r.pkw && r.pkwArt === "FIRMA") p.kmFirma += r.tripsKm;
    if (r.spesen) p.spesen++;
    byPerson.set(k, p);
  }
  for (const p of [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, "de"))) ws2.addRow(p);
  header(ws2);
  ws2.autoFilter = { from: "A1", to: "G1" };
  sumRow(ws2, "Summe", ["n", "stunden", "kmPrivat", "kmFirma", "spesen"]);

  // Blatt 3: Summen je Kunde
  const ws3 = wb.addWorksheet("Je Kunde");
  ws3.columns = [
    { header: "Kunde", key: "kunde", width: 30 },
    { header: "Einsätze", key: "einsaetze", width: 10 },
    { header: "Einträge", key: "n", width: 10 },
    { header: "Personen", key: "personen", width: 10 },
    { header: "Stunden", key: "stunden", width: 10, style: { numFmt: HOURS } },
  ];
  const byCustomer = new Map<string, { kunde: string; einsaetze: Set<string>; n: number; personen: Set<string>; stunden: number }>();
  for (const r of input.rows) {
    const c = byCustomer.get(r.customer.id) ?? { kunde: r.customer.name, einsaetze: new Set(), n: 0, personen: new Set(), stunden: 0 };
    c.einsaetze.add(r.assignment.id);
    c.personen.add(r.employee.id);
    c.n++;
    c.stunden += r.stunden;
    byCustomer.set(r.customer.id, c);
  }
  for (const c of [...byCustomer.values()].sort((a, b) => b.stunden - a.stunden)) ws3.addRow({ kunde: c.kunde, einsaetze: c.einsaetze.size, n: c.n, personen: c.personen.size, stunden: c.stunden });
  header(ws3);
  ws3.autoFilter = { from: "A1", to: "E1" };
  sumRow(ws3, "Summe", ["einsaetze", "n", "stunden"]);

  // Blatt 4: Lohnarten je Person und Monat
  const ws4 = wb.addWorksheet("Lohnarten");
  ws4.columns = [
    { header: "Monat", key: "monat", width: 10 },
    { header: "Personalnummer", key: "pn", width: 14 },
    { header: "Name", key: "name", width: 28 },
    { header: "Lohnart", key: "lohnart", width: 10 },
    { header: "Bezeichnung", key: "bez", width: 26 },
    { header: "Menge", key: "menge", width: 10, style: { numFmt: HOURS } },
    { header: "Einheit", key: "einheit", width: 9 },
    { header: "Faktor", key: "faktor", width: 8 },
    { header: "Betrag €", key: "betrag", width: 11, style: { numFmt: MONEY } },
  ];
  type Agg = { monat: string; pn: string; name: string; lohnart: string; bez: string; menge: number; einheit: string; faktor: number; betrag: number | null };
  const agg = new Map<string, Agg>();
  const add = (monat: string, pn: string, name: string, l: WageLine) => {
    const k = `${monat}|${pn}|${name}|${l.lohnart}|${l.bezeichnung}`;
    const a = agg.get(k) ?? { monat, pn, name, lohnart: l.lohnart, bez: l.bezeichnung, menge: 0, einheit: l.einheit, faktor: l.faktor, betrag: null };
    a.menge += l.menge;
    if (l.betrag !== null) a.betrag = (a.betrag ?? 0) + l.betrag;
    agg.set(k, a);
  };
  for (const r of input.rows) {
    const monat = r.datumKey.slice(0, 7);
    for (const l of input.wageLines.get(r.id) ?? []) add(monat, r.employee.personalnummer ?? "", `${r.employee.nachname}, ${r.employee.vorname}`, l);
  }
  for (const d of input.deductions) add(d.datumKey.slice(0, 7), d.employee.personalnummer ?? "", `${d.employee.nachname}, ${d.employee.vorname}`, d.line);
  for (const a of [...agg.values()].sort((x, y) => x.monat.localeCompare(y.monat) || x.name.localeCompare(y.name, "de") || x.lohnart.localeCompare(y.lohnart))) {
    ws4.addRow({ ...a, menge: Math.round(a.menge * 100) / 100, betrag: a.betrag === null ? null : Math.round(a.betrag * 100) / 100 });
  }
  header(ws4);
  ws4.autoFilter = { from: "A1", to: "I1" };
  sumRow(ws4, "Summe", ["menge", "betrag"]);

  // Deckblatt-Info in den Eigenschaften
  wb.title = `${input.titel} ${input.zeitraum}`;
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
