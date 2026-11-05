// Einsatzliste: Spalte „Stunden in zvoove“ mit Kästchen zum Abhaken – bleibt gespeichert, lässt sich filtern und zurücknehmen.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? /DATABASE_URL="?([^"\n]+)"?/.exec(readFileSync(".env", "utf8"))?.[1] });
let kundeId = "";
let einsatzId = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const org = await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { organizationId: true } });
  kundeId = (await db.customer.create({ data: { organizationId: org.organizationId, name: `zvoove-Kunde ${RUN}` } })).id;
  const tag = new Date("2036-03-03T00:00:00Z");
  einsatzId = (
    await db.assignment.create({
      data: { organizationId: org.organizationId, customerId: kundeId, projekt: `zvoove ${RUN}`, einsatzort: "Stuttgart", datumVon: tag, datumBis: tag, einsatznummer: `Z-${RUN}`, status: "ABGESCHLOSSEN" },
    })
  ).id;
});

test.afterAll(async () => {
  await db.assignment.deleteMany({ where: { customerId: kundeId } });
  await db.customer.deleteMany({ where: { id: kundeId } });
  await db.$disconnect();
});

test("Spalte „Stunden in zvoove“: abhaken, bleibt nach dem Neuladen, filtern, zurücknehmen", async ({ page }) => {
  await login(page);
  await page.goto(`/einsaetze?q=zvoove ${RUN}`);
  await expect(page.getByRole("columnheader", { name: "Stunden in zvoove" })).toBeVisible();
  const haken = page.getByTestId(`zvoove-${einsatzId}`);
  await expect(haken).not.toBeChecked();
  await haken.check();
  await expect.poll(async () => (await db.assignment.findUniqueOrThrow({ where: { id: einsatzId } })).zvooveErledigt).toBe(true);
  const a = await db.assignment.findUniqueOrThrow({ where: { id: einsatzId } });
  expect(a.zvooveAm).not.toBeNull();
  expect(a.zvooveVon).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId(`zvoove-${einsatzId}`)).toBeChecked();

  // Filter: offen zeigt ihn nicht, erledigt schon
  await page.goto(`/einsaetze?q=zvoove ${RUN}&zvoove=offen`);
  await expect(page.getByTestId(`zvoove-${einsatzId}`)).toHaveCount(0);
  await page.goto(`/einsaetze?q=zvoove ${RUN}&zvoove=erledigt`);
  await expect(page.getByTestId(`zvoove-${einsatzId}`)).toBeChecked();

  // Zurücknehmen
  await page.getByTestId(`zvoove-${einsatzId}`).uncheck();
  await expect.poll(async () => (await db.assignment.findUniqueOrThrow({ where: { id: einsatzId } })).zvooveErledigt).toBe(false);
  expect((await db.assignment.findUniqueOrThrow({ where: { id: einsatzId } })).zvooveAm).toBeNull();
  expect(await db.auditLog.count({ where: { action: "assignment.zvoove", entityId: einsatzId } })).toBe(2);
});
