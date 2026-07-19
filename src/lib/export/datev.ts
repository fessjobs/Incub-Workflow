import JSZip from "jszip";
import { db } from "@/lib/db";
import { buildExcel, type ExportReceipt } from "./excel";
import { slugForFile, monthFolder, PAYMENT_LABELS } from "@/lib/format";

// DATEV-Monatsexport für die Buchhaltung:
// - je Firma ein Buchungsstapel im EXTF-CSV-Format (direkt in DATEV einspielbar;
//   Sachkonten beim Import prüfen/zuordnen)
// - alle Beleg-PDFs sortiert nach Firma / Zahlungsart (Firmenkarten einzeln)
// - Excel-Gesamtübersicht
//
// Standard-Konten (SKR03, beim Import anpassbar):
//   Aufwand 4900 · Gegenkonto: Auslage privat 1890, sonst Bank 1200

const DEFAULT_EXPENSE_ACCOUNT = "4900";
const CONTRA_PRIVATE = "1890";
const CONTRA_BANK = "1200";

type DatevReceipt = {
  receiptNumber: string | null;
  receiptDate: Date;
  vendor: string;
  grossAmount: unknown;
  purpose: string | null;
  kind: string;
  submittedByName: string | null;
  userName: string;
};

function decimalComma(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function ddmm(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// EXTF-Buchungsstapel (DATEV-Format v700). Kopfzeile + Spaltenüberschriften +
// eine Buchungszeile je Beleg.
export function buildDatevCsv(params: {
  receipts: DatevReceipt[];
  consultantNumber?: string;
  clientNumber?: string;
  year: number;
  month: number; // 0-basiert
  companyName: string;
}): Buffer {
  const from = new Date(params.year, params.month, 1);
  const to = new Date(params.year, params.month + 1, 0);
  const fiscalStart = `${params.year}0101`;
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const created = new Date();
  const createdStamp = `${fmt(created)}${String(created.getHours()).padStart(2, "0")}${String(created.getMinutes()).padStart(2, "0")}${String(created.getSeconds()).padStart(2, "0")}000`;

  // Kopfzeile (Metadaten des Stapels)
  const header = [
    csvField("EXTF"), // Kennzeichen: externes Format
    "700", // Versionsnummer
    "21", // Formatkategorie: Buchungsstapel
    csvField("Buchungsstapel"),
    "12", // Formatversion
    createdStamp,
    "", // Importiert
    csvField("RE"), // Herkunft
    csvField("incub:workflow"),
    "", // Beraternummer-Feld "Exportiert von"
    params.consultantNumber ?? "0", // Berater
    params.clientNumber ?? "0", // Mandant
    fiscalStart, // WJ-Beginn
    "4", // Sachkontenlänge
    fmt(from), // Datum von
    fmt(to), // Datum bis
    csvField(`${params.companyName} ${monthFolder(from)} ${params.year}`), // Bezeichnung
    csvField(""), // Diktatkürzel
    "1", // Buchungstyp: Finanzbuchführung
    "0", // Rechnungslegungszweck
    "0", // Festschreibung: nein
    csvField("EUR"),
  ].join(";");

  const columns = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Kurs",
    "Basis-Umsatz",
    "WKZ Basis-Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Skonto",
    "Buchungstext",
  ]
    .map(csvField)
    .join(";");

  const rows = params.receipts.map((r) => {
    const gross = Number(r.grossAmount) || 0;
    const contra = r.kind === "AUSLAGE" ? CONTRA_PRIVATE : CONTRA_BANK;
    const submitter = r.submittedByName || r.userName;
    const text = `${r.vendor || "Beleg"}${r.purpose ? ` ${r.purpose}` : ""} (${submitter})`.slice(0, 60);
    return [
      decimalComma(gross),
      csvField("S"),
      csvField("EUR"),
      "",
      "",
      "",
      DEFAULT_EXPENSE_ACCOUNT,
      contra,
      csvField(""),
      ddmm(r.receiptDate),
      csvField((r.receiptNumber ?? "").slice(0, 36)),
      csvField(""),
      "",
      csvField(text),
    ].join(";");
  });

  // DATEV erwartet ANSI (CP1252) – latin1 deckt die deutschen Umlaute ab
  return Buffer.from([header, columns, ...rows].join("\r\n") + "\r\n", "latin1");
}

// Ordnername je Zahlungsart; Firmenkarten einzeln (z. B. "Firmenkarte-Amex-Maik")
function paymentFolder(paymentMethod: string, cardLabel: string | null): string {
  if (paymentMethod === "FIRMENKARTE" && cardLabel) return `Firmenkarte-${slugForFile(cardLabel)}`;
  return slugForFile(PAYMENT_LABELS[paymentMethod] ?? paymentMethod);
}

export async function buildDatevZip(params: {
  organizationId: string;
  year: number;
  month: number; // 0-basiert
  companyId?: string;
}): Promise<{ filename: string; bytes: Buffer } | null> {
  const from = new Date(params.year, params.month, 1);
  const to = new Date(params.year, params.month + 1, 0, 23, 59, 59);

  const receipts = await db.receipt.findMany({
    where: {
      organizationId: params.organizationId,
      status: "ABGELEGT",
      receiptDate: { gte: from, lte: to },
      // Mitarbeiter-Link-Belege erst nach Admin-Freigabe
      OR: [{ viaEmployeeLink: false }, { employeeReview: "FREIGEGEBEN" }],
      ...(params.companyId ? { companyId: params.companyId } : {}),
    },
    orderBy: [{ companyId: "asc" }, { receiptDate: "asc" }],
    include: {
      category: true,
      company: true,
      user: true,
      corporateCard: true,
      files: { where: { kind: "PDF" }, select: { bytes: true, filename: true } },
    },
  });
  if (receipts.length === 0) return null;

  const stamp = `${params.year}-${String(params.month + 1).padStart(2, "0")}`;
  const root = `DATEV_${stamp}`;
  const zip = new JSZip();

  // Nach Firma gruppieren
  const byCompany = new Map<string, typeof receipts>();
  for (const r of receipts) {
    const key = r.company?.brandName ?? "Ohne Firma";
    const list = byCompany.get(key) ?? [];
    list.push(r);
    byCompany.set(key, list);
  }

  for (const [companyName, list] of byCompany) {
    const companySlug = slugForFile(companyName);

    // Buchungsstapel-CSV je Firma
    const csv = buildDatevCsv({
      receipts: list.map((r) => ({
        receiptNumber: r.receiptNumber,
        receiptDate: r.receiptDate,
        vendor: r.vendor,
        grossAmount: r.grossAmount,
        purpose: r.purpose,
        kind: r.kind,
        submittedByName: r.submittedByName,
        userName: r.user.name,
      })),
      year: params.year,
      month: params.month,
      companyName,
    });
    zip.file(`${root}/EXTF_Buchungsstapel_${companySlug}_${stamp}.csv`, csv);

    // PDFs: Firma / Zahlungsart (Firmenkarte einzeln) / Datei
    for (const r of list) {
      const pdf = r.files[0];
      if (!pdf) continue;
      const folder = paymentFolder(r.paymentMethod, r.corporateCard?.label ?? null);
      zip.file(`${root}/Belege/${companySlug}/${folder}/${pdf.filename}`, Buffer.from(pdf.bytes));
    }

    // Mitarbeiter-Auslagen zusätzlich gesammelt pro Person
    for (const r of list) {
      if (!r.viaEmployeeLink) continue;
      const pdf = r.files[0];
      if (!pdf) continue;
      const person = slugForFile(r.submittedByName || "Unbekannt");
      zip.file(`${root}/Auslagen-Mitarbeiter/${person}/${pdf.filename}`, Buffer.from(pdf.bytes));
    }
  }

  // Excel-Gesamtübersicht
  const exportRows: ExportReceipt[] = receipts.map((r) => ({
    receiptNumber: r.receiptNumber,
    receiptDate: r.receiptDate,
    vendor: r.vendor,
    category: r.category?.name ?? null,
    kind: r.kind,
    grossAmount: r.grossAmount,
    netAmount: r.netAmount,
    vatLines: r.vatLines,
    companyName: r.company?.brandName ?? null,
    userName: r.submittedByName || r.user.name,
    reimbursementStatus: r.reimbursementStatus,
    purpose: r.purpose,
  }));
  const excel = await buildExcel(exportRows, `DATEV ${monthFolder(from)} ${params.year}`);
  zip.file(`${root}/Uebersicht_${stamp}.xlsx`, excel);

  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  return { filename: `${root}.zip`, bytes };
}
