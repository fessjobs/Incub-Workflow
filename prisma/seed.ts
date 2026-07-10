// Seed: ein Mandant (incub-Gruppe), Admin-Konto, Firmen-Vorbefüllung nach
// Spec Abschnitt 4 und Standard-Kategorien nach Spec Abschnitt 5.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COMPANIES: Array<{
  brandName: string;
  shortCode: string;
  location?: string;
  legalName?: string;
  isPrivate?: boolean;
}> = [
  { brandName: "fess.jobs", shortCode: "FJ", location: "Idar-Oberstein / Mannheim / Stuttgart" },
  { brandName: "Eventcrue", shortCode: "EC", location: "Luhden" },
  { brandName: "europersonal", shortCode: "EP", location: "Augsburg" },
  { brandName: "eques", shortCode: "EQ", location: "Wetzlar" },
  { brandName: "FESS recruitment", shortCode: "FR", location: "Göppingen" },
  { brandName: "3S", shortCode: "3S", location: "Mönchengladbach" },
  { brandName: "incub:live GmbH", shortCode: "IL", legalName: "incub:live GmbH" },
  { brandName: "Janke Solutions GmbH", shortCode: "JS", legalName: "Janke Solutions GmbH" },
  { brandName: "Privat", shortCode: "PRIV", isPrivate: true },
];

const CATEGORIES = [
  { name: "Bewirtung", isHospitality: true },
  { name: "Fahrtkosten/Tanken" },
  { name: "Material/Equipment" },
  { name: "Büro" },
  { name: "Porto/Versand" },
  { name: "Software/Abos" },
  { name: "Reisekosten/Hotel" },
  { name: "Verpflegung" },
  { name: "Werbung/Marketing" },
  { name: "Sonstiges" },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "incub" },
    update: {},
    create: {
      name: "incub:live Unternehmensgruppe",
      slug: "incub",
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@incub.live";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "incub2026!";
  const adminName = process.env.ADMIN_NAME ?? "Maik Janke";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: adminName,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
  });

  for (const [i, c] of COMPANIES.entries()) {
    await prisma.company.upsert({
      where: {
        organizationId_shortCode: { organizationId: org.id, shortCode: c.shortCode },
      },
      update: {},
      create: {
        organizationId: org.id,
        brandName: c.brandName,
        shortCode: c.shortCode,
        location: c.location,
        legalName: c.legalName,
        isPrivate: c.isPrivate ?? false,
        sortOrder: i,
      },
    });
  }

  for (const [i, cat] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: {
        organizationId_name: { organizationId: org.id, name: cat.name },
      },
      update: {},
      create: {
        organizationId: org.id,
        name: cat.name,
        isHospitality: cat.isHospitality ?? false,
        sortOrder: i,
      },
    });
  }

  console.log(`Seed abgeschlossen. Admin-Login: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
