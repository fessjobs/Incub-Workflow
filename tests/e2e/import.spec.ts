// Stammdaten-Import: Datei hochladen, Vorschau prüfen, übernehmen.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
// Personalnummern bleiben rein numerisch, damit die Liste sie so anzeigt, wie sie in der Datei stehen
const PN = String(Date.now()).slice(-6);
// Nachname je Lauf eindeutig: der Abgleich läuft über Personalnummer bzw. exakten Namen,
// sonst gälten die Personen aus einem früheren Testlauf als schon vorhanden.
const NACHNAME = `Neu-Import-${RUN}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Stammdaten-Import", () => {
  test("Mitarbeiter aus CSV: Vorschau, Übernahme, keine Dubletten beim zweiten Lauf", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/personal/import");

    // Spalten bewusst in ungewohnter Reihenfolge und Schreibweise
    const csv = [
      "Pers.-Nr;Name;E-Mail Adresse;Handy;Qualifikationen",
      `${PN}1;"${NACHNAME}, Anna";anna-${RUN}@fess.jobs;0170 111;Stapler`,
      `${PN}2;Bernd ${NACHNAME};;0170 222;Rigger, Stapler`,
      `;Ohne Nummer ${NACHNAME};;;`,
      `${PN}3;NurEinName${RUN};;;`,
    ].join("\r\n");

    await page.getByTestId("import-datei").setInputFiles({ name: "personal.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.getByTestId("vorschau-button").click();

    // Spaltenerkennung und Befunde
    await expect(page.getByText(/personalnummer ←/)).toBeVisible();
    await expect(page.getByText("3 neu")).toBeVisible();
    await expect(page.getByText(/1 Fehler/)).toBeVisible();
    await expect(page.getByText(/Vorname fehlt/)).toBeVisible();

    await page.getByTestId("import-button").click();
    const ergebnis = page.getByTestId("import-ergebnis");
    await expect(ergebnis).toContainText("3 neu angelegt");

    // Zweiter Lauf mit derselben Datei: nichts wird doppelt angelegt
    await page.goto("/einsaetze/personal/import");
    await page.getByTestId("import-datei").setInputFiles({ name: "personal.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.getByTestId("vorschau-button").click();
    await expect(page.getByText("0 neu")).toBeVisible();
    await page.getByTestId("import-button").click();
    await expect(page.getByTestId("import-ergebnis")).toContainText("0 neu angelegt");

    // Die Personen stehen in der Liste
    await page.goto(`/einsaetze/personal?q=${NACHNAME}`);
    await expect(page.getByText(`${NACHNAME}, Anna`)).toBeVisible();
    await expect(page.getByText(new RegExp(`PN ${PN}1`))).toBeVisible();
  });

  test("Kunden aus CSV inklusive zusammengesetzter Adresse", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/kunden/import");
    const csv = [
      "Firmenname;Strasse;PLZ;Ort;Ansprechpartner;Bundesland;AÜ-Vertrag",
      `Testkunde ${RUN} GmbH;Hafenstraße 12;68159;Mannheim;Jonas Keller;Baden-Württemberg;AÜV-${RUN}`,
      `;;;;;;`,
    ].join("\r\n");
    await page.getByTestId("import-datei").setInputFiles({ name: "kunden.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.getByTestId("vorschau-button").click();
    await expect(page.getByText("1 neu")).toBeVisible();
    await expect(page.getByText("Hafenstraße 12, 68159 Mannheim")).toBeVisible();
    await expect(page.getByRole("cell", { name: "BW", exact: true })).toBeVisible();
    await page.getByTestId("import-button").click();
    await expect(page.getByTestId("import-ergebnis")).toContainText("1 neu angelegt");
    await page.goto("/einsaetze/kunden");
    await expect(page.getByText(`Testkunde ${RUN} GmbH`)).toBeVisible();
  });
});
