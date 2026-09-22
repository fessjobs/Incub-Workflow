// Löschen im Backend: Stunden, Einsätze und Personal – samt der Grenzen,
// die auch der Admin nicht überschreiten kann.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2035-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");
const NACHNAME = `Wegdamit-${RUN}`;

const RAW = `Artist: Aufraeumen ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 1x Hands
Timo ${NACHNAME}
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

async function anlegen(page: Page): Promise<{ url: string; crewPath: string }> {
  await page.goto("/einsaetze/neu");
  await page.getByTestId("raw-input").fill(RAW);
  await page.getByTestId("parse-button").click();
  const feld = page.getByTestId("person-0-0");
  if ((await feld.inputValue()) === "") await feld.selectOption("__neu");
  await page.getByTestId("save-button").click();
  const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
  if (await konflikte.isVisible().catch(() => false)) {
    await konflikte.check();
    await page.getByTestId("save-button").click();
  }
  await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
  const link = page.getByTestId("gruppen-link");
  await expect(link).toBeVisible();
  return { url: page.url(), crewPath: new URL((await link.getAttribute("title")) ?? "").pathname };
}

test.describe.serial("Löschen im Backend", () => {
  let url = "";
  let crewPath = "";

  test("Stunden löschen: die Einteilung bleibt und steht wieder auf geplant", async ({ page }) => {
    await login(page);
    ({ url, crewPath } = await anlegen(page));

    // Erfassen und unterschreiben
    await page.goto(crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 1);

    await page.goto(url);
    // Der Zähler steht oben im Kopf und noch einmal am Gruppenlink
    await expect(page.getByText("1 von 1 unterschrieben").first()).toBeVisible();

    // Löschen mit Rückfrage
    await page.locator('[data-testid^="zeit-loeschen-"]:not([data-testid$="-gesperrt"])').first().click();
    const dialog = page.locator('[data-testid^="zeit-loeschen-"][data-testid$="-dialog"]').first();
    await expect(dialog).toContainText("die Unterschrift");
    await expect(dialog).toContainText("lässt sich nicht rückgängig machen");
    await page.locator('[data-testid^="zeit-loeschen-"][data-testid$="-ja"]').first().click();

    await expect(page.getByText("0 von 1 unterschrieben").first()).toBeVisible();
    await expect(page.getByText(/Geplant/).first()).toBeVisible();
    // Die Person ist noch da, nur ohne Zeiten
    await expect(page.locator('[data-testid^="person-name-"]').first()).toContainText(NACHNAME);
    await expect(page.getByText("noch nicht erfasst")).toBeVisible();
    // Und die Schicht zählt nicht mehr als geleistet
    await expect(page.getByText(/0 Schichten · neu/).first()).toBeVisible();
  });

  test("Freigegebene Zeiten lassen sich nicht löschen", async ({ page }) => {
    await login(page);
    // Neu erfassen und freigeben
    await page.goto(crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 1);

    await page.goto(url);
    await page.getByTestId("freigeben-button").click();
    await expect(page.getByText("1 Zeiteintrag/-einträge freigegeben.")).toBeVisible();
    await page.reload();

    // Statt eines Knopfes steht dort die Begründung
    await expect(page.locator('[data-testid^="zeit-loeschen-"][data-testid$="-gesperrt"]').first()).toContainText("erst Freigabe zurücknehmen");
    // Und der ganze Einsatz ist ebenfalls gesperrt
    await expect(page.getByTestId("einsatz-loeschen-gesperrt")).toContainText("freigegebene Zeiten");
  });

  test("Nach Rücknahme der Freigabe geht der Einsatz – Admin muss die Nummer tippen", async ({ page }) => {
    await login(page);
    const nummer = (await page.goto(url).then(() => page.locator("p.eyebrow").first().innerText())).split("· ")[1].trim();

    // Freigabe zurücknehmen (freigegeben → geprüft reicht). Auf den eigenen
    // Tag filtern – in der Liste stehen die Einträge aller Testläufe.
    await page.goto(`/einsaetze/freigabe?review=FREIGEGEBEN&from=${DATE}&to=${DATE}`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Freigabe zurücknehmen" }).click();
    await expect(page.getByText(/→ geprüft|geprüft\./)).toBeVisible();

    await page.goto(url);
    await page.getByTestId("einsatz-loeschen").click();
    const dialog = page.getByTestId("einsatz-loeschen-dialog");
    await expect(dialog).toContainText("1 unterschriebene Erfassung(en)");

    // Falsches Wort: der Knopf bleibt zu
    await page.getByTestId("einsatz-loeschen-wort").fill("irgendwas");
    await expect(page.getByTestId("einsatz-loeschen-ja")).toBeDisabled();

    await page.getByTestId("einsatz-loeschen-wort").fill(nummer);
    await page.getByTestId("einsatz-loeschen-ja").click();
    await page.waitForURL(/\/einsaetze$/);
    await expect(page.getByText(nummer)).toHaveCount(0);

    // Der Link ins Nichts liefert eine saubere 404, keinen Absturz
    const res = await page.request.get(url);
    expect(res.status()).toBe(404);
  });

  test("Personal löschen: ohne Einteilungen sofort, sonst mit Ansage", async ({ page }) => {
    await login(page);
    // Die Person aus dem gelöschten Einsatz hat jetzt keine Einteilung mehr
    await page.goto(`/einsaetze/personal?q=${NACHNAME}`);
    await expect(page.getByText(`${NACHNAME}, Timo`)).toBeVisible();

    await page.locator('[data-testid^="person-loeschen-"]:not([data-testid$="-gesperrt"])').first().click();
    const dialog = page.locator('[data-testid^="person-loeschen-"][data-testid$="-dialog"]').first();
    await expect(dialog).toContainText("nie eingeteilt");
    await page.locator('[data-testid^="person-loeschen-"][data-testid$="-ja"]').first().click();

    await expect(page.getByText(`${NACHNAME}, Timo`)).toHaveCount(0);
  });

  test("Eine Person mit unterschriebenen Zeiten bleibt stehen", async ({ page }) => {
    await login(page);
    const zweiterLauf = await anlegen(page);
    await page.goto(zweiterLauf.crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 1);

    // Angemeldet ist die Sitzung noch – der Gruppenlink braucht keinen Login
    await page.goto(`/einsaetze/personal?q=${NACHNAME}`);
    await expect(page.locator('[data-testid^="person-loeschen-"][data-testid$="-gesperrt"]').first()).toContainText("unterschriebene Erfassung");
    await expect(page.locator('[data-testid^="person-loeschen-"]:not([data-testid$="-gesperrt"])')).toHaveCount(0);
  });
});
