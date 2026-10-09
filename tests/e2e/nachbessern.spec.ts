// Zeiten lassen sich im Link ändern, bis der Kunde unterschrieben hat.
// Die eigene Unterschrift ist kein Schlussstrich – eine Schicht läuft selten
// so ab wie geplant.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const TAG = `2041-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const de = (k: string) => k.split("-").reverse().join(".");

const RAW = `Artist: Nachbessern ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${de(TAG)}:
Aufbau | 07:00 - 15:00 Uhr | 2x Hands
Mara Spaeter-${RUN}
Tom Zweiter-${RUN}
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

test.describe.serial("Nachbessern bis zur Kundenunterschrift", () => {
  let url = "";
  let crewPfad = "";
  let einzelPfad = "";

  test("Einsatz anlegen und beide Linkarten holen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("person-0-0")).toBeVisible();
    for (const feld of [page.getByTestId("person-0-0"), page.getByTestId("person-0-1")]) {
      if ((await feld.inputValue()) === "") await feld.selectOption("__neu");
    }
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    url = page.url();
    crewPfad = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
    await page.getByTestId("einzellinks-toggle").click();
    einzelPfad = new URL((await page.locator('[data-testid^="schicht-link-"]').first().getAttribute("title")) ?? "").pathname;
    expect(crewPfad).toMatch(/\/e\/crew\//);
  });

  test("Gruppenlink: nach der eigenen Unterschrift steht „Zeiten ändern“", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 2);

    // Der Knopf bleibt stehen und heißt jetzt anders
    const knopf = page.locator('[data-testid^="crew-sign-"]').first();
    await expect(knopf).toHaveText("Zeiten ändern");
  });

  test("Die geänderten Zeiten ersetzen die alten – ohne Vermerk", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    // Der eigene Eintrag ist vorbelegt, der Hinweis sagt es
    await expect(page.getByTestId("schon-unterschrieben")).toContainText("schon unterschrieben");
    await page.locator('input[type="time"]').nth(1).fill("18:30");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await expect(page.getByText("07:00–18:30").first()).toBeVisible();

    // Im Backend stehen die neuen Zeiten, der Stundenzettel bleibt sauber
    await login(page);
    await page.goto(url);
    await expect(page.getByText(/Ist 07:00–18:30/).first()).toBeVisible();
    await expect(page.getByText(/Korrektur v/)).toHaveCount(0);
  });

  test("Einzellink: derselbe Weg, vorbelegt mit den eigenen Zeiten", async ({ page }) => {
    await page.goto(einzelPfad);
    await tutorialWeg(page);
    // Der Einzellink gehört zur Schicht; hier unterschreibt die zweite Person
    await page.locator('[data-testid^="crew-sign-"]').last().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 2, 2);
    await page.locator('[data-testid^="crew-sign-"]').last().click();
    await expect(page.getByTestId("schon-unterschrieben")).toBeVisible();
  });

  test("Nach der Unterschrift des Kunden ist Schluss", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    await page.getByTestId("crew-kunde").click();
    await page.getByTestId("kunde-name").fill("Hallenchef");
    await drawSignature(page, "kunde-signature");
    await page.getByTestId("kunde-submit").click();

    await page.goto(crewPfad);
    await tutorialWeg(page);
    // Kein Knopf mehr, nur noch der Haken
    await expect(page.locator('[data-testid^="crew-sign-"]')).toHaveCount(0);
    await expect(page.getByText("✓ unterschrieben").first()).toBeVisible();
    await expect(page.locator('[data-testid^="crew-name-"]')).toHaveCount(0);
  });

  test("Die Dispo kann weiterhin korrigieren – mit Vermerk", async ({ page }) => {
    await login(page);
    await page.goto(url);
    await page.locator('[data-testid^="korrektur-open-"]').first().click();
    const grund = page.locator('[data-testid^="korrektur-grund-"]').first();
    await grund.fill("Pause nachgetragen");
    await page.locator('[data-testid^="korrektur-save-"]').first().click();
    await expect(page.getByText(/v2/).first()).toBeVisible();
  });
});
