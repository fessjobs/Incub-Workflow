// Zeiten für alle übernehmen: Die erste Person erfasst, ihre Zeiten gelten
// als Vorgabe für die Übrigen – vorausgefüllt, jede unterschreibt selbst.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2031-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");

const RAW = `Artist: Zeiten ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 3x Hands
Tobias Krämer
Jana Weidner
Samira Gülhan
`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function drawSignature(page: Page, testId = "signature-pad") {
  const pad = page.getByTestId(testId).locator("canvas");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("Unterschriftenfeld nicht sichtbar");
  const x = box.x + 20;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * 12, y + Math.sin(i) * 14, { steps: 3 });
  await page.mouse.up();
}

test.describe.serial("Zeiten für alle übernehmen", () => {
  let crewPath = "";
  let dispoUrl = "";

  test("Einsatz mit drei Personen anlegen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("projekt")).toHaveValue(`Zeiten ${RUN}`);
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    dispoUrl = page.url();
    const url = (await page.getByTestId("gruppen-link").getAttribute("title")) ?? "";
    crewPath = new URL(url).pathname;
  });

  test("Die erste Person erfasst abweichende Zeiten", async ({ page }) => {
    await page.goto(crewPath);
    await tutorialWeg(page);
    // Vor der ersten Erfassung gibt es nichts zu übernehmen
    await expect(page.locator('[data-testid^="zeiten-fuer-alle-"]')).toHaveCount(0);

    await page.locator('[data-testid^="crew-sign-"]').first().click();
    // Bewusst anders als der Plan (07:00–15:00, Pause 30)
    await page.locator('input[type="time"]').first().fill("06:30");
    await page.locator('input[type="time"]').nth(1).fill("16:45");
    await page.locator('input[type="number"]').first().fill("45");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 3);
  });

  test("Zeiten für alle übernehmen füllt die Übrigen vor", async ({ page }) => {
    await page.goto(crewPath);
    await tutorialWeg(page);
    const knopf = page.locator('[data-testid^="zeiten-fuer-alle-"]').first();
    await expect(knopf).toContainText("für alle 2 Übrigen übernehmen");
    await expect(knopf).toBeVisible();
    await knopf.click();

    // Danach steht die Vorgabe da, der Knopf ist weg
    await expect(page.locator('[data-testid^="zeiten-uebernommen-"]')).toContainText("06:30–16:45");
    await expect(page.locator('[data-testid^="zeiten-uebernommen-"]')).toContainText("Pause 45 min");
    await expect(page.locator('[data-testid^="zeiten-fuer-alle-"]')).toHaveCount(0);

    // Die nächste Person bekommt die Zeiten vorausgefüllt
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await expect(page.getByTestId("vorgabe-hinweis")).toContainText("06:30–16:45");
    await expect(page.locator('input[type="time"]').first()).toHaveValue("06:30");
    await expect(page.locator('input[type="time"]').nth(1)).toHaveValue("16:45");
    await expect(page.locator('input[type="number"]').first()).toHaveValue("45");

    // Sie kann trotzdem abweichen und unterschreibt selbst
    await page.locator('input[type="time"]').nth(1).fill("15:00");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 2, 3);
  });

  test("Auch der Einzellink übernimmt die Vorgabe", async ({ page }) => {
    await login(page);
    await page.goto(dispoUrl);
    await page.getByTestId("einzellinks-toggle").click();
    const offen = page.locator('a[href*="/e/"]', { hasText: "Öffnen" });
    const letzte = await offen.last().getAttribute("href");
    await page.goto(new URL(letzte!).pathname);
    await tutorialWeg(page);
    await expect(page.getByTestId("vorgabe-hinweis")).toContainText("06:30–16:45");
    await expect(page.locator("#pause")).toHaveValue("45");
  });

  test("Die Dispo sieht die Vorgabe und kann sie zurücknehmen", async ({ page }) => {
    await login(page);
    await page.goto(dispoUrl);
    const vorgabe = page.locator('[data-testid^="vorgabe-c"]').first();
    await expect(vorgabe).toContainText("06:30–16:45");
    await expect(vorgabe).toContainText("Pause 45 min");
    await page.locator('[data-testid^="vorgabe-loeschen-"]').first().click();
    await expect(page.locator('[data-testid^="vorgabe-c"]')).toHaveCount(0);

    // Danach startet die nächste Erfassung wieder mit den Planzeiten
    await page.goto(crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await expect(page.getByTestId("vorgabe-hinweis")).toHaveCount(0);
    await expect(page.locator('input[type="time"]').first()).toHaveValue("07:00");
  });
});
