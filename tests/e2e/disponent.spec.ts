// Rolle "Disposition": eigener Zugang, der ausschließlich das Einsatzmodul
// sieht – keine Belege, kein Abgleich, keine Einstellungen.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const DISPO_EMAIL = `dispo-${RUN}@fess.jobs`;
const DISPO_PASSWORD = "dispo-test-2026!";
const N = Math.floor(Date.now() / 1000);
const DATE_DE = `${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}.${String(1 + (N % 12)).padStart(2, "0")}.2040`;
const RAW_DISPO = `Artist: Dispoblick ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 1x Hands
Nina Dispoblick-${RUN}
`;

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

  test("die Dispo sieht keine Zahlen: keine Sätze, keine Konditionen, keine Rechnungen", async ({ page }) => {
    await login(page, DISPO_EMAIL, DISPO_PASSWORD);
    await page.waitForURL(/\/einsaetze/);

    // Kein Menüpunkt in die Zahlenwelt
    const unternav = page.locator("a", { hasText: /^(Abrechnung|Projekte|Lohnarten)$/ });
    await expect(unternav).toHaveCount(0);

    // ... und über die Adresszeile auch nicht
    for (const pfad of ["/einsaetze/abrechnung", "/einsaetze/projekte", "/einsaetze/lohnarten"]) {
      await page.goto(pfad);
      await expect(page, `${pfad} muss umleiten`).toHaveURL(/\/einsaetze$/);
    }

    // Die Einsatzliste zeigt keine Abrechnungsspalte
    await page.goto("/einsaetze");
    await expect(page.locator("th", { hasText: "Abrechnung" })).toHaveCount(0);
    await expect(page.locator('[data-testid^="abrechnung-badge-"]')).toHaveCount(0);

    // Die Auswertung zeigt keine Lohnarten und keinen Export
    await page.goto("/auswertung");
    await expect(page.getByRole("heading", { name: /Stunden-Auswertung/ })).toBeVisible();
    await expect(page.locator("th", { hasText: "Lohnarten" })).toHaveCount(0);
    await expect(page.getByText(/Export/).first()).toHaveCount(0);

    // Der Export liefert auch direkt nichts heraus
    const excel = await page.request.get("/auswertung/export?format=xlsx&von=2026-01-01&bis=2026-12-31");
    expect(excel.status()).toBe(403);

    // Exporte sind in den Dokumenten nicht aufgelistet
    await page.goto("/dokumente?category=export");
    await expect(page.getByText("Export", { exact: true })).toHaveCount(0);
  });

  test("am Einsatz selbst steht keine Abrechnungskarte", async ({ page }) => {
    await login(page, DISPO_EMAIL, DISPO_PASSWORD);
    await page.waitForURL(/\/einsaetze/);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW_DISPO);
    await page.getByTestId("parse-button").click();
    const feld = page.getByTestId("person-0-0");
    await expect(feld).toBeVisible();
    if ((await feld.inputValue()) === "") await feld.selectOption("__neu");
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);

    // Disponieren ja, abrechnen nein
    await expect(page.getByTestId("links-panel").or(page.getByTestId("gruppen-link"))).toBeVisible();
    await expect(page.getByTestId("abrechnung-karte")).toHaveCount(0);
    await expect(page.getByTestId("ergaenzungen")).toHaveCount(0);
    await expect(page.getByText(/Angebotsnummer/)).toHaveCount(0);
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
