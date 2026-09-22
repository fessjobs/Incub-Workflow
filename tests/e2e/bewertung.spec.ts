// Erfahrungsscore je Tätigkeit, Stundenzettel freigeben und die interne
// Beurteilung – alles nur im Backend, nichts davon im Mitarbeiter-Link.
import { expect, test, type Page } from "@playwright/test";
import { tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE = `2034-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");
const NACHNAME = `Bewertet-${RUN}`;

const RAW = `Artist: Scorecheck ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 1x Rigger
Nina ${NACHNAME}
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

test.describe.serial("Erfahrung und Beurteilung", () => {
  let url = "";
  let crewPath = "";
  let employeeId = "";

  test("Neue Person einteilen – sie startet bei null Schichten", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    // Unbekannter Name → neu anlegen
    await page.getByTestId("person-0-0").selectOption("__neu");
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible().catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    url = page.url();
    crewPath = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;

    // Ohne Unterschrift gibt es nichts zu bewerten und nichts freizugeben
    await expect(page.locator('[data-testid^="rate-"]')).toHaveCount(0);
    await expect(page.getByTestId("freigeben-button")).toBeDisabled();
    await expect(page.locator('[data-testid^="person-name-"]').first()).toContainText(NACHNAME);
    await expect(page.getByText(/0 Schichten · neu/)).toBeVisible();
  });

  test("Nach der Unterschrift zählt die Schicht und lässt sich bewerten", async ({ page }) => {
    await login(page);
    await page.goto(crewPath);
    await tutorialWeg(page);
    await page.locator('[data-testid^="crew-sign-"]').first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    // Auf die Bestätigung des Servers warten, nicht nur aufs Verschwinden
    // des Knopfes – sonst prüft der Test bei Netzhängern gegen leere Daten.
    await unterschriftAngekommen(page, 1, 1);

    await page.goto(url);
    // Die Schicht zählt jetzt, samt Tätigkeit
    await expect(page.getByText(/1 Schicht · eingearbeitet/)).toBeVisible();
    await expect(page.getByText(/Rigger 1×/).first()).toBeVisible();

    // Bewerten: positiv, dann eine Notiz
    const rate = page.locator('[data-testid^="rate-positiv-"]').first();
    await rate.click();
    await expect(rate).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-testid^="notiz-auf-"]').first().click();
    await page.locator('[data-testid^="notiz-feld-"]').first().fill("Pünktlich, sehr sauber gearbeitet.");
    await page.locator('[data-testid^="notiz-speichern-"]').first().click();
    await expect(page.getByText("„Pünktlich, sehr sauber gearbeitet.“")).toBeVisible();
  });

  test("Stundenzettel am Einsatz freigeben", async ({ page }) => {
    await login(page);
    await page.goto(url);
    await expect(page.getByTestId("freigeben-button")).toContainText("(1)");
    await page.getByTestId("freigeben-button").click();
    await expect(page.getByText("1 Zeiteintrag/-einträge freigegeben.")).toBeVisible();
    // Danach gibt es nichts mehr freizugeben
    await page.reload();
    await expect(page.getByTestId("freigeben-button")).toBeDisabled();
  });

  test("Personalliste und Profil zeigen Erfahrung und Bilanz", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/personal?q=${NACHNAME}`);
    await expect(page.getByText(/1 Schicht · eingearbeitet/)).toBeVisible();
    await expect(page.getByText(/Rigger 1×/)).toBeVisible();
    await expect(page.locator('[data-testid^="bilanz-"]').first()).toContainText("+1 / ∘0 / −0");

    await page.locator('[data-testid^="profil-"]').first().click();
    await page.waitForURL(/\/einsaetze\/personal\/[a-z0-9]+$/);
    employeeId = page.url().split("/").pop()!;
    await expect(page.getByTestId("profil-schichten")).toContainText("1 Schicht");
    await expect(page.getByTestId("profil-taetigkeiten")).toContainText("Rigger");
    await expect(page.getByTestId("profil-verlauf")).toContainText("Pünktlich, sehr sauber gearbeitet.");
    await expect(page.getByTestId("profil-verlauf")).toContainText("positiv");
  });

  test("Bewertung ist im Mitarbeiter-Link nirgends zu sehen", async ({ page }) => {
    await page.goto(crewPath);
    await tutorialWeg(page);
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("Pünktlich, sehr sauber");
    expect(text).not.toMatch(/Beurteilung|eingearbeitet|Rigger 1×/);
    // Auch nicht über die öffentliche Schnittstelle: kein Feld, kein Wert,
    // keine Notiz (der Projektname taucht dort natürlich auf, deshalb heißt
    // der Einsatz hier bewusst nicht "Bewertung …")
    const antwort = await page.request.get(`/api${new URL(page.url()).pathname}`);
    const roh = await antwort.text();
    expect(roh).not.toContain("bewertung");
    expect(roh).not.toContain("POSITIV");
    expect(roh).not.toContain("Pünktlich");
  });

  test("Zurücknehmen der Bewertung leert die Bilanz wieder", async ({ page }) => {
    await login(page);
    await page.goto(url);
    // Nochmal auf dieselbe Stufe tippen nimmt zurück
    await page.locator('[data-testid^="rate-positiv-"]').first().click();
    await page.goto(`/einsaetze/personal/${employeeId}`);
    await expect(page.getByTestId("profil-bilanz")).toContainText("noch nicht bewertet");
    // Die geleistete Schicht bleibt natürlich stehen
    await expect(page.getByTestId("profil-schichten")).toContainText("1 Schicht");
  });
});
