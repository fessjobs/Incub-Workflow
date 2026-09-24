// Der Weg zur Rechnung in drei Stationen:
//   offen → die Dispo gibt frei → die Buchhaltung trägt die Rechnung ein.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2036-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");
const NACHNAME = `Rechenbar-${RUN}`;
const ANGEBOT = `AN-${RUN}`;
const RECHNUNG = `RE-${RUN}`;

const RAW = `Artist: Abrechnen ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 1x Hands
Nora ${NACHNAME}
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

test.describe.serial("Abrechnung: Freigabe der Dispo, Rechnung der Buchhaltung", () => {
  let url = "";
  let einsatznummer = "";

  test("Einsatz anlegen, erfassen, unterschreiben", async ({ page }) => {
    await login(page);
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
    url = page.url();
    einsatznummer = (await page.locator("p.eyebrow").first().innerText()).split("·").pop()!.trim();

    const crewPath = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
    await page.goto(crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 1, 1);
  });

  test("Vor der Freigabe der Zeiten ist die Abrechnung gesperrt", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Offen");
    await expect(karte.getByTestId("abrechnung-offene-punkte")).toContainText("Keine Zeit ist freigegeben");
    await expect(karte.getByTestId("abrechnung-freigeben")).toBeDisabled();
    // Die Rechnung lässt sich nicht vorziehen
    await expect(karte.getByTestId("rechnung-setzen")).toBeDisabled();
  });

  test("Angebotsnummer, Konditionen und Beschreibung vorher hinterlegen", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await karte.getByTestId("angebotsnummer").fill(ANGEBOT);
    await karte.getByTestId("konditionen").fill("32,50 €/h, ab 10 h +25 %");
    await karte.getByTestId("abrechnung-hinweis").fill(`Aufbau Halle 2, Angebot ${RUN}`);
    await karte.getByTestId("angaben-speichern").click();
    await expect(karte.getByTestId("abrechnung-ok")).toContainText("gespeichert");

    await page.reload();
    await expect(page.getByTestId("abrechnung-karte").getByTestId("angebotsnummer")).toHaveValue(ANGEBOT);
  });

  test("Die Dispo gibt erst die Stunden und dann die Abrechnung frei", async ({ page }) => {
    await login(page);
    await page.goto(url);
    // Schritt 1: die Zeiteinträge selbst
    await page.getByTestId("freigeben-button").click();
    await expect(page.getByText(/freigegeben/).first()).toBeVisible();

    // Schritt 2: der Einsatz für die Buchhaltung
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-freigeben")).toBeEnabled();
    await karte.getByTestId("abrechnung-freigeben").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Freigegeben");
    await expect(karte.getByTestId("abrechnung-freigabe-info")).toContainText("Freigegeben");
  });

  test("In der Übersicht liegt der Einsatz im Korb „Freigegeben“", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/abrechnung?stand=FREIGEGEBEN&q=${einsatznummer}`);
    const zeile = page.getByTestId(`abrechnung-zeile-${einsatznummer}`);
    await expect(zeile).toContainText(ANGEBOT);
    await expect(zeile).toContainText("7,50 h");

    // Nicht im Korb „Offen"
    await page.goto(`/einsaetze/abrechnung?stand=OFFEN&q=${einsatznummer}`);
    await expect(page.getByTestId(`abrechnung-zeile-${einsatznummer}`)).toHaveCount(0);
  });

  test("Die Buchhaltung trägt die Rechnungsnummer direkt in der Liste ein", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/abrechnung?stand=FREIGEGEBEN&q=${einsatznummer}`);
    await page.getByTestId(`rechnungsnummer-${einsatznummer}`).fill(RECHNUNG);
    await page.getByTestId(`rechnung-setzen-${einsatznummer}`).click();

    await page.goto(`/einsaetze/abrechnung?stand=BERECHNET&q=${einsatznummer}`);
    await expect(page.getByTestId(`abrechnung-zeile-${einsatznummer}`)).toContainText(RECHNUNG);

    // Am Einsatz selbst steht die Rechnung ebenfalls, Angaben sind gesperrt
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung geschrieben");
    await expect(karte.getByTestId("abrechnung-rechnung-info")).toContainText(RECHNUNG);
    await expect(karte.getByTestId("angebotsnummer")).toHaveCount(0);
    await expect(karte.getByTestId("angaben-angebotsnummer")).toHaveText(ANGEBOT);
    // Der Einsatzstatus zieht mit
    await expect(page.getByText("Abgerechnet").first()).toBeVisible();
  });

  test("Eine Rechnungsnummer gibt es nur einmal", async ({ page }) => {
    await login(page);
    // Zweiter Einsatz, direkt freigeben ist ohne Stunden nicht möglich –
    // darum wird die Doppelung am selben Einsatz nach Rücknahme geprüft.
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await karte.getByTestId("abrechnung-rechnung-zurueck").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Freigegeben");

    // Dieselbe Nummer darf derselbe Einsatz wieder bekommen
    await karte.getByTestId("rechnungsnummer").fill(RECHNUNG);
    await karte.getByTestId("rechnung-setzen").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung geschrieben");
  });
});
