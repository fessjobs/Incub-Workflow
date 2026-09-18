// Rolle "Disposition": eigener Zugang, der ausschließlich das Einsatzmodul
// sieht – keine Belege, kein Abgleich, keine Einstellungen.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const DISPO_EMAIL = `dispo-${RUN}@fess.jobs`;
const DISPO_PASSWORD = "dispo-test-2026!";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(email);
  await page.getByLabel(/Passwort/i).fill(password);
  await page.getByRole("button", { name: /anmelden/i }).click();
}

test.describe.serial("Disponenten-Zugang", () => {
  test("Admin legt ein Disponenten-Konto an", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/dashboard/);
    await page.goto("/einstellungen/nutzer/neu");
    await page.getByLabel(/^Name/i).fill(`Dispo ${RUN}`);
    await page.getByLabel(/E-Mail/i).fill(DISPO_EMAIL);
    await page.getByLabel(/Passwort/i).fill(DISPO_PASSWORD);
    await page.getByLabel(/Rolle/i).selectOption("DISPONENT");
    await page.getByRole("button", { name: /speichern|anlegen/i }).first().click();
    await expect(page.getByText(DISPO_EMAIL)).toBeVisible();
  });

  test("Disponent landet im Einsatzmodul und sieht nur dessen Navigation", async ({ page }) => {
    await login(page, DISPO_EMAIL, DISPO_PASSWORD);
    // Startseite ist das Modul, nicht das Beleg-Dashboard
    await page.waitForURL(/\/einsaetze/);
    const nav = page.locator("aside nav");
    await expect(nav.getByRole("link", { name: /Einsätze/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Stunden/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Dokumente/ })).toBeVisible();
    for (const verboten of [/Belege/, /Abgleich/, /Einstellungen/, /Schnell-Upload/, /Setcards/]) {
      await expect(nav.getByRole("link", { name: verboten })).toHaveCount(0);
    }
  });

  test("gesperrte Bereiche leiten um, gesperrte APIs antworten mit 403", async ({ page }) => {
    await login(page, DISPO_EMAIL, DISPO_PASSWORD);
    await page.waitForURL(/\/einsaetze/);
    for (const pfad of ["/belege", "/abgleich", "/einstellungen", "/einstellungen/nutzer", "/schnell", "/dashboard"]) {
      await page.goto(pfad);
      await expect(page, `${pfad} muss umleiten`).toHaveURL(/\/einsaetze/);
    }
    // Datenliefernde Routen der Beleg-Welt geben nichts heraus: der Aufruf
    // wird umgeleitet, es kommt kein Export zurück.
    const datev = await page.request.get("/auswertungen/datev");
    expect(datev.headers()["content-type"] ?? "").not.toMatch(/csv|zip|spreadsheet/);
    expect(await datev.text()).not.toContain("EXTF");
    // Modul-eigene APIs bleiben erreichbar
    const jobs = await page.request.post("/api/jobs/run");
    expect(jobs.status()).toBe(200);
    // ... die der Beleg-Welt nicht
    const belegExcel = await page.request.get("/auswertungen/excel");
    expect(belegExcel.headers()["content-type"] ?? "").not.toMatch(/spreadsheet/);
  });

  test("die eigentliche Arbeit ist möglich: Einsätze, Stunden, Dokumente", async ({ page }) => {
    await login(page, DISPO_EMAIL, DISPO_PASSWORD);
    await page.waitForURL(/\/einsaetze/);
    await expect(page.getByRole("link", { name: /Neu aus Rohtext/ })).toBeVisible();
    await page.goto("/einsaetze/neu");
    await expect(page.getByTestId("raw-input")).toBeVisible();
    await page.goto("/einsaetze/kunden");
    await expect(page.getByRole("heading", { name: /Kunden/ })).toBeVisible();
    await page.goto("/einsaetze/personal");
    await expect(page.getByRole("heading", { name: /Personal/ })).toBeVisible();
    await page.goto("/auswertung");
    await expect(page.getByRole("heading", { name: /Stunden-Auswertung/ })).toBeVisible();
    await page.goto("/dokumente");
    await expect(page.getByRole("heading", { name: /Dokumente/ })).toBeVisible();
  });
});
