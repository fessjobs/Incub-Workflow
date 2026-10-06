// Mehrere Einsätze, eine Rechnung – und der Aushang für die WhatsApp-Gruppe.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const TAG = `2039-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const de = (k: string) => k.split("-").reverse().join(".");
const PROJEKT = `Tour ${RUN}`;
const RECHNUNG = `RE-P-${RUN}`;

function raw(nr: number, nachname: string) {
  return `Artist: Sammel ${RUN} Teil ${nr}
Location: Lanxess Arena, Köln
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${de(TAG)}:
Aufbau | 07:00 - 15:00 Uhr | 2x Stagehands
${nachname}
`;
}

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

// Legt einen Einsatz an, lässt die Person unterschreiben und gibt die Stunden frei
async function fertigerEinsatz(page: Page, nr: number): Promise<{ url: string; nummer: string }> {
  await page.goto("/einsaetze/neu");
  await page.getByTestId("raw-input").fill(raw(nr, `Mara Sammler${nr}-${RUN}`));
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
  const url = page.url();
  const nummer = (await page.locator("p.eyebrow").first().innerText()).split("·").pop()!.trim();

  const crew = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
  await page.goto(crew);
  await tutorialWeg(page);
  await page.locator('[data-testid^="crew-sign-"]').first().click();
  await page.getByTestId("unterweisung-check").check();
  await drawSignature(page);
  await page.getByTestId("crew-submit").click();
  await unterschriftAngekommen(page, 1, 1);

  // Stunden bestätigen und für die Abrechnung freigeben
  await page.goto(url);
  const karte = page.getByTestId("abrechnung-karte");
  await karte.getByTestId("stunden-bestaetigen").click();
  await expect(karte.getByTestId("abrechnung-freigeben")).toBeEnabled();
  await karte.getByTestId("abrechnung-freigeben").click();
  await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Stunden freigegeben");
  return { url, nummer };
}

test.describe.serial("Projekte: mehrere Einsätze, eine Rechnung", () => {
  const einsaetze: Array<{ url: string; nummer: string }> = [];
  let projektUrl = "";

  test("Zwei fertige Einsätze anlegen", async ({ page }) => {
    await login(page);
    einsaetze.push(await fertigerEinsatz(page, 1));
    einsaetze.push(await fertigerEinsatz(page, 2));
    expect(new Set(einsaetze.map((e) => e.nummer)).size).toBe(2);
  });

  test("Beide zu einem Projekt zusammenfassen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/projekte");
    await page.getByTestId("projekt-neu").click();
    await page.getByTestId("projekt-name").fill(PROJEKT);
    for (const e of einsaetze) {
      const id = e.url.split("/").pop()!;
      await page.getByTestId(`projekt-kandidat-${id}`).check();
    }
    await page.getByTestId("projekt-anlegen").click();
    await page.waitForURL(/\/einsaetze\/projekte\/[a-z0-9]+$/);
    projektUrl = page.url();
    await expect(page.getByRole("heading", { name: new RegExp(PROJEKT) })).toBeVisible();
    for (const e of einsaetze) await expect(page.getByTestId(`projekt-einsatz-${e.nummer}`)).toBeVisible();
    // Beide Einsätze zusammen: 2 × 7,50 h
    await expect(page.getByText("15,00 h freigegeben").first()).toBeVisible();
  });

  test("Am Einsatz steht der Verweis aufs Projekt statt Schritt 2 und 3", async ({ page }) => {
    await login(page);
    await page.goto(einsaetze[0].url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-projekt")).toContainText(PROJEKT);
    // Die eigenen Felder für Angaben und Rechnung sind hier nicht mehr im Weg
    await expect(karte.getByTestId("angaben-weiter")).toBeHidden();
    await expect(karte.getByTestId("rechnung-setzen")).toBeHidden();
  });

  test("Angaben einmal fürs Projekt, dann eine Rechnung für beide", async ({ page }) => {
    await login(page);
    await page.goto(projektUrl);
    // Ohne Angebotsnummer bleibt der Knopf zu
    await expect(page.getByTestId("projekt-angaben-weiter")).toBeDisabled();
    await page.getByTestId("projekt-angebotsnummer").fill(`AN-${RUN}`);
    await page.getByTestId("projekt-konditionen").fill("32,50 €/h");
    await expect(page.getByTestId("projekt-rechnung-setzen")).toBeDisabled();
    await page.getByTestId("projekt-angaben-weiter").click();
    await expect(page.getByTestId("projekt-angaben-info")).toContainText("Gemeldet von");

    await page.getByTestId("projekt-rechnungsnummer").fill(RECHNUNG);
    await page.getByTestId("projekt-rechnung-setzen").click();
    await expect(page.getByTestId("projekt-rechnung-info")).toContainText(RECHNUNG);

    // Beide Einsätze tragen jetzt dieselbe Rechnungsnummer
    for (const e of einsaetze) {
      await page.goto(e.url);
      await expect(page.getByTestId("abrechnung-karte").getByTestId("abrechnung-stand")).toHaveText("Rechnung geschrieben");
      await expect(page.getByTestId("abrechnung-karte")).toContainText(RECHNUNG);
    }
    await page.goto(`/einsaetze?q=${einsaetze[0].nummer}`);
    await expect(page.getByText(`Nr. ${RECHNUNG}`).first()).toBeVisible();
  });

  test("Rücknahme löst die Rechnung bei beiden wieder", async ({ page }) => {
    await login(page);
    await page.goto(projektUrl);
    await page.getByTestId("projekt-rechnung-zurueck").click();
    await expect(page.getByTestId("projekt-rechnungsnummer")).toBeVisible();
    await page.goto(einsaetze[0].url);
    await expect(page.getByTestId("abrechnung-karte").getByTestId("abrechnung-stand")).toHaveText("Rechnung offen");
  });

  test("Ein Einsatz lässt sich wieder herauslösen", async ({ page }) => {
    await login(page);
    await page.goto(projektUrl);
    await page.getByTestId(`projekt-herausloesen-${einsaetze[1].nummer}`).click();
    await expect(page.getByTestId(`projekt-einsatz-${einsaetze[1].nummer}`)).toHaveCount(0);
    await page.goto(einsaetze[1].url);
    await expect(page.getByTestId("abrechnung-karte").getByTestId("abrechnung-projekt")).toHaveCount(0);
  });
});

test.describe("Aushang für die WhatsApp-Gruppe", () => {
  test("Fertige Suchmeldung steht am Einsatz und lässt sich anpassen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(raw(9, `Jonas Aushang-${RUN}`));
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

    const text = await page.getByTestId("aushang-text").inputValue();
    expect(text).toContain("EINSATZ");
    expect(text).toContain("🎤 Sammel");
    expect(text).toContain("in Köln");
    expect(text).toContain("⏰ Call: 07:00 Uhr");
    expect(text).toContain("📍 Lanxess Arena");
    // Von 2 gesuchten Stagehands ist eine besetzt
    expect(text).toContain("👥 Gesucht: 1x Stagehands");
    expect(text).toContain("👍🏻");
    expect(text).toContain("Danke euch 💪");

    // Anpassen und zurücksetzen
    await page.getByTestId("aushang-text").fill("Eigener Text");
    await expect(page.getByTestId("aushang-teilen")).toHaveAttribute("href", /Eigener%20Text/);
    await page.getByTestId("aushang-zuruecksetzen").click();
    expect(await page.getByTestId("aushang-text").inputValue()).toBe(text);
  });
});
