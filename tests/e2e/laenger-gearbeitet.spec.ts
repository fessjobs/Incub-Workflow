// Wer länger arbeitet als geplant, trägt das eigene Ende ein und unterschreibt – im Einzellink wie im Gruppenlink. Geändert
// werden darf, bis der Kunde unterschrieben hat; auch eine Freigabe durch die Dispo sperrt den Link nicht.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { naechsteUnterschrift, tutorialWeg, unterschriftAngekommen } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? /DATABASE_URL="?([^"\n]+)"?/.exec(readFileSync(".env", "utf8"))?.[1] });
const N = Math.floor(Date.now() / 1000);
const MONAT = String(1 + (N % 12)).padStart(2, "0");
const TAG = `2037-${MONAT}-14`;
const de = (k: string) => k.split("-").reverse().join(".");
const NAME = `Laenger-${RUN}`;
const NAME2 = `Spaeter-${RUN}`;

const RAW = `Artist: Überstunden ${RUN}
Location: Porsche Arena Stuttgart
Kunde: Mannheimer Power GmbH
Arbeitsbeginn ${de(TAG)}:
Aufbau | 08:00 - 16:30 Uhr | 2x Hands
Timo ${NAME}
Lena ${NAME2}
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

test.describe.serial("Länger gearbeitet als geplant", () => {
  let einsatzUrl = "";
  let einzelPfad = "";
  let crewPfad = "";
  // Wem gehört der Einzellink? Die andere Person ändert später über den Gruppenlink
  let andererName = "";

  test.afterAll(async () => {
    const a = await db.assignment.findMany({ where: { projekt: { contains: RUN } }, select: { id: true } });
    const docs = await db.document.findMany({ where: { links: { some: { assignmentId: { in: a.map((x) => x.id) } } } }, select: { id: true } });
    await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    await db.assignment.deleteMany({ where: { id: { in: a.map((x) => x.id) } } });
    await db.employee.deleteMany({ where: { nachname: { in: [NAME, NAME2] } } });
    await db.$disconnect();
  });

  test("Einsatz mit zwei Personen anlegen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/neu");
    await page.getByTestId("raw-input").fill(RAW);
    await page.getByTestId("parse-button").click();
    await expect(page.getByTestId("person-0-0")).toBeVisible();
    for (const feld of [page.getByTestId("person-0-0"), page.getByTestId("person-0-1")]) {
      if ((await feld.inputValue()) === "") await feld.selectOption("__neu");
    }
    await page.getByTestId("save-button").click();
    const konflikte = page.getByLabel("Konflikte geprüft, trotzdem speichern");
    if (await konflikte.isVisible({ timeout: 3000 }).catch(() => false)) {
      await konflikte.check();
      await page.getByTestId("save-button").click();
    }
    await page.waitForURL(/\/einsaetze\/(?!neu$)[a-z0-9]+$/);
    einsatzUrl = page.url();
    await page.getByTestId("einzellinks-toggle").click();
    einzelPfad = new URL((await page.locator('a[href*="/e/"]', { hasText: "Öffnen" }).last().getAttribute("href")) ?? "").pathname;
    crewPfad = new URL((await page.getByTestId("gruppen-link").getAttribute("title")) ?? "").pathname;
    expect(einzelPfad).toMatch(/^\/e\/[0-9a-f-]{36}$/);
    const besitzer = await db.shiftAssignment.findUniqueOrThrow({ where: { token: einzelPfad.split("/").pop() }, include: { employee: true } });
    andererName = besitzer.employee.nachname === NAME ? NAME2 : NAME;
  });

  test("Einzellink: bis 17:30 statt 16:30 eintragen und unterschreiben", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(einzelPfad);
    await tutorialWeg(page);
    // Vorbelegt ist der Plan
    await expect(page.locator("#ende")).toHaveValue("16:30");
    await page.locator("#ende").fill("17:30");
    await page.locator("#pause").fill("30");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await expect(page.getByTestId("submit")).toBeEnabled();
    await page.getByTestId("submit").click();
    await expect(page.getByTestId("schon-unterschrieben")).toBeVisible();
    await expect(page.locator("#ende")).toHaveValue("17:30");
    await context.close();
    const e = await db.timeEntry.findFirstOrThrow({ where: { aktuell: true, shiftAssignment: { employee: { nachname: { in: [NAME, NAME2] } }, token: einzelPfad.split("/").pop() } } });
    expect(Number(e.stundenGesamt)).toBe(9);
    expect(e.unterschriftMitarbeiterUrl).toBeTruthy();
  });

  test("Gruppenlink: die andere Person trägt 18:00 statt 16:30 ein und unterschreibt", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    await naechsteUnterschrift(page).click();
    await page.locator('input[type="time"]').nth(1).fill("18:00");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 2, 2);
    const eintraege = await db.timeEntry.findMany({ where: { aktuell: true, shiftAssignment: { employee: { nachname: { in: [NAME, NAME2] } } } }, orderBy: { stundenGesamt: "asc" } });
    expect(eintraege).toHaveLength(2);
    expect(eintraege.map((x) => Number(x.stundenGesamt)).sort()).toEqual([9, 9.5]);
  });

  test("Die Dispo sieht die Abweichung bei der Freigabe", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/freigabe?review=ERFASST&from=${TAG}&to=${TAG}`);
    await expect(page.getByText("Plan/Ist > 30 min").first()).toBeVisible();
    await expect(einsatzUrl).toBeTruthy();
  });

  test("Die Dispo gibt die Zeiten frei – der Link bleibt trotzdem offen", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/freigabe?review=ERFASST&from=${TAG}&to=${TAG}`);
    await page.locator('thead input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Direkt freigeben" }).click();
    await expect(page.getByText(/freigegeben\./)).toBeVisible();
    expect(await db.timeEntry.count({ where: { aktuell: true, review: "FREIGEGEBEN", shiftAssignment: { employee: { nachname: { in: [NAME, NAME2] } } } } })).toBe(2);
  });

  test("Nach der Freigabe trägt die erste Person noch 18:00 ein und unterschreibt neu", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(einzelPfad);
    await tutorialWeg(page);
    // Kein „gesperrt“, sondern das Formular mit den eigenen Zeiten
    await expect(page.getByTestId("schon-unterschrieben")).toBeVisible();
    await expect(page.locator("#ende")).toHaveValue("17:30");
    await page.locator("#ende").fill("18:00");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("submit").click();
    await expect(page.getByTestId("submit")).toHaveText("Geänderte Zeiten absenden");
    await expect(page.locator("#ende")).toHaveValue("18:00");
    await context.close();
    const versionen = await db.timeEntry.findMany({ where: { shiftAssignment: { token: einzelPfad.split("/").pop() } }, orderBy: { version: "asc" } });
    expect(versionen.map((v) => [v.version, v.aktuell, v.review, Number(v.stundenGesamt)])).toEqual([
      [1, false, "FREIGEGEBEN", 9],
      [2, true, "ERFASST", 9.5],
    ]);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "time_entry.sign", entityId: versionen[1].id } });
    expect(log.data).toMatchObject({ nachFreigabeGeaendert: true });
  });

  test("Im Gruppenlink geht „Zeiten ändern“ nach der Freigabe ebenfalls", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    // Gezielt die Person, die nicht den Einzellink benutzt hat: ihre Zeile trägt den Namen
    await page.locator(".ez-list-item", { hasText: andererName }).getByRole("button", { name: "Zeiten ändern" }).click();
    await expect(page.getByTestId("schon-unterschrieben")).toBeVisible();
    await page.locator('input[type="time"]').nth(1).fill("18:30");
    await page.getByTestId("unterweisung-check").check();
    await drawSignature(page);
    await page.getByTestId("crew-submit").click();
    await unterschriftAngekommen(page, 2, 2);
    const aktuell = await db.timeEntry.findMany({ where: { aktuell: true, shiftAssignment: { employee: { nachname: { in: [NAME, NAME2] } } } } });
    // Einzellink-Person: nach der Freigabe auf 18:00 geändert (9,5 h, neu erfasst); andere Person: auf 18:30 geändert (10 h, neu erfasst)
    expect(aktuell.map((x) => [x.review, Number(x.stundenGesamt)]).sort()).toEqual([["ERFASST", 10], ["ERFASST", 9.5]]);
  });

  test("Die Dispo sieht beide wieder in „Erfasst“, mit Hinweis auf die Änderung nach der Freigabe", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/freigabe?review=ERFASST&from=${TAG}&to=${TAG}`);
    await expect(page.getByText("nach Freigabe geändert")).toHaveCount(2);
    await expect(page.getByText("v2")).toHaveCount(2);
  });

  test("Erst die Unterschrift des Kunden schließt die Links", async ({ page }) => {
    await page.goto(crewPfad);
    await tutorialWeg(page);
    await page.getByTestId("crew-kunde").click();
    await page.getByTestId("kunde-name").fill("Frau Berger");
    await drawSignature(page, "kunde-signature");
    await page.getByTestId("kunde-submit").click();
    await expect(page.getByText("✓ Frau Berger")).toBeVisible();

    // Jetzt ist zu: der Einzellink zeigt nur noch den Stand, und der Server nimmt nichts mehr an
    await page.goto(einzelPfad);
    await expect(page.getByTestId("submit")).toHaveCount(0);
    const r = await page.request.post(`/api/e/${einzelPfad.split("/").pop()}`, { data: { startDatum: TAG, start: "08:00", endeDatum: TAG, ende: "19:00", pauseMinuten: 30, unterweisungBestaetigt: true, unterschrift: "x".repeat(200) } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toContain("Kunde hat bereits bestätigt");
  });
});
