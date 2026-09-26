// Link je Schicht: die Dispo verschickt für jede Schicht eine eigene
// Nachricht. Wer sie öffnet, sieht nur die Personen dieser Schicht.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const TAG1 = `2038-${String(1 + (N % 12)).padStart(2, "0")}-10`;
const TAG2 = `2038-${String(1 + (N % 12)).padStart(2, "0")}-11`;
const de = (k: string) => k.split("-").reverse().join(".");
const AUFBAU = `Aufbauer-${RUN}`;
const ABBAU = `Abbauer-${RUN}`;

// Zwei Tage, zwei Schichten, unterschiedliche Leute – genau der Fall, für den
// ein Link je Schicht gedacht ist.
const RAW = `Artist: Zwei Tage ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${de(TAG1)}:
Aufbau | 07:00 - 15:00 Uhr | 1x Hands
Timo ${AUFBAU}
Arbeitsbeginn ${de(TAG2)}:
Abbau | 22:00 - 02:00 Uhr | 1x Hands
Lena ${ABBAU}
`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function drawSignature(page: Page) {
  const pad = page.getByTestId("signature-pad").locator("canvas");
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

test.describe.serial("Link je Schicht", () => {
  let url = "";
  const pfade: string[] = [];

  test("Einsatz mit zwei Schichten anlegen und beide Schichtlinks holen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    // Auf die Vorschau warten, erst dann die Zuordnungen setzen
    await expect(page.getByTestId("person-0-0")).toBeVisible();
    for (const feld of [page.getByTestId("person-0-0"), page.getByTestId("person-1-0")]) {
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

    // Für jede Schicht ein eigener Abschnitt mit eigenem Link
    const karten = page.locator('[data-testid^="schichtlink-"]');
    await expect(karten).toHaveCount(2);
    for (const knopf of await page.locator('[data-testid^="schicht-link-"]').all()) {
      pfade.push(new URL((await knopf.getAttribute("title")) ?? "").pathname);
    }
    expect(new Set(pfade).size).toBe(2);
    // und keiner davon ist der Link für den ganzen Einsatz
    const gruppe = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
    expect(pfade).not.toContain(gruppe);
  });

  test("Die Nachricht nennt nur die eigene Schicht", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const erste = page.locator('[data-testid^="schicht-nachricht-"]').first();
    await page.locator('[data-testid^="schichtlink-"]').first().getByText("Text anzeigen").click();
    await expect(erste).toContainText("gilt nur für diese Schicht");
    await expect(erste).toContainText("Aufbau");
    await expect(erste).not.toContainText("Abbau");
  });

  test("Der Schichtlink zeigt nur die Personen dieser Schicht", async ({ page }) => {
    await page.goto(pfade[0]);
    await tutorialWeg(page);
    await expect(page.getByTestId("nur-schicht")).toContainText("Aufbau");
    await expect(page.getByText(`Timo ${AUFBAU}`)).toBeVisible();
    await expect(page.getByText(`Lena ${ABBAU}`)).toHaveCount(0);
    // Die Kundenbestätigung läuft über den Link für den ganzen Einsatz
    await expect(page.getByTestId("kunde-nur-einsatzlink")).toBeVisible();
    await expect(page.getByTestId("crew-kunde")).toHaveCount(0);
  });

  test("Unterschreiben über den Schichtlink funktioniert", async ({ page }) => {
    await page.goto(pfade[0]);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 1);

    // Der zweite Schichtlink bleibt davon unberührt
    await page.goto(pfade[1]);
    await tutorialWeg(page);
    await unterschriftAngekommen(page, 0, 1);
    await expect(page.getByText(`Lena ${ABBAU}`)).toBeVisible();
  });

  test("Im Backend steht der Stand je Schicht", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karten = page.locator('[data-testid^="schichtlink-"]');
    await expect(karten.filter({ hasText: "1 von 1 unterschrieben" })).toHaveCount(1);
    await expect(karten.filter({ hasText: "0 von 1 unterschrieben" })).toHaveCount(1);
    // Der Link für den ganzen Einsatz zeigt weiterhin beide Schichten
    await expect(page.getByTestId("gruppen-stand")).toContainText("1 von 2 unterschrieben");
  });

  test("Ein fremder Token bleibt ein fremder Token", async ({ request }) => {
    // Person der zweiten Schicht über den Link der ersten einzureichen: 403
    const ersteView = await (await request.get(`/api/e/crew/${pfade[0].split("/").pop()}`)).json();
    const zweiteView = await (await request.get(`/api/e/crew/${pfade[1].split("/").pop()}`)).json();
    const fremdeId = zweiteView.schichten[0].personen[0].shiftAssignmentId;
    const res = await request.post(`/api/e/crew/${pfade[0].split("/").pop()}`, {
      data: { shiftAssignmentId: fremdeId, aktion: "zeiten-fuer-alle" },
    });
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain("nicht zu dieser Schicht");
    // beide Sichten zeigen je genau eine Schicht
    expect(ersteView.schichten).toHaveLength(1);
    expect(zweiteView.schichten).toHaveLength(1);
    expect(ersteView.nurSchicht).toBe("Aufbau");
    expect(ersteView.kundeMoeglich).toBe(false);
  });
});
