import { db } from "@/lib/db";

// Demo-Daten für Produktvorführungen (Spec Abschnitt 11). Klar als isDemo
// markiert und per Schalter rückstandslos entfernbar. Bewusst ohne Dateien –
// füllt Listen, Auswertungen und den Abgleich mit realistischen Zahlen.

const SAMPLES = [
  { short: "FJ", vendor: "REWE Markt", cat: "Büro", kind: "FIRMENZAHLUNG", gross: 42.9, month: 0, purpose: "Büromaterial" },
  { short: "FJ", vendor: "Shell Tankstelle", cat: "Fahrtkosten/Tanken", kind: "AUSLAGE", gross: 78.5, month: 1, purpose: "Dienstfahrt Kunde" },
  { short: "FJ", vendor: "Ristorante Roma", cat: "Bewirtung", kind: "FIRMENZAHLUNG", gross: 156.8, month: 2, purpose: "Geschäftsessen" },
  { short: "EC", vendor: "Amazon Business", cat: "Material/Equipment", kind: "FIRMENZAHLUNG", gross: 233.0, month: 1, purpose: "Veranstaltungstechnik" },
  { short: "EC", vendor: "Deutsche Bahn", cat: "Reisekosten/Hotel", kind: "AUSLAGE", gross: 119.9, month: 2, purpose: "Anreise Event" },
  { short: "EP", vendor: "Adobe", cat: "Software/Abos", kind: "FIRMENZAHLUNG", gross: 59.49, month: 0, purpose: "Creative Cloud" },
  { short: "EP", vendor: "DHL", cat: "Porto/Versand", kind: "FIRMENZAHLUNG", gross: 14.9, month: 2, purpose: "Materialversand" },
  { short: "PRIV", vendor: "Bäckerei Klein", cat: "Verpflegung", kind: "PRIVAT", gross: 8.4, month: 1, purpose: "Teamfrühstück" },
  { short: "FJ", vendor: "Facebook Ads", cat: "Werbung/Marketing", kind: "FIRMENZAHLUNG", gross: 320.0, month: 0, purpose: "Recruiting-Kampagne" },
];

export async function loadDemoData(organizationId: string, userId: string): Promise<number> {
  const year = new Date().getFullYear();
  const companies = await db.company.findMany({ where: { organizationId } });
  const categories = await db.category.findMany({ where: { organizationId } });
  const compByShort = new Map(companies.map((c) => [c.shortCode, c]));
  const catByName = new Map(categories.map((c) => [c.name, c]));

  let created = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const company = compByShort.get(s.short);
    if (!company) continue;
    const category = catByName.get(s.cat);
    const gross = s.gross;
    const net = Math.round((gross / 1.19) * 100) / 100;
    const vat = Math.round((gross - net) * 100) / 100;
    await db.receipt.create({
      data: {
        organizationId,
        userId,
        companyId: company.id,
        categoryId: category?.id ?? null,
        receiptNumber: `DEMO-${company.shortCode}-${String(i + 1).padStart(3, "0")}`,
        numberYear: year,
        numberSeq: 9000 + i,
        receiptDate: new Date(year, s.month, 5 + i),
        vendor: s.vendor,
        grossAmount: gross,
        netAmount: net,
        vatLines: [{ rate: 19, net, vat }] as unknown as object,
        kind: s.kind as never,
        paymentMethod: s.kind === "AUSLAGE" ? "PRIVATE_KARTE" : "FIRMENKARTE",
        purpose: s.purpose,
        approved: i % 2 === 0,
        status: "ABGELEGT",
        reimbursementStatus: s.kind === "AUSLAGE" ? "OFFEN" : "OFFEN",
        isDemo: true,
      },
    });
    created++;
  }

  // Demo-Bankkonto mit ein paar Buchungen (eine passt zu einem Beleg)
  const fj = compByShort.get("FJ");
  const account = await db.bankAccount.create({
    data: {
      organizationId,
      companyId: fj?.id ?? null,
      name: "Demo-Geschäftskonto",
      iban: "DE00 0000 0000 0000 0000 00",
      isDemo: true,
    },
  });
  const demoTxns = [
    { d: new Date(year, 0, 5), amount: -42.9, party: "REWE Markt", purpose: "Kartenzahlung" },
    { d: new Date(year, 0, 3), amount: -320.0, party: "Facebook", purpose: "Ads" },
    { d: new Date(year, 1, 1), amount: -1250.0, party: "Vermieter Immo GmbH", purpose: "Miete" },
    { d: new Date(year, 2, 15), amount: 78.5, party: "fess.jobs", purpose: "Erstattung" },
  ];
  for (const t of demoTxns) {
    await db.bankTransaction.create({
      data: {
        organizationId,
        bankAccountId: account.id,
        bookingDate: t.d,
        amount: t.amount,
        counterparty: t.party,
        purpose: t.purpose,
      },
    });
  }

  return created;
}

export async function clearDemoData(organizationId: string): Promise<void> {
  // Buchungen der Demo-Konten zuerst (FK), dann Konten, dann Belege
  const demoAccounts = await db.bankAccount.findMany({ where: { organizationId, isDemo: true }, select: { id: true } });
  const ids = demoAccounts.map((a) => a.id);
  if (ids.length > 0) {
    await db.bankTransaction.deleteMany({ where: { bankAccountId: { in: ids } } });
    await db.bankAccount.deleteMany({ where: { id: { in: ids } } });
  }
  await db.receipt.deleteMany({ where: { organizationId, isDemo: true } });
}

export async function demoCount(organizationId: string): Promise<number> {
  return db.receipt.count({ where: { organizationId, isDemo: true } });
}
