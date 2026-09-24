// Der Weg zur Rechnung in drei Handgriffen:
//   1. Buchhaltung bestätigt die Stunden, nimmt Ergänzungen auf, gibt frei
//   2. Admin ergänzt Angebotsnummer, Konditionen, Beschreibung
//   3. Buchhaltung schreibt die Rechnung
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2037-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
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

test.describe.serial("Abrechnung: Stunden, Angaben, Rechnung", () => {
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

  test("Schritt 1 zuerst: ohne bestätigte Stunden gehen Angaben und Rechnung nicht", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Stunden offen");
    await expect(karte.getByTestId("abrechnung-offene-punkte")).toContainText("Stunden bestätigen");
    await expect(karte.getByTestId("abrechnung-freigeben")).toBeDisabled();
    // Schritt 2 und 3 sind noch zu
    await expect(karte.getByTestId("angebotsnummer")).toHaveCount(0);
    await expect(karte.getByTestId("rechnung-setzen")).toBeDisabled();
  });

  test("Schritt 1: Stunden bestätigen, Ergänzungen aufnehmen, freigeben", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");

    // Bonus und Abzug – die Summe verrechnet beides
    await karte.getByTestId("ergaenzung-art").selectOption("BONUS");
    await karte.getByTestId("ergaenzung-betrag").fill("150");
    await karte.getByTestId("ergaenzung-bemerkung").fill("Nachtaufbau");
    await karte.getByTestId("ergaenzung-hinzu").click();
    await expect(karte.getByTestId("ergaenzungen-summe")).toContainText("150,00 €");

    await karte.getByTestId("ergaenzung-art").selectOption("ABZUG");
    await karte.getByTestId("ergaenzung-betrag").fill("20,25");
    await karte.getByTestId("ergaenzung-hinzu").click();
    await expect(karte.getByTestId("ergaenzungen-summe")).toContainText("129,75 €");

    // Stunden bestätigen, dann freigeben
    await karte.getByTestId("stunden-bestaetigen").click();
    await expect(karte.getByTestId("abrechnung-freigeben")).toBeEnabled();
    await karte.getByTestId("abrechnung-freigeben").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Stunden freigegeben");
    await expect(karte.getByTestId("abrechnung-freigabe-info")).toContainText("7,50 h freigegeben");
  });

  test("Schritt 2: der Admin ergänzt die Angaben und gibt sie weiter", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    // Ohne Angebotsnummer bleibt der Knopf zu
    await expect(karte.getByTestId("angaben-weiter")).toBeDisabled();
    await karte.getByTestId("angebotsnummer").fill(ANGEBOT);
    await karte.getByTestId("konditionen").fill("32,50 €/h, ab 10 h +25 %");
    await karte.getByTestId("abrechnung-hinweis").fill(`Aufbau Halle 2, Angebot ${RUN}`);
    // Die Rechnung lässt sich noch nicht schreiben
    await expect(karte.getByTestId("rechnung-setzen")).toBeDisabled();

    await karte.getByTestId("angaben-weiter").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung offen");
    await expect(karte.getByTestId("angaben-info")).toContainText("An die Buchhaltung gemeldet");
  });

  test("In der Übersicht liegt der Einsatz im Korb „Rechnung offen“", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/abrechnung?stand=BEREIT&q=${einsatznummer}`);
    const zeile = page.getByTestId(`abrechnung-zeile-${einsatznummer}`);
    await expect(zeile).toContainText(ANGEBOT);
    await expect(zeile).toContainText("7,50 h");
    await expect(zeile).toContainText("129,75 €");

    // Nicht mehr in den beiden Körben davor
    for (const stand of ["OFFEN", "FREIGEGEBEN"]) {
      await page.goto(`/einsaetze/abrechnung?stand=${stand}&q=${einsatznummer}`);
      await expect(page.getByTestId(`abrechnung-zeile-${einsatznummer}`)).toHaveCount(0);
    }
  });

  test("Schritt 3: die Buchhaltung trägt die Rechnungsnummer in der Liste ein", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/abrechnung?stand=BEREIT&q=${einsatznummer}`);
    await page.getByTestId(`rechnungsnummer-${einsatznummer}`).fill(RECHNUNG);
    await page.getByTestId(`rechnung-setzen-${einsatznummer}`).click();

    await page.goto(`/einsaetze/abrechnung?stand=BERECHNET&q=${einsatznummer}`);
    await expect(page.getByTestId(`abrechnung-zeile-${einsatznummer}`)).toContainText(RECHNUNG);

    // Am Einsatz selbst: Rechnung vermerkt, alles davor gesperrt
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung geschrieben");
    await expect(karte.getByTestId("abrechnung-rechnung-info")).toContainText(RECHNUNG);
    await expect(karte.getByTestId("angebotsnummer")).toHaveCount(0);
    await expect(karte.getByTestId("angaben-angebotsnummer")).toHaveText(ANGEBOT);
    await expect(karte.getByTestId("ergaenzung-hinzu")).toHaveCount(0);
    await expect(page.getByText("Abgerechnet").first()).toBeVisible();
  });

  test("Die Einsatzliste sagt den Stand im Klartext", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze?q=${einsatznummer}`);
    await expect(page.getByTestId("abrechnung-badge-berechnet").first()).toHaveText("Rechnung geschrieben");
    await expect(page.getByText(`Nr. ${RECHNUNG}`).first()).toBeVisible();
    // Filter nach Abrechnungsstand
    await page.goto(`/einsaetze?q=${einsatznummer}&abrechnung=OFFEN`);
    await expect(page.getByText("Keine Einsätze gefunden.")).toBeVisible();
  });

  test("Rücknahme: Vermerk entfernen, dieselbe Nummer geht wieder", async ({ page }) => {
    await login(page);
    await page.goto(url);
    const karte = page.getByTestId("abrechnung-karte");
    await karte.getByTestId("abrechnung-rechnung-zurueck").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung offen");

    await karte.getByTestId("rechnungsnummer").fill(RECHNUNG);
    await karte.getByTestId("rechnung-setzen").click();
    await expect(karte.getByTestId("abrechnung-stand")).toHaveText("Rechnung geschrieben");
  });
});
