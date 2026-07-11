import ExcelJS from "exceljs";
import { vatOf } from "@/lib/analytics";
import { KIND_LABELS, REIMBURSEMENT_LABELS } from "@/lib/format";

export type ExportReceipt = {
  receiptNumber: string | null;
  receiptDate: Date;
  vendor: string;
  category: string | null;
  kind: string;
  grossAmount: unknown;
  netAmount: unknown;
  vatLines: unknown;
  companyName: string | null;
  userName: string;
  reimbursementStatus: string;
  purpose: string | null;
};

// Excel-Export einer (gefilterten) Belegliste inkl. Summenzeile je Kategorie
// (Spec Abschnitt 9).
export async function buildExcel(receipts: ExportReceipt[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "incub:workflow";
  const ws = wb.addWorksheet("Belege");

  const columns = [
    { header: "Belegnummer", key: "num", width: 18 },
    { header: "Datum", key: "date", width: 12 },
    { header: "Aussteller", key: "vendor", width: 28 },
    { header: "Kategorie", key: "cat", width: 20 },
    { header: "Art", key: "kind", width: 14 },
    { header: "Netto", key: "net", width: 12 },
    { header: "USt", key: "vat", width: 12 },
    { header: "Brutto", key: "gross", width: 12 },
    { header: "Firma", key: "company", width: 20 },
    { header: "Einreicher", key: "user", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Anlass", key: "purpose", width: 32 },
  ];
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1220" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  // nach Kategorie gruppiert, mit Zwischensummen
  const byCat = new Map<string, ExportReceipt[]>();
  for (const r of receipts) {
    const cat = r.category ?? "Ohne Kategorie";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const cats = [...byCat.keys()].sort();

  const money = "#,##0.00 €";
  let grandNet = 0;
  let grandVat = 0;
  let grandGross = 0;

  for (const cat of cats) {
    let catNet = 0;
    let catVat = 0;
    let catGross = 0;
    for (const r of byCat.get(cat)!) {
      const gross = Number(r.grossAmount) || 0;
      const vat = vatOf(r);
      const net = r.netAmount !== null && r.netAmount !== undefined ? Number(r.netAmount) : gross - vat;
      catNet += net;
      catVat += vat;
      catGross += gross;
      const row = ws.addRow({
        num: r.receiptNumber ?? "",
        date: r.receiptDate,
        vendor: r.vendor,
        cat,
        kind: KIND_LABELS[r.kind] ?? r.kind,
        net,
        vat,
        gross,
        company: r.companyName ?? "",
        user: r.userName,
        status: REIMBURSEMENT_LABELS[r.reimbursementStatus] ?? r.reimbursementStatus,
        purpose: r.purpose ?? "",
      });
      row.getCell("date").numFmt = "dd.mm.yyyy";
      row.getCell("net").numFmt = money;
      row.getCell("vat").numFmt = money;
      row.getCell("gross").numFmt = money;
    }
    const sumRow = ws.addRow({ vendor: `Summe ${cat}`, net: catNet, vat: catVat, gross: catGross });
    sumRow.font = { bold: true };
    sumRow.getCell("net").numFmt = money;
    sumRow.getCell("vat").numFmt = money;
    sumRow.getCell("gross").numFmt = money;
    ws.addRow({});
    grandNet += catNet;
    grandVat += catVat;
    grandGross += catGross;
  }

  const total = ws.addRow({ vendor: "Gesamt", net: grandNet, vat: grandVat, gross: grandGross });
  total.font = { bold: true };
  total.eachCell((c) => (c.border = { top: { style: "thin" } }));
  total.getCell("net").numFmt = money;
  total.getCell("vat").numFmt = money;
  total.getCell("gross").numFmt = money;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
