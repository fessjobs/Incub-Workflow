// Einsatz nachträglich bearbeiten: Namen einfügen, Kopf und Schicht ändern,
// Namen richtigstellen – auch nach der Kundenbestätigung.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2030-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");

const RAW = `Artist: Bearbeiten ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 4x Hands
Tobias Krämer
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

test.describe.serial("Einsatz nachträglich bearbeiten", () => {
  let url = "";

  test("Einsatz mit einer Person anlegen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("projekt")).toHaveValue(`Bearbeiten ${RUN}`);
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    url = page.url();
  });

  test("Namen per Copy-Paste ergänzen", async ({ page }) => {
    await login(page);
    await page.goto(url);
    await page.locator('[data-testid^="paste-open-"]').first().click();
    const feld = page.locator('[data-testid^="paste-text-"]').first();
    // Bewusst gemischt: bekannte Person, gedrehter Name, Rollenkürzel, Dublette
    await feld.fill(`Jana Weidner\nWeidner, Jana\n- Neuzugang ${RUN} (Spare)\nTobias Krämer`);
    await page.locator('[data-testid^="paste-check-"]').first().click();

    const vorschau = page.locator('[data-testid^="paste-vorschau-"]').first();
    await expect(vorschau).toBeVisible();
    // Die Dublette in der Eingabe ist weg, Tobias steht schon auf der Schicht
    await expect(vorschau.locator("tbody tr")).toHaveCount(3);
    // Erste Spalte: der eingefügte Name samt erkannter Rolle
    const eingefuegt = vorschau.locator("tbody td:first-child");
    await expect(eingefuegt.filter({ hasText: "steht schon auf der Schicht" })).toHaveCount(1);
    await expect(eingefuegt.filter({ hasText: `Neuzugang ${RUN}` })).toContainText("Spare");

    await page.locator('[data-testid^="paste-apply-"]').first().click();
    const eingeteilt = page.locator('[data-testid^="person-name-"]');
    await expect(eingeteilt).toHaveCount(3);
    await expect(eingeteilt.filter({ hasText: "Jana Weidner" })).toHaveCount(1);
    await expect(eingeteilt.filter({ hasText: `Neuzugang ${RUN}` })).toHaveCount(1);
  });

  test("Kopfdaten und Schichtzeiten ändern", async ({ page }) => {
    await login(page);
    await page.goto(url);

    await page.getByTestId("kopf-bearbeiten").click();
    await page.getByTestId("e-ort").fill("SAP Arena Mannheim");
    await page.getByTestId("e-projekt").fill(`Bearbeitet ${RUN}`);
    await page.getByTestId("kopf-speichern").click();
    await expect(page.getByRole("heading", { name: `Bearbeitet ${RUN}` })).toBeVisible();
    await expect(page.getByText("SAP Arena Mannheim")).toBeVisible();

    await page.locator('[data-testid^="schicht-bearbeiten-"]').first().click();
    await page.locator('[data-testid^="s-start-"]').first().fill("06:30");
    await page.locator('[data-testid^="s-ende-"]').first().fill("16:00");
    await page.locator('[data-testid^="schicht-speichern-"]').first().click();
    await expect(page.getByText(/06:30–16:00/)).toBeVisible();
  });

  test("Name richtigstellen – vor und nach der Kundenbestätigung", async ({ page }) => {
    await login(page);
    await page.goto(url);

    // Vorher: umbenennen ändert den Stammsatz bzw. hängt um
    const zeile = page.locator("div").filter({ hasText: /^Neuzugang/ });
    void zeile;
    const rename = page.locator('[data-testid^="rename-open-"]').first();
    await rename.click();
    const vorname = page.locator('[data-testid^="rename-vorname-"]').first();
    await vorname.fill("Tobias");
    await page.locator('[data-testid^="rename-nachname-"]').first().fill(`Umbenannt${RUN}`);
    await page.locator('[data-testid^="rename-save-"]').first().click();
    await expect(page.locator('[data-testid^="person-name-"]').filter({ hasText: `Tobias Umbenannt${RUN}` })).toHaveCount(1);

    // Kunde bestätigt über den Gruppenlink
    const crew = (await page.getByTestId("gruppen-link").getAttribute("title")) ?? "";
    await page.goto(new URL(crew).pathname);
    await tutorialWeg(page);
    await page.getByTestId("crew-kunde").click();
    await page.getByTestId("kunde-name").fill("Jonas Keller");
    await drawSignature(page, "kunde-signature");
    await page.getByTestId("kunde-submit").click();
    await expect(page.getByText("✓ Jonas Keller")).toBeVisible();

    // Danach: Kopf, Schichten und Besetzung sind zu, Namen bleiben offen
    await page.goto(url);
    await expect(page.getByTestId("kopf-gesperrt")).toContainText(/Kunde hat bestätigt/);
    await expect(page.getByTestId("kopf-bearbeiten")).toHaveCount(0);
    await expect(page.locator('[data-testid^="schicht-bearbeiten-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="paste-open-"]')).toHaveCount(0);

    await page.locator('[data-testid^="rename-open-"]').first().click();
    await page.locator('[data-testid^="rename-nachname-"]').first().fill(`Nachher${RUN}`);
    await page.locator('[data-testid^="rename-save-"]').first().click();
    await expect(page.locator('[data-testid^="person-name-"]').filter({ hasText: `Tobias Nachher${RUN}` })).toHaveCount(1);
  });
});
