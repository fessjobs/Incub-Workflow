// E2E: Rohtext → Einsatz → Konkretisierung → Mitarbeiter-Link → Unterschrift
// → Stundennachweis-PDF → Freigabe → Auswertung → Excel-/zvoove-Export.
// Läuft gegen den Production-Build mit der Seed-Datenbank (Admin-Login).
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
// Eindeutiges Datum je Lauf (verhindert Konflikte/Summen-Vermischung mit früheren Läufen)
const N = Math.floor(Date.now() / 1000);
const DATE = `2027-${String(1 + (N % 12)).padStart(2, "0")}-${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}`;
const DATE_DE = DATE.split("-").reverse().join(".");

// Eindeutiger Rohtext je Lauf (Namen aus dem Seed, damit das Matching greift)
const RAW = `Artist: E2E ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${DATE_DE}:
Aufbau | 07:00 - 15:00 Uhr | 2x Hands
Tobias Krämer
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

test.describe.serial("Einsatzmodul – kompletter Weg", () => {
  let assignmentUrl = "";
  let tokenUrl = "";

  test("Rohtext auswerten, prüfen, speichern, Konkretisierung", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("projekt")).toHaveValue(`E2E ${RUN}`);
    // Personen aus dem Seed sind automatisch (exakt) zugeordnet
    await expect(page.getByTestId("person-0-0")).not.toHaveValue("");
    await expect(page.getByTestId("person-0-1")).not.toHaveValue("");
    await page.getByTestId("save-button").click();
    // Falls frühere Läufe denselben Tag belegt haben: Konflikte bewusst bestätigen
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible({ timeout: 3000 }).catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    assignmentUrl = page.url();
    await expect(page.getByText("Konkretisiert").first()).toBeVisible();
    // Konkretisierungs-PDF wurde beim Speichern erzeugt und ist abrufbar
    const docLink = page.locator('a[href^="/api/documents/"]').first();
    await expect(docLink).toContainText(/Konkretisierung/);
    const href = await docLink.getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
    // Mitarbeiter-Link merken
    const open = page.locator('a[href*="/e/"]', { hasText: "Öffnen" }).first();
    tokenUrl = (await open.getAttribute("href"))!;
    expect(tokenUrl).toMatch(/\/e\/[0-9a-f-]{36}$/);
  });

  test("Mitarbeiter erfasst auf dem Handy und unterschreibt; Eintrag ist danach gesperrt", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(tokenUrl);
    await expect(page.getByText(`E2E ${RUN}`)).toBeVisible();
    await page.locator("#pause").fill("30");
    await page.getByTestId("pkw-check").check();
    await page.getByRole("button", { name: "Privat-PKW" }).click();
    await page.getByPlaceholder("Start-Ort").fill("Göppingen");
    await page.getByPlaceholder("Stop-Ort").fill("Stuttgart");
    await page.getByPlaceholder("km").fill("45");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await expect(page.getByTestId("submit")).toBeEnabled();
    await page.getByTestId("submit").click();
    await expect(page.getByTestId("state-erfasst")).toBeVisible();
    // Zweiter Versuch über die API wird abgelehnt (einmalige Signatur)
    const again = await page.request.post(`/api${new URL(tokenUrl).pathname}`, { data: { startDatum: DATE, start: "07:00", endeDatum: DATE, ende: "15:00", unterweisungBestaetigt: true, unterschrift: "x".repeat(200) } });
    expect(again.status()).toBe(409);
    await context.close();
  });

  test("Crew-Link: zweite Person unterschreibt, Kunde bestätigt", async ({ page }) => {
    await login(page);
    await page.goto(assignmentUrl);
    const url = (await page.getByTestId("crew-link").getAttribute("title")) ?? "";
    expect(url).toMatch(/\/e\/crew\/[0-9a-f-]{36}/);
    await page.goto(url);
    const signButtons = page.locator('[data-testid^="crew-sign-"]');
    await expect(signButtons).toHaveCount(1);
    await signButtons.first().click();
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await expect(page.getByText("2 von 2 unterschrieben")).toBeVisible();
    await page.getByTestId("crew-kunde").click();
    await page.getByTestId("kunde-name").fill("Jonas Keller");
    await drawSignature(page, "kunde-signature");
    await page.getByTestId("kunde-submit").click();
    await expect(page.getByText("✓ Jonas Keller")).toBeVisible();
  });

  test("Stundennachweis-PDF liegt unter Kategorie stundennachweis; Freigabe; Auswertung; Exporte", async ({ page }) => {
    await login(page);
    // Job-Queue verarbeiten (Abschluss-Check erzeugt das PDF automatisch)
    const jobs = await page.request.post("/api/jobs/run");
    expect(jobs.status()).toBe(200);
    await page.goto(assignmentUrl);
    await expect(page.locator('a[href^="/api/documents/"]', { hasText: /Stundennachweis/ }).first()).toBeVisible();
    await page.goto(`/dokumente?category=stundennachweis&q=E2E_${RUN}`);
    await expect(page.locator('a[href^="/api/documents/"]').first()).toContainText(/Stundennachweis_E2E_/);

    // Freigabe: erfasst → freigegeben
    await page.goto(`/einsaetze/freigabe?review=ERFASST&from=${DATE}&to=${DATE}`);
    await page.locator('thead input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Direkt freigeben" }).click();
    await expect(page.getByText(/freigegeben\./)).toBeVisible();

    // Auswertung: Filter nach Person und Zeitraum, Summen korrekt (2 × 7,5 h)
    await page.goto(`/auswertung?von=${DATE}&bis=${DATE}&review=FREIGEGEBEN`);
    await expect(page.getByTestId("kpi-Gesamtstunden")).toHaveText("15,00");
    await expect(page.getByTestId("kpi-Personen")).toHaveText("2");
    await expect(page.getByTestId("kpi-Fahrten privat / Firma")).toHaveText("1 / 0");

    // Excel-Export
    const xlsx = await page.request.get(`/auswertung/export?format=xlsx&von=${DATE}&bis=${DATE}&archivieren=0`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

    // zvoove: Validierung meldet Fehler bei fehlender Personalnummer nicht (Seed hat PN) → Download läuft
    const validate = await page.request.get(`/auswertung/export?format=zvoove&von=${DATE}&bis=${DATE}&validate=1`);
    const v = await validate.json();
    expect(v.ok).toBe(true);
    expect(v.zeilen).toBeGreaterThanOrEqual(3); // 2× Normal + Fahrt privat
    const csv = await page.request.get(`/auswertung/export?format=zvoove&von=${DATE}&bis=${DATE}&archivieren=0`);
    expect(csv.status()).toBe(200);
    const text = (await csv.body()).toString("latin1");
    expect(text.split("\r\n")[0]).toContain("Personalnummer;Datum;Lohnart;Stunden");
    expect(text).toContain(`10008;${DATE_DE};100;7,50`);
    // Validierung meldet unvollständige Datensätze (Zeitraum außerhalb)
    const bad = await page.request.get("/auswertung/export?format=zvoove&von=2031-01-01&bis=2031-01-01&validate=1");
    expect((await bad.json()).zeilen).toBe(0);
  });
});
