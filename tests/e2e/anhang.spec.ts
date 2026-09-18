// Einsatz aus einer angehängten Datei anlegen – ohne Rohtext.
// Die Textdatei wird serverseitig gelesen und in den Rohtext übernommen,
// das funktioniert auch ohne ANTHROPIC_API_KEY über die Heuristik.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const N = Math.floor(Date.now() / 1000);
const DATE_DE = `${String(1 + (Math.floor(N / 12) % 28)).padStart(2, "0")}.${String(1 + (N % 12)).padStart(2, "0")}.2028`;

const PLAN = `Artist: Anhang ${RUN}
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

test("Einsatz allein aus einer angehängten Datei auswerten", async ({ page }) => {
  await login(page);
  await page.goto("/einsaetze/neu");

  // Ohne Rohtext und ohne Anhang ist nichts auszuwerten
  await expect(page.getByTestId("parse-button")).toBeDisabled();

  await page.getByTestId("anhang-input").setInputFiles({ name: "ablaufplan.txt", mimeType: "text/plain", buffer: Buffer.from(PLAN, "utf8") });
  await expect(page.getByTestId("anhang-liste")).toContainText("ablaufplan.txt");
  await expect(page.getByTestId("parse-button")).toBeEnabled();

  await page.getByTestId("parse-button").click();
  await expect(page.getByTestId("projekt")).toHaveValue(`Anhang ${RUN}`);
  await expect(page.getByTestId("person-0-0")).not.toHaveValue("");
  await expect(page.getByTestId("person-0-1")).not.toHaveValue("");

  // Nicht lesbare Anhänge werden benannt, nicht stillschweigend verworfen
  await page.getByTestId("anhang-input").setInputFiles({ name: "vertrag.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x", "utf8") });
  await page.getByTestId("parse-button").click();
  await expect(page.getByText(/Anhang „vertrag.docx“ wurde übergangen/)).toBeVisible();
});
