// Gruppenlink: ein Link für alle. Namen korrigieren, Person ergänzen,
// unterschreiben, Kunde bestätigt, PDF ansehen und teilen.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2029-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");

// Bewusst mit Tippfehler im Nachnamen – den korrigiert die Crew selbst
const RAW = `Artist: Crew ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 2x Hands
Tobias Krämmer
Jana Weidner
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

test.describe.serial("Gruppenlink", () => {
  let crewPath = "";

  test("Einsatz anlegen und den einen Link für alle holen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("projekt")).toHaveValue(`Crew ${RUN}`);
    // „Krämmer" ist absichtlich falsch geschrieben und trifft niemanden im
    // Stamm – hier bewusst als neue Person anlegen, damit die Crew den Namen
    // später selbst richtigstellen kann.
    for (const feld of await page.locator('[data-testid^="person-0-"]').all()) {
      if ((await feld.inputValue()) === "") await feld.selectOption("__neu");
    }
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);

    // Ein Link, eine fertige Nachricht
    const url = (await page.getByTestId("gruppen-link").getAttribute("title")) ?? "";
    expect(url).toMatch(/\/e\/crew\/[0-9a-f-]{36}$/);
    crewPath = new URL(url).pathname;

    await page.getByRole("button", { name: /Nachricht anzeigen/ }).click();
    const text = await page.getByTestId("gruppen-nachricht").innerText();
    expect(text).toContain("Mannheimer Power GmbH");
    expect(text).toContain("Aufbau");
    // genau ein Link in der Nachricht, damit in der Gruppe nichts verwechselt wird
    expect(text.match(/\/e\/crew\//g)).toHaveLength(1);

    // Der wa.me-Knopf trägt denselben Text
    const teilen = await page.getByTestId("gruppen-teilen").getAttribute("href");
    expect(teilen).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(teilen!.split("text=")[1])).toBe(text);
  });

  test("Crew korrigiert einen Namen und ergänzt eine Person", async ({ page }) => {
    await page.goto(crewPath);
    await tutorialWeg(page);
    await expect(page.getByText("Tobias Krämmer")).toBeVisible();

    // Name richtigstellen
    const zeile = page.locator(".ez-list-item", { hasText: "Tobias Krämmer" });
    await zeile.getByRole("button", { name: "Name falsch?" }).click();
    await page.getByTestId("crew-name-nachname").fill("Krämer");
    await page.getByTestId("crew-name-speichern").click();
    await expect(page.getByText("Tobias Krämer", { exact: true })).toBeVisible();
    await expect(page.getByText("Tobias Krämmer")).toHaveCount(0);

    // Person ergänzen
    await page.locator('[data-testid^="crew-add-"]').first().click();
    await page.getByTestId("crew-add-vorname").fill("Kurzfristig");
    await page.getByTestId("crew-add-nachname").fill(`Dazu${RUN}`);
    await page.getByTestId("crew-add-speichern").click();
    // Der Name steht danach in der Schichtliste (und zusätzlich in der Meldung)
    await expect(page.locator(".ez-list-item", { hasText: `Kurzfristig Dazu${RUN}` })).toBeVisible();

    // Zweimal dieselbe Person geht nicht
    await page.locator('[data-testid^="crew-add-"]').first().click();
    await page.getByTestId("crew-add-vorname").fill("Kurzfristig");
    await page.getByTestId("crew-add-nachname").fill(`Dazu${RUN}`);
    await page.getByTestId("crew-add-speichern").click();
    await expect(page.getByText(/steht schon auf dieser Schicht/)).toBeVisible();
  });

  test("Alle unterschreiben, Kunde bestätigt, danach ist das PDF da und teilbar", async ({ page }) => {
    // Angemeldet, weil am Ende die Job-Queue angestoßen wird (Dispo-Recht).
    // Der Gruppenlink selbst braucht keinen Login.
    await login(page);
    await page.goto(crewPath);
    await tutorialWeg(page);
    // Alle offenen Personen nacheinander – jede unterschreibt einzeln
    const offen = page.locator('[data-testid^="crew-sign-"]');
    await expect(offen.first()).toBeVisible();
    for (let rest = await offen.count(); rest > 0; rest--) {
      await offen.first().click();
      await page.getByTestId("unterweisung-check").check();
      await drawSignature(page);
      await page.getByTestId("crew-submit").click();
      await expect(offen).toHaveCount(rest - 1);
    }
    await expect(page.locator('[data-testid^="crew-sign-"]')).toHaveCount(0);

    // Solange der Kunde nicht bestätigt hat, gibt es auch keinen Beleg
    await expect(page.getByTestId("crew-pdf")).toHaveCount(0);

    await page.getByTestId("crew-kunde").click();
    await page.getByTestId("kunde-name").fill("Jonas Keller");
    await drawSignature(page, "kunde-signature");
    await page.getByTestId("kunde-submit").click();

    // Das PDF entsteht in einem Hintergrund-Job. Im Test läuft kein Worker
    // (JOBS_WORKER=off), deshalb die Queue einmal von Hand abarbeiten.
    await expect(page.getByTestId("crew-pdf-wartet")).toBeVisible();
    const jobs = await page.request.post("/api/jobs/run");
    expect(jobs.status()).toBe(200);
    await page.reload();
    const pdf = page.getByTestId("crew-pdf");
    await expect(pdf).toBeVisible({ timeout: 30_000 });
    const href = await page.getByTestId("crew-pdf-ansehen").getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");

    // Nach der Kundenbestätigung korrigiert nur noch die Dispo
    await expect(page.locator('[data-testid^="crew-add-"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Name falsch?" })).toHaveCount(0);
  });
});
