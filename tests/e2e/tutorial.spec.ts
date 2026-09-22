// Kurzanleitung beim Öffnen des Links: was zu tun ist, und der Hinweis, die
// Sicherheitsunterweisung vor dem Einsatz zu lesen.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE_DE = `${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}.${String(1 + (N % 12)).padStart(2, "0")}.2032`;

const RAW = `Artist: Anleitung ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 2x Hands
Tobias Krämer
Jana Weidner
`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Kurzanleitung", () => {
  let crewPath = "";
  let einzelPath = "";

  test("Einsatz anlegen und beide Linkarten holen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("projekt")).toHaveValue(`Anleitung ${RUN}`);
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    crewPath = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
    await page.getByTestId("einzellinks-toggle").click();
    const offen = page.locator('a[href*="/e/"]', { hasText: "Öffnen" }).last();
    einzelPath = new URL((await offen.getAttribute("href")) ?? "").pathname;
  });

  test("Gruppenlink: Anleitung erscheint von selbst und nennt alle Schritte", async ({ page }) => {
    await page.goto(crewPath);
    const anleitung = page.getByTestId("tutorial");
    await expect(anleitung).toBeVisible();

    // Der wichtigste Hinweis: Unterweisung VOR dem Einsatz lesen
    await expect(page.getByTestId("tutorial-unterweisung")).toContainText(/Sicherheitsunterweisung/);
    await expect(page.getByTestId("tutorial-unterweisung")).toContainText(/vor/i);

    // Fünf Schritte, beginnend mit dem eigenen Namen
    const schritte = anleitung.locator("ol li");
    await expect(schritte).toHaveCount(5);
    await expect(schritte.nth(0)).toContainText("Eigenen Namen antippen");
    await expect(schritte.nth(1)).toContainText("Zeiten prüfen");
    await expect(schritte.nth(2)).toContainText("Fahrtkosten");
    await expect(schritte.nth(3)).toContainText("Spesen");
    await expect(schritte.nth(4)).toContainText("unterschreiben");

    // Wegklicken – und beim nächsten Öffnen bleibt sie weg
    await page.getByTestId("tutorial-schliessen").click();
    await expect(anleitung).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("tutorial")).toHaveCount(0);

    // Über das Fragezeichen wieder aufrufbar
    await page.getByTestId("tutorial-oeffnen").click();
    await expect(page.getByTestId("tutorial")).toBeVisible();
    // Escape schließt ebenfalls
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
  });

  test("Einzellink: dieselbe Anleitung ohne den Schritt für die Namensliste", async ({ page }) => {
    await page.goto(einzelPath);
    const schritte = page.getByTestId("tutorial").locator("ol li");
    await expect(schritte).toHaveCount(4);
    await expect(schritte.nth(0)).toContainText("Zeiten prüfen");
    await expect(page.getByTestId("tutorial")).not.toContainText("Eigenen Namen antippen");
  });

  test("Weggeklickt steht das Formular normal zur Verfügung", async ({ page }) => {
    await page.goto(einzelPath);
    await page.getByTestId("tutorial-schliessen").click();
    await expect(page.locator("#pause")).toBeVisible();
    await expect(page.getByTestId("unterweisung-check")).toBeVisible();
  });
});
