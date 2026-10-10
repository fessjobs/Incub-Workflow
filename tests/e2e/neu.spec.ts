// Neues System (parallel zum bisherigen): Button in der Navigation, eigene Daten,
// Einladung → Fragebogen → Bewerbung, Beleg-Link mit Upload, Zugriffsschutz.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import JSZip from "jszip";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { unterschriftDataUrl } from "../fixtures/unterschrift";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const VORNAME = "Neuer";
const NACHNAME = `Test-${RUN}`;
const PNR = `T${RUN.toUpperCase()}`;
const AUFTRAG = `Neuer Auftrag ${RUN}`;

// 1x1-PNG: klein, aber ein echtes Bild
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function neuerAdmin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  return page;
}

// Das Speichern läuft kurz verzögert: erst abwarten, dann prüfen, dass alles angekommen ist
async function gespeichert(page: Page) {
  await page.waitForTimeout(900);
  await expect(page.getByTestId("speicherstand")).toHaveText("Gespeichert ✓");
}

// Schritt 1 der Unterweisung: das Video. Das Test-Chromium spielt H.264 nicht ab, darum stellen wir die Ereignisse des
// Players nach (Start, Ende). Die Wartezeit deckt die Mindestdauer ab, die der Server prüft (Testserver: 3 % der Länge).
async function videoAnsehen(page: Page) {
  const warte = page.locator('[data-testid="video-weiter"], [data-testid="karte"]').first();
  await warte.waitFor();
  if (!(await page.getByTestId("video-weiter").count())) return; // kein Video bei diesem Modul
  const player = page.getByTestId("video-player");
  if (await player.count()) {
    // Weiter ist gesperrt, solange das Video nicht zu Ende gelaufen ist
    await expect(page.getByTestId("video-weiter")).toBeDisabled();
    const start = page.waitForResponse((r) => r.url().includes("/api/neu/crew/aktion") && (r.request().postData() ?? "").includes('"unterweisung-start"'));
    await player.locator("video").evaluate((v) => v.dispatchEvent(new Event("play")));
    expect((await start).status()).toBe(200);
    await page.waitForTimeout(2600);
    await player.locator("video").evaluate((v) => v.dispatchEvent(new Event("ended")));
    await expect(page.getByTestId("video-fertig-hinweis")).toBeVisible();
  } else if (await page.getByTestId("video-gesehen").count()) {
    await page.getByTestId("video-gesehen").check();
  }
  await page.getByTestId("video-weiter").click();
}

// Mit Maus/Finger im Unterschriftenfeld ein paar Striche ziehen
async function unterschreiben(page: Page) {
  const feld = page.getByTestId("signatur");
  await feld.scrollIntoViewIfNeeded();
  const box = await feld.boundingBox();
  if (!box) throw new Error("Unterschriftenfeld nicht sichtbar");
  for (const versatz of [0, 22]) {
    await page.mouse.move(box.x + 30, box.y + box.height / 2 + versatz);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + box.height / 2 + versatz + Math.sin(i) * 26);
    await page.mouse.up();
  }
}

// Lernkarten, Quiz (richtige Antworten) und Bestätigung bis zum Unterschriftenfeld
async function karteQuizBestaetigung(page: Page) {
  await page.getByTestId("karte").waitFor();
  while (await page.getByTestId("karte-weiter").isVisible()) await page.getByTestId("karte-weiter").click();
  await page.getByTestId("quiz").waitFor();
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId("zur-bestaetigung").count()) break;
    const richtig = page.locator('[data-testid="quiz"] button[data-richtig="1"]:not([disabled])').first();
    if (await richtig.count()) {
      await richtig.click();
      await page.getByTestId("quiz-weiter").click();
    }
  }
  await page.getByTestId("zur-bestaetigung").click();
  // Ohne Haken geht es nicht zur Unterschrift
  await expect(page.getByTestId("zur-unterschrift")).toBeDisabled();
  await page.getByTestId("haken").check();
  await page.getByTestId("zur-unterschrift").click();
}

// Eine ganze Unterweisung am Handy: Video, Karten, Quiz, Bestätigung, Unterschrift; wartet auf die Antwort des Servers
async function unterweisungDurcharbeiten(page: Page) {
  await videoAnsehen(page);
  await karteQuizBestaetigung(page);
  // Ohne Unterschrift ist der Abschluss gesperrt
  await expect(page.getByTestId("bestaetigen-uw")).toBeDisabled();
  await unterschreiben(page);
  await expect(page.getByTestId("bestaetigen-uw")).toBeEnabled();
  const antwort = page.waitForResponse((r) => r.url().includes("/api/neu/crew/aktion") && (r.request().postData() ?? "").includes('"unterweisung"') && !(r.request().postData() ?? "").includes("unterweisung-start"));
  await page.getByTestId("bestaetigen-uw").click();
  expect((await antwort).status()).toBe(200);
  // Erst wenn der Server das Nachweis-PDF angelegt hat, gilt es als abgeschlossen
  await expect(page.getByTestId("nachweis-gespeichert")).toBeVisible();
}

async function unterweisungMachen(page: Page, modul: string) {
  await page.goto("/crew/unterweisung");
  await page.getByTestId(`modul-${modul}`).click();
  await unterweisungDurcharbeiten(page);
}

test.describe.configure({ mode: "serial" });

let crewCtx: BrowserContext | null = null;
let einladungsLink = "";
let belegLink = "";

test.describe("Neues Dashboard: Zugang", () => {
  test("Der Button in der Navigation führt ins neue Dashboard, das bisherige bleibt erreichbar", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("link", { name: /Einsätze/ }).first()).toBeVisible();
    await page.getByRole("link", { name: /Neu · Crew & Stunden/ }).first().click();
    await page.waitForURL(/\/admin$/);
    await expect(page.locator(".pv-banner")).toContainText("Parallel zum bisherigen System");
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
    // zurück ins bisherige Dashboard
    await page.getByRole("link", { name: /Bisheriges Dashboard/ }).first().click();
    await page.waitForURL(/\/dashboard/);
  });

  test("Ohne Anmeldung ist nichts erreichbar", async ({ request }) => {
    const admin = await request.get("/admin", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(admin.status());
    for (const url of ["/api/neu/state", "/api/neu/version"]) expect((await request.get(url)).status(), url).toBe(401);
    expect((await request.post("/api/neu/sync", { data: { ops: [] } })).status()).toBe(401);
    expect((await request.post("/api/neu/seed", { data: { ops: [] } })).status()).toBe(401);
    expect((await request.get("/api/neu/files/abc")).status()).toBe(401);
    // Crew-Schnittstellen ohne Sitzung
    expect((await request.get("/api/neu/crew/state")).status()).toBe(401);
    expect((await request.post("/api/neu/crew/aktion", { data: { typ: "abschicken" } })).status()).toBe(401);
    expect((await request.get("/api/neu/b/gibtsnicht")).status()).toBe(404);
    const start = await request.get("/crew/start/ungueltig");
    expect(start.status()).toBe(410);
  });

  test("Andere Rollen als Admin kommen nicht hinein", async ({ browser }) => {
    // Das Disponenten-Konto des Einsatz-Tests gibt es nicht überall – hier nur: kein Cookie, kein Zugriff (oben).
    const ctx = await browser.newContext();
    const r = await ctx.request.get("/api/neu/state");
    expect(r.status()).toBe(401);
    await ctx.close();
  });
});

test.describe("Neues Dashboard: eigene Daten", () => {
  test("Person anlegen, Auftrag anlegen und veröffentlichen, Stunden eintragen – alles bleibt nach dem Neuladen", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/crew");
    await page.getByTestId("person-anlegen").click();
    await page.getByLabel("Vorname").fill(VORNAME);
    await page.getByLabel("Nachname").fill(NACHNAME);
    await page.getByLabel("Personalnummer").fill(PNR);
    await page.getByLabel("Status").selectOption("aktiv");
    await page.getByLabel("PLZ", { exact: true }).fill("70173");
    await page.getByLabel("Wohnort").fill("Stuttgart");
    await page.getByTestId("vertrag-an").check();
    await page.getByLabel("Stundenlohn").fill("14,00");
    await page.getByTestId("person-speichern").click();
    await expect(page.getByTestId("crew-tabelle")).toContainText(NACHNAME);
    await gespeichert(page);

    await page.goto("/admin/dispo");
    await page.getByTestId("auftrag-anlegen").click();
    await page.getByLabel("Titel").fill(AUFTRAG);
    await page.getByLabel("Kunde", { exact: true }).fill("Testkunde GmbH");
    await page.getByLabel("Ort", { exact: true }).fill("Stuttgart");
    await page.getByLabel("PLZ des Einsatzorts").fill("70372");
    await page.getByTestId("veroeffentlichen").check();
    await page.getByTestId("auftrag-speichern").click();
    await expect(page.getByTestId("dispo-liste")).toContainText(AUFTRAG);
    await gespeichert(page);

    // Ein neuer Auftrag erscheint in der Stundentabelle als wählbarer Auftrag
    await page.goto("/admin/stunden");
    await page.waitForSelector(".pvg");
    await page.getByRole("button", { name: "+ Neue Zeile" }).click();
    const zeile = page.getByTestId("grid-zeile").first();
    await zeile.locator('input[data-c="pnr"]').fill(PNR);
    await zeile.locator('input[data-c="pnr"]').press("Enter");
    await zeile.locator('input[data-c="start"]').fill("08:00");
    await zeile.locator('input[data-c="start"]').press("Enter");
    await zeile.locator('input[data-c="ende"]').fill("16:30");
    await zeile.locator('input[data-c="ende"]').press("Enter");
    await expect(zeile.locator(".pvg-c.calc").nth(2)).toHaveText("8,50");
    await gespeichert(page);

    // Neu laden: alles ist noch da
    await page.reload();
    await page.waitForSelector('[data-testid="grid-zeile"]');
    await expect(page.getByTestId("grid-zeile").first().locator('input[data-c="pnr"]')).toHaveValue(PNR);
    await expect(page.getByTestId("grid-zeile").first().locator('input[data-c="ende"]')).toHaveValue("16:30");
    await page.goto("/admin/crew");
    await expect(page.getByTestId("crew-tabelle")).toContainText(NACHNAME);
    await page.close();
  });

  test("Änderungsprotokoll steht in der neuen Tabelle, nicht im bisherigen System", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/stunden");
    await page.waitForSelector('[data-testid="grid-zeile"]');
    await page.getByRole("button", { name: /Änderungsprotokoll/ }).click();
    // Das Protokoll kommt vom Server (auch nach dem Neuladen da) und nennt den angemeldeten Benutzer
    await expect(page.getByTestId("protokoll")).toContainText("neu angelegt (manuell)");
    await expect(page.getByTestId("protokoll").locator("tbody tr").first()).toContainText(/\(Admin\)/);
    await expect(page.getByTestId("protokoll").locator("tbody tr").first()).not.toContainText("Maik (Admin)");
    await page.close();
  });

  test("Zwei Bildschirme: der veraltete überschreibt nichts, er lädt neu", async ({ browser }) => {
    const a = await neuerAdmin(browser);
    const b = await neuerAdmin(browser);
    for (const p of [a, b]) {
      await p.goto("/admin/stunden");
      await p.waitForSelector('[data-testid="grid-zeile"]');
      await p.getByLabel("Person").fill(PNR);
    }
    const feldA = a.getByTestId("grid-zeile").first().locator('input[data-c="bemerkung"]');
    await feldA.fill("von A");
    await feldA.press("Enter");
    await gespeichert(a);
    const feldB = b.getByTestId("grid-zeile").first().locator('input[data-c="bemerkung"]');
    await feldB.fill("von B");
    await feldB.press("Enter");
    await expect(b.locator(".pv-toast")).toContainText("zwischenzeitlich");
    await b.getByLabel("Person").fill(PNR);
    await expect(b.getByTestId("grid-zeile").first().locator('input[data-c="bemerkung"]')).toHaveValue("von A");
    await a.close();
    await b.close();
  });
});

test.describe("Neues System: Einladung, Crew, Freigabe, Bewerbung", () => {
  test("Einladungslink für eine neue Person erzeugen", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/bewerber");
    await page.getByLabel("Vorname").fill("Eingeladen");
    await page.getByLabel("Nachname").fill(`Crew-${RUN}`);
    await page.getByLabel("Handynummer").fill("0151 1234 5678");
    await page.getByTestId("einladen").click();
    await page.getByTestId("link-erzeugen").click();
    const text = await page.getByTestId("einladung-text").inputValue();
    const m = /(https?:\/\/\S+\/crew\/start\/\S+?)(?=\s|$)/.exec(text);
    expect(m, text).toBeTruthy();
    einladungsLink = (m as RegExpExecArray)[1];
    await gespeichert(page);
    await expect(page.getByTestId("wartend")).toContainText(`Crew-${RUN}`);
    await page.close();
  });

  test("Die Person füllt den Fragebogen aus, auch Schuhgröße und Arbeitskleidung gegen Pfand", async ({ browser }) => {
    crewCtx = await browser.newContext();
    const page = await crewCtx.newPage();
    // Der Link nennt die öffentliche Adresse (APP_BASE_URL/Railway); im Test gilt der Pfad auf dem Testserver
    await page.goto(new URL(einladungsLink).pathname);
    await page.waitForURL(/\/crew$/);
    await expect(page.getByRole("heading", { name: "Hallo Eingeladen" })).toBeVisible();
    // Kein Banner, kein Zugang zu Admin-Daten
    await expect(page.locator(".pv-banner")).toHaveCount(0);
    expect((await crewCtx.request.get("/api/neu/state")).status()).toBe(401);
    // Die Aufträge sind noch gesperrt
    await expect(page.getByTestId("freigabe-hinweis")).toHaveAttribute("data-status", "offen");

    await page.locator(".pvc-main").getByRole("link", { name: /Fragebogen/ }).first().click();
    await page.getByLabel("Postleitzahl").fill("70173");
    await page.getByLabel("Wohnort").fill("Stuttgart");
    await page.locator(".pv-field", { hasText: "Ich bin volljährig." }).getByRole("button", { name: "Ja" }).click();
    for (let i = 0; i < 4; i++) await page.getByTestId("weiter").click();

    // Etappe 5: Ausrüstung
    await expect(page.getByTestId("kleidung")).toBeVisible();
    await expect(page.locator(".pv-hint", { hasText: "gegen Pfand" })).toBeVisible();
    await page.getByLabel("Schuhgröße (EU)").selectOption("43");
    await page.getByTestId("kleidung").getByRole("button", { name: "Ja", exact: true }).click();
    // Wunsch ohne Artikel und ohne Shirtgröße lässt sich nicht abschicken
    await page.getByTestId("weiter").click();
    await expect(page.locator(".pv-error")).toContainText("mindestens einen Artikel");
    await page.getByLabel("T-Shirt", { exact: true }).check();
    await page.getByLabel("Sicherheitsschuhe S3").check();
    await page.getByTestId("weiter").click();
    await expect(page.locator(".pv-error")).toContainText("Shirtgröße");
    await page.getByLabel("Shirtgröße").selectOption("M");
    await page.getByTestId("weiter").click();
    await page.getByTestId("weiter").click();
    for (const q of await page.locator(".pv-card", { has: page.locator(".pv-opt") }).all()) await q.locator(".pv-opt").first().click();
    // Abschicken geht sofort an den Server; erst nach der Bestätigung weitermachen
    const abgeschickt = page.waitForResponse((r) => r.url().includes("/api/neu/crew/aktion") && (r.request().postData() ?? "").includes('"abschicken"'));
    await page.getByTestId("weiter").click();
    expect((await abgeschickt).status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Danke, Eingeladen/ })).toBeVisible();

    // Neu laden: der Fragebogen steht auf dem Server
    await page.reload();
    await expect(page.getByRole("heading", { name: /Danke, Eingeladen/ })).toBeVisible();
    await page.close();
  });

  test("Ohne Freigabe sieht die Person keine Aufträge – der Server liefert sie auch nicht aus", async () => {
    const page = await (crewCtx as BrowserContext).newPage();
    await page.goto("/crew/jobs");
    await expect(page.getByTestId("freigabe-hinweis")).toHaveAttribute("data-status", "offen");
    await expect(page.getByTestId("crew-job")).toHaveCount(0);
    const st = await (await (crewCtx as BrowserContext).request.get("/api/neu/crew/state")).json();
    expect(st.freigabe).toBe("offen");
    expect(st.jobs).toEqual([]);
    expect(st.kleidung.artikel.length).toBeGreaterThan(3);
    const bew = await (crewCtx as BrowserContext).request.post("/api/neu/crew/aktion", { data: { typ: "bewerbung", jobId: "egal", schichtIds: ["x"], eigeneAnreise: true, hatVertrag: false, abfahrtsort: "", plaetze: 0, kommentar: "" } });
    expect(bew.status()).toBe(403);
    await page.close();
  });

  test("Grund-Unterweisung und Brandschutz erledigt: die Person wartet auf die Bestätigung", async () => {
    const page = await (crewCtx as BrowserContext).newPage();
    await unterweisungMachen(page, "grund");
    await unterweisungMachen(page, "brandschutz");
    await page.goto("/crew/jobs");
    await expect(page.getByTestId("freigabe-hinweis")).toHaveAttribute("data-status", "wartet");
    await expect(page.getByTestId("crew-job")).toHaveCount(0);
    await page.close();
  });

  test("Admin bestätigt in den Freigaben – das steht im Änderungsprotokoll", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/freigaben");
    const zeile = page.getByTestId("freigaben-tabelle").locator("tr", { hasText: `Crew-${RUN}` });
    await expect(zeile).toBeVisible();
    await zeile.getByRole("button", { name: "Freigeben", exact: true }).click();
    await expect(page.locator(".pv-toast")).toContainText("freigegeben");
    await gespeichert(page);
    await page.getByRole("tab", { name: /Entschieden/ }).click();
    await expect(page.getByTestId("freigaben-tabelle")).toContainText(`Crew-${RUN}`);
    await page.close();
  });

  test("Die Person sieht jetzt die Aufträge und bewirbt sich", async () => {
    const page = await (crewCtx as BrowserContext).newPage();
    await page.goto("/crew/jobs");
    await expect(page.getByTestId("crew-job").filter({ hasText: AUFTRAG })).toBeVisible();
    // Nur der veröffentlichte Auftrag ist sichtbar, ohne Treffpunkt
    await page.getByTestId("crew-job").filter({ hasText: AUFTRAG }).click();
    await page.getByTestId("bewerben").click();
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByTestId("weiter").click();
    await page.locator(".pv-field", { hasText: "Ich reise selbst an" }).getByRole("button", { name: "Ja", exact: true }).click();
    await page.locator(".pv-field", { hasText: "schon einen Vertrag bei FESS" }).getByRole("button", { name: "Nein", exact: true }).click();
    await page.getByTestId("weiter").click();
    // Unterweisung ist Pflicht und wird serverseitig geprüft
    for (let runde = 0; runde < 6; runde++) {
      const knopf = page.locator('button[data-testid^="uw-"]').first();
      if ((await knopf.count()) === 0) break;
      await knopf.click();
      await unterweisungDurcharbeiten(page);
      await page.getByTestId("zurueck-bewerbung").click();
    }
    await expect(page.getByText("Alles gültig – du kannst weiter.")).toBeVisible();
    await page.getByTestId("weiter").click();
    await page.getByTestId("bestaetigen").check();
    await page.getByTestId("absenden").click();
    await expect(page.getByTestId("status-tracker")).toContainText("eingegangen");
    // Server kennt die Bewerbung auch nach dem Neuladen
    await page.reload();
    await expect(page.getByTestId("status-tracker")).toContainText("eingegangen");
    await page.close();
  });

  test("Admin sieht Fragebogen mit Score und die Bewerbung – und kann einplanen", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/bewerber");
    await expect(page.getByTestId("fragebogen-tabelle")).toContainText(`Crew-${RUN}`);
    await expect(page.getByTestId("fragebogen-tabelle")).toContainText(/Kategorie [ABC]/);
    await page.getByRole("tab", { name: /Bewerbungen auf Jobs/ }).click();
    await expect(page.getByTestId("bewerbungen-tabelle")).toContainText(`Crew-${RUN}`);
    await page.goto("/admin/dispo");
    await page.getByTestId("dispo-liste").getByRole("link", { name: AUFTRAG }).click();
    await expect(page.getByTestId("bewerberliste")).toContainText(`Crew-${RUN}`);
    await page.close();
  });
});

test.describe("Neues System: Arbeitskleidung im Dashboard", () => {
  test("Bedarf nach Größe, Ausgabe gegen Pfand und Rückgabe", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/kleidung");
    // Der Wunsch der Person aus dem Fragebogen taucht im Bedarf auf (T-Shirt, Größe M)
    await page.getByRole("button", { name: /Stück/ }).first().click();
    await expect(page.getByText(`Eingeladen Crew-${RUN}`).first()).toBeVisible();
    // Am Profil: Schuhgröße und Wunsch, dann ausgeben
    await page.getByText(`Eingeladen Crew-${RUN}`).first().click();
    await page.getByRole("tab", { name: "Kleidung" }).click();
    await expect(page.locator(".pv-card", { hasText: "Wunsch aus dem Fragebogen" })).toContainText("43");
    await expect(page.locator(".pv-card", { hasText: "Wunsch aus dem Fragebogen" })).toContainText("T-Shirt");
    await page.getByLabel("Artikel", { exact: true }).selectOption({ label: "T-Shirt" });
    await page.getByLabel("Pfand", { exact: true }).fill("10");
    await page.getByTestId("kleidung-ausgeben").click();
    await gespeichert(page);
    await expect(page.locator(".pv-card", { hasText: "Ausgegeben" }).first()).toContainText("T-Shirt (M)");
    // Pfand ist offen, bis die Kleidung zurückkommt
    await page.goto("/admin/kleidung");
    await page.getByRole("tab", { name: /Ausgegeben und Pfand/ }).click();
    await expect(page.getByTestId("ausgabe-tabelle")).toContainText(`Crew-${RUN}`);
    await page.getByText(`Eingeladen Crew-${RUN}`).first().click();
    await page.getByRole("tab", { name: "Kleidung" }).click();
    await page.getByTestId("kleidung-zurueck").click();
    await gespeichert(page);
    await expect(page.locator(".pv-chip", { hasText: "zurück" })).toBeVisible();
    await page.close();
  });
});

test.describe("Neues System: Import", () => {
  const PNR_A = `Z${RUN.toUpperCase()}1`;
  const PNR_B = `Z${RUN.toUpperCase()}2`;
  const KUNDE = `Importkunde ${RUN}`;

  test("Personalstamm aus zvoove einfügen: Spalten, Vertrag, Befristung – sensible Spalten bleiben draußen", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/import");
    const tabelle = [
      "Personalnummer\tNachname\tVorname\tGeburtsdatum\tIBAN\tPLZ\tOrt\tMobil\tBeschäftigungsart\tEintritt\tBefristet bis\tStundenlohn",
      `${PNR_A}\tImport-${RUN}\tAnna\t01.01.1990\tDE89370400440532013000\t70173\tStuttgart\t0151 5550001\tGeringfügig Beschäftigte\t01.03.2026\t31.12.2026\t13,90`,
      `${PNR_B}\tImport-${RUN}\tBen\t02.02.1991\tDE89370400440532013001\t68159\tMannheim\t0151 5550002\tAushilfe\t15.09.2026\t\t14,50`,
    ].join("\n");
    await page.getByTestId("import-text").fill(tabelle);
    await page.getByTestId("import-einlesen").click();
    // Zuordnung erkannt, Geburtsdatum und IBAN werden nicht gelesen
    await expect(page.getByLabel("Personalnummer", { exact: true })).toHaveValue("0");
    await expect(page.getByText("nicht gelesen und nicht gespeichert")).toBeVisible();
    await expect(page.getByText("IBAN (Bankdaten)")).toBeVisible();
    // „Aushilfe“ kennen wir nicht: erst zuordnen
    await expect(page.getByTestId("vertrag-zuordnung")).toContainText("Aushilfe");
    await page.getByLabel("Vertragsart für Aushilfe").selectOption("kurzfristig");
    const vorschau = page.getByTestId("import-vorschau");
    await expect(vorschau).toContainText(`Anna Import-${RUN}`);
    await expect(vorschau).toContainText("Minijob, befristet bis 31.12.2026");
    await expect(vorschau).toContainText("kurzfristig, unbefristet");
    await page.getByTestId("import-uebernehmen").click();
    await expect(page.getByTestId("import-fertig")).toContainText("2 neu angelegt");
    await gespeichert(page);

    // In der Crew-Liste, mit Befristung im Profil; nichts Sensibles gespeichert
    await page.goto("/admin/crew");
    await page.getByPlaceholder("Name, Personalnummer, Ort").fill(`Import-${RUN}`);
    await expect(page.getByTestId("crew-tabelle")).toContainText(PNR_A);
    await expect(page.getByTestId("crew-tabelle")).toContainText("31.12.2026");
    const state = await (await page.request.get("/api/neu/state")).json();
    const unsere = state.records.crew.filter((c: { data: { pnr: string } }) => [PNR_A, PNR_B].includes(c.data.pnr));
    expect(unsere).toHaveLength(2);
    const roh = JSON.stringify(unsere);
    for (const verboten of ["DE89370400440532013000", "DE89370400440532013001", "1990-01-01", "01.01.1990", "1991"]) expect(roh).not.toContain(verboten);

    // Zweiter Import derselben Tabelle: nichts ändert sich
    await page.goto("/admin/import");
    await page.getByTestId("import-text").fill(tabelle);
    await page.getByTestId("import-einlesen").click();
    await page.getByLabel("Vertragsart für Aushilfe").selectOption("kurzfristig");
    await expect(page.getByTestId("import-uebernehmen")).toBeDisabled();
    await expect(page.getByTestId("import-uebernehmen")).toContainText("0 neu, 0 aktualisieren");
    await page.close();
  });

  test("Excel-Datei hochladen (Server liest .xlsx) und Aufträge aus der Regio-Tabelle importieren", async ({ browser }) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Planung");
    ws.addRow(["Regio-Planung Dezember"]);
    ws.addRow([]);
    ws.addRow(["Datum", "Kunde", "Veranstaltung", "Ort", "PLZ", "Zeit", "Anzahl MA", "Tätigkeit"]);
    ws.addRow([new Date(Date.UTC(2040, 11, 1)), KUNDE, `Aufbau ${RUN}`, "Stuttgart", 70372, "07:00-15:00", 6, "Auf- und Abbau"]);
    ws.addRow([new Date(Date.UTC(2040, 11, 2)), KUNDE, `Aufbau ${RUN}`, "Stuttgart", 70372, "07:00-15:00", 4, "Gabelstapler"]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const page = await neuerAdmin(browser);
    await page.goto("/admin/import");
    await page.getByRole("tab", { name: /Aufträge/ }).click();
    await page.getByTestId("import-datei").setInputFiles({ name: "planung.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
    const vorschau = page.getByTestId("import-vorschau");
    await expect(vorschau).toContainText(`Aufbau ${RUN}`);
    await expect(vorschau).toContainText("2 (2 neu)");
    await page.getByTestId("import-uebernehmen").click();
    await expect(page.getByTestId("import-fertig")).toContainText("1 Aufträge neu angelegt");
    await gespeichert(page);

    // In der Disposition als Entwurf, für die Crew unsichtbar
    await page.goto("/admin/dispo");
    await expect(page.getByTestId("dispo-liste")).toContainText(`Aufbau ${RUN}`);
    const crewJobs = await (await (crewCtx as BrowserContext).request.get("/api/neu/crew/state")).json();
    expect(JSON.stringify(crewJobs.jobs)).not.toContain(`Aufbau ${RUN}`);

    // Dieselbe Datei noch einmal: unverändert, nichts doppelt
    await page.goto("/admin/import");
    await page.getByRole("tab", { name: /Aufträge/ }).click();
    await page.getByTestId("import-datei").setInputFiles({ name: "planung.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
    await expect(page.getByTestId("import-uebernehmen")).toBeDisabled();
    await expect(page.getByTestId("import-vorschau")).toContainText("unverändert");
    await page.close();
  });

  test("CSV mit Umlauten in Windows-Kodierung wird gelesen; falsche Dateien werden abgelehnt", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    const csvText = "Personalnummer;Nachname;Vorname;Beschäftigungsart\r\n" + `Y${RUN.toUpperCase()};Müller-${RUN};Jörg;Teilzeit\r\n`;
    // Windows-1252 (nicht UTF-8): ä=E4 ö=F6 ü=FC, jedes Zeichen ein Byte
    const bytes = Buffer.from(csvText, "latin1");
    await page.goto("/admin/import");
    await page.getByTestId("import-datei").setInputFiles({ name: "stamm.csv", mimeType: "text/csv", buffer: bytes });
    await expect(page.getByTestId("import-vorschau")).toContainText(`Jörg Müller-${RUN}`);
    await expect(page.getByTestId("import-vorschau")).toContainText("TZ, unbefristet");
    await page.getByRole("button", { name: "Andere Datei" }).click();
    await page.getByTestId("import-datei").setInputFiles({ name: "schlecht.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 nichts") });
    await expect(page.locator(".pv-error")).toContainText("PDF");
    const r = await page.request.post("/api/neu/import/parse", { multipart: { datei: { name: "leer.csv", mimeType: "text/csv", buffer: Buffer.from("") } } });
    expect(r.status()).toBe(400);
    await page.close();
  });

  test("Ohne Anmeldung gibt es keinen Import", async ({ request }) => {
    expect((await request.post("/api/neu/import/parse", { multipart: { datei: { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("a;b\n1;2") } } })).status()).toBe(401);
  });
});

test.describe("Neues System: Nachrichten mit persönlichem Link", () => {
  test("Vorgefertigte Nachricht je Person, Link funktioniert, WhatsApp-Link, als gesendet markieren", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/nachrichten");
    await page.getByRole("button", { name: "Alle (ohne Ausgeschiedene)" }).click();
    await page.getByLabel("Suche").fill(`Crew-${RUN}`);
    await page.getByTestId("empfaenger").getByLabel(`Eingeladen Crew-${RUN}`).check();
    await page.getByLabel("Vorlage", { exact: true }).selectOption({ label: "Aufträge freigeschaltet" });
    await page.getByTestId("links-erzeugen").click();
    const liste = page.getByTestId("nachrichten-liste");
    await expect(liste).toContainText("Hallo Eingeladen");
    const text = await liste.innerText();
    const m = /(https?:\/\/\S+\/crew\/start\/[\w-]+)/.exec(text);
    expect(m, text).toBeTruthy();
    // WhatsApp öffnet mit vorgeschriebenem Text; abgeschickt wird nichts
    const href = await liste.locator("a", { hasText: "In WhatsApp öffnen" }).getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/4915112345678\?text=/);
    expect(decodeURIComponent(href as string)).toContain("/crew/start/");
    // Der Link gehört genau dieser Person
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(new URL((m as RegExpExecArray)[1]).pathname);
    await p2.waitForURL(/\/crew$/);
    await expect(p2.getByRole("heading", { name: "Hallo Eingeladen" })).toBeVisible();
    await ctx.close();
    await liste.getByRole("button", { name: "Als gesendet markieren" }).click();
    await gespeichert(page);
    await page.reload();
    await page.getByRole("button", { name: "Alle (ohne Ausgeschiedene)" }).click();
    await page.getByLabel("Suche").fill(`Crew-${RUN}`);
    await expect(page.getByTestId("empfaenger")).toContainText("Aufträge freigeschaltet");
    await page.close();
  });
});

test.describe("Neues System: Schulungs-Pflicht und Videos einstellen", () => {
  test("Mitgelieferte Videos, fremdes Video mit Bestätigung, Video entfernen, Kundenregel – danach alles zurück", async ({ browser }) => {
    const admin = await neuerAdmin(browser);
    await admin.goto("/admin/unterweisungen");
    await admin.getByRole("tab", { name: "Pflicht & Videos" }).click();
    // Alle acht mitgelieferten Videos sind schon eingetragen und Pflicht
    for (const m of ["grund", "stagehand", "catering", "stapler", "hoehe", "elektrik", "einlass", "brandschutz"]) {
      await expect(admin.getByTestId(`video-${m}`)).toContainText("Mitgeliefertes Video");
      await expect(admin.getByLabel(`Video-Adresse ${m}`, { exact: true })).toHaveValue(`/api/neu/crew/video/${m}.de.mp4`);
      await expect(admin.getByLabel(`Video Pflicht ${m}`)).toBeChecked();
      await expect(admin.getByLabel(`Video-Adresse Englisch ${m}`, { exact: true })).toHaveValue(`/api/neu/crew/video/${m}.en.mp4`);
    }
    // Für die Grundunterweisung stattdessen ein YouTube-Video (der Player kann dort nicht prüfen, die Person bestätigt)
    await admin.getByLabel("Video-Adresse grund", { exact: true }).fill("https://youtu.be/abcDEF12345");
    await expect(admin.getByTestId("video-grund")).toContainText("YouTube/Vimeo erkannt");
    await expect(admin.getByTestId("video-standard-grund")).toBeVisible();
    // Eine unsichere Adresse wird abgelehnt, „Video entfernen“ lässt das Modul ohne Video
    await admin.getByLabel("Video-Adresse brandschutz", { exact: true }).fill("http://unsicher.example/video");
    await expect(admin.getByTestId("video-brandschutz")).toContainText("Adresse ungültig");
    await admin.getByTestId("video-entfernen-brandschutz").click();
    await expect(admin.getByTestId("video-brandschutz")).toContainText("Kein Video");
    // Kundenregel: Testkunde braucht zusätzlich „Einlass“
    await admin.getByTestId("kundenregel-neu").click();
    await admin.getByLabel("Kunde 1").fill("Testkunde GmbH");
    await admin.getByRole("button", { name: "einlass", exact: true }).click();
    await gespeichert(admin);

    const crew = await (crewCtx as BrowserContext).newPage();
    // Kein echter Abruf bei YouTube im Test
    await crew.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Video</title>" }));
    await crew.goto("/crew/unterweisung/grund");
    await expect(crew.getByTestId("video").locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcDEF12345");
    // Ohne „Video angesehen“ geht es nicht weiter
    await expect(crew.getByTestId("video-weiter")).toBeDisabled();
    await crew.getByTestId("video-gesehen").check();
    await expect(crew.getByTestId("video-weiter")).toBeEnabled();
    await crew.getByTestId("video-weiter").click();
    await expect(crew.getByTestId("karte")).toBeVisible();
    // Ohne Video geht es gleich mit den Lernkarten los
    await crew.goto("/crew/unterweisung/brandschutz");
    await expect(crew.getByTestId("karte")).toBeVisible();
    await expect(crew.getByTestId("video-weiter")).toHaveCount(0);
    // Die Kundenregel zeigt sich am Auftrag des Testkunden
    await crew.goto("/crew/jobs");
    await crew.getByTestId("crew-job").filter({ hasText: AUFTRAG }).click();
    await expect(crew.locator(".pv-chip", { hasText: "Einlass" })).toBeVisible();
    await crew.close();

    // Aufräumen: mitgelieferte Videos wiederherstellen
    await admin.getByLabel("Kunde 1").fill("");
    await admin.getByRole("button", { name: "Regel entfernen" }).click();
    await admin.getByTestId("video-standard-grund").click();
    await admin.getByTestId("video-standard-brandschutz").click();
    await gespeichert(admin);
    await admin.reload();
    await admin.getByRole("tab", { name: "Pflicht & Videos" }).click();
    await expect(admin.getByTestId("video-grund")).toContainText("Mitgeliefertes Video");
    await expect(admin.getByTestId("video-brandschutz")).toContainText("Mitgeliefertes Video");
    await expect(admin.getByLabel("Video Pflicht brandschutz")).toBeChecked();
    await expect(admin.getByLabel("Kunde 1")).toHaveCount(0);
    await admin.close();
  });
});

// Unterweisung am Handy: Video (mit Mindestdauer geprüft), Unterschrift, Nachweis-PDF
test.describe("Neues System: Unterweisung mit Video und Unterschrift", () => {
  const MODUL = "stapler";
  let nachweisId = "";
  const aktion = (daten: Record<string, unknown>) => (crewCtx as BrowserContext).request.post("/api/neu/crew/aktion", { data: daten });
  const ergebnis = { typ: "unterweisung", modul: MODUL, richtig: 5, gesamt: 5 };

  test("Die Videodateien liegen hinter der Anmeldung und lassen sich in Teilen laden", async ({ browser, request }) => {
    const url = "/api/neu/crew/video/grund.de.mp4";
    expect((await request.get(url)).status()).toBe(401);
    expect((await request.get("/api/neu/crew/video/grund.de.jpg")).status()).toBe(401);
    // Auch der rohe Ordner ist nicht öffentlich
    const roh = await request.get("/videos/grund.de.mp4", { maxRedirects: 0 });
    expect(roh.status()).not.toBe(200);

    const crew = (crewCtx as BrowserContext).request;
    const voll = await crew.get(url);
    expect(voll.status()).toBe(200);
    expect(voll.headers()["content-type"]).toBe("video/mp4");
    expect(voll.headers()["accept-ranges"]).toBe("bytes");
    expect(voll.headers()["x-content-type-options"]).toBe("nosniff");
    const groesse = (await voll.body()).length;
    expect(groesse).toBeGreaterThan(1_000_000);
    // Handys laden Videos stückweise
    const teil = await crew.get(url, { headers: { Range: "bytes=0-99" } });
    expect(teil.status()).toBe(206);
    expect(teil.headers()["content-range"]).toBe(`bytes 0-99/${groesse}`);
    expect((await teil.body()).length).toBe(100);
    const rest = await crew.get(url, { headers: { Range: `bytes=${groesse - 10}-` } });
    expect(rest.status()).toBe(206);
    expect((await rest.body()).length).toBe(10);
    expect((await crew.get(url, { headers: { Range: `bytes=${groesse + 5}-` } })).status()).toBe(416);
    const poster = await crew.get("/api/neu/crew/video/grund.de.jpg");
    expect(poster.status()).toBe(200);
    expect(poster.headers()["content-type"]).toBe("image/jpeg");
    // Die englischen Fassungen liegen ebenfalls bereit – für alle acht Module, mit Vorschaubild
    for (const m of ["grund", "stagehand", "catering", "stapler", "hoehe", "elektrik", "einlass", "brandschutz"]) {
      const en = await crew.get(`/api/neu/crew/video/${m}.en.mp4`, { headers: { Range: "bytes=0-3" } });
      expect(en.status(), m).toBe(206);
      expect(en.headers()["content-type"]).toBe("video/mp4");
      expect((await crew.get(`/api/neu/crew/video/${m}.en.jpg`)).status(), m).toBe(200);
    }
    // Nur Dateinamen aus dem Ordner, keine Pfade
    for (const schlecht of ["gibtesnicht.de.mp4", "GRUND.de.mp4", "..%2Fpackage.json", "%2e%2e%2f%2e%2e%2fpackage.json", "grund.de.mp4%00.jpg", "grund.exe"]) {
      expect((await crew.get(`/api/neu/crew/video/${schlecht}`)).status(), schlecht).toBe(404);
    }
    // Angemeldete Administration darf die Videos ebenfalls laden (Vorschau im Dashboard)
    const admin = await neuerAdmin(browser);
    expect((await admin.request.get(url, { headers: { Range: "bytes=0-9" } })).status()).toBe(206);
    await admin.close();
  });

  test("Der Server verlangt Video, Mindestdauer und Unterschrift", async () => {
    const gut = unterschriftDataUrl();
    // Video ist Pflicht, aber nicht angesehen
    let r = await aktion({ ...ergebnis, unterschrift: gut, video: "keins" });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toContain("Video");
    // „Abgespielt“ behauptet, aber nie gestartet
    r = await aktion({ ...ergebnis, unterschrift: gut, video: "player" });
    expect(r.status()).toBe(409);
    // Gerade erst gestartet: die Mindestdauer ist noch nicht um
    expect((await aktion({ typ: "unterweisung-start", modul: MODUL })).status()).toBe(200);
    r = await aktion({ ...ergebnis, unterschrift: gut, video: "player" });
    expect(r.status()).toBe(409);
    // Unbekanntes Modul, falsches Ergebnis
    expect((await aktion({ typ: "unterweisung-start", modul: "gibtesnicht" })).status()).toBe(400);
    expect((await aktion({ ...ergebnis, modul: "gibtesnicht", unterschrift: gut, video: "manuell" })).status()).toBe(400);
    expect((await aktion({ ...ergebnis, richtig: 1, unterschrift: gut, video: "manuell" })).status()).toBe(400);
    // Ohne gültige Unterschrift wird nichts abgeschlossen (auch mit bestätigtem Video)
    for (const schlecht of ["", "data:image/png;base64,AAAA", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "kein bild", `data:image/png;base64,${Buffer.from("x".repeat(3000)).toString("base64")}`]) {
      r = await aktion({ ...ergebnis, unterschrift: schlecht, video: "manuell" });
      expect(r.status(), schlecht.slice(0, 30)).toBe(400);
    }
    // Das Bild selbst wird nie im Profil abgelegt: der Client-Zustand kennt keine Unterschrift
    const st = await (await (crewCtx as BrowserContext).request.get("/api/neu/crew/state")).json();
    expect(JSON.stringify(st)).not.toContain("data:image/png");
    expect(st.self.unterweisungen[MODUL]).toBeUndefined();
  });

  test("Nach der Mindestdauer geht es durch: Nachweis-PDF mit Unterschrift für die Person und die Administration", async ({ browser, request }) => {
    // Die Uhr läuft seit dem Start im vorigen Test; zur Sicherheit etwas warten (Testserver: 3 % der Videolänge ≈ 2,2 s)
    await new Promise((res) => setTimeout(res, 2500));
    const r = await aktion({ ...ergebnis, unterschrift: unterschriftDataUrl(), video: "player" });
    expect(r.status(), await r.text()).toBe(200);

    const crew = (crewCtx as BrowserContext).request;
    const st = await (await crew.get("/api/neu/crew/state")).json();
    const ack = st.self.unterweisungen[MODUL];
    expect(ack).toMatchObject({ video: "player", quizScore: 1 });
    expect(ack.unterschriftAm).toBeTruthy();
    expect(ack.nachweisId).toBeTruthy();
    expect(JSON.stringify(st)).not.toContain("data:image/png");
    nachweisId = ack.nachweisId;

    const pdf = await crew.get(`/api/neu/crew/nachweis/${MODUL}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(8_000);
    // Für ein Modul ohne Abschluss gibt es kein Nachweis-PDF; ohne Anmeldung auch nicht
    expect((await crew.get("/api/neu/crew/nachweis/einlass")).status()).toBe(404);
    expect((await request.get(`/api/neu/crew/nachweis/${MODUL}`)).status()).toBe(401);
    expect((await request.get(`/api/neu/files/${nachweisId}`, { maxRedirects: 0 })).status()).not.toBe(200);

    // Die Administration lädt dasselbe PDF
    const admin = await neuerAdmin(browser);
    const adm = await admin.request.get(`/api/neu/files/${nachweisId}`);
    expect(adm.status()).toBe(200);
    expect(adm.headers()["content-type"]).toBe("application/pdf");
    expect(createHash("sha256").update(await adm.body()).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
    await admin.close();
  });

  test("Im Dashboard stehen Video, Unterschrift und Nachweis bei der Person", async ({ browser }) => {
    const admin = await neuerAdmin(browser);
    // Die eingeladene Person steht (noch) nicht in der Crew-Liste, sondern bei den Bewerbern: direkt zum Profil
    const alle = await (await admin.request.get("/api/neu/state")).json();
    const person = alle.records.crew.find((c: { data: { nachname: string } }) => c.data.nachname.includes(`Crew-${RUN}`));
    expect(person).toBeTruthy();
    await admin.goto(`/admin/crew/${person.id}`);
    await admin.getByRole("tab", { name: "Unterweisungen" }).click();
    await expect(admin.getByTestId(`uw-video-${MODUL}`)).toHaveText("abgespielt");
    await expect(admin.getByTestId(`uw-unterschrift-${MODUL}`)).toContainText("✓");
    await expect(admin.getByTestId(`uw-nachweis-${MODUL}`)).toHaveAttribute("href", `/api/neu/files/${nachweisId}`);
    // Das Modul ohne Abschluss hat nichts
    await expect(admin.getByTestId("uw-unterschrift-einlass")).toHaveText("–");
    await admin.close();
  });

  test("Am Handy: das Video lässt sich nicht überspringen, die Unterschrift ist Pflicht, am Ende liegt der Nachweis bereit", async () => {
    const page = await (crewCtx as BrowserContext).newPage();
    // Kein „Entwurf“-/Freigabe-Hinweis in den Unterweisungen (Liste und Modul)
    await page.goto("/crew/unterweisung");
    await expect(page.getByTestId("modul-einlass")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Entwurf|Fachkraft/);
    await page.goto("/crew/unterweisung/einlass");
    await expect(page.getByTestId("video-player")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Entwurf|Fachkraft/);
    // Vorher kein Weiterklicken
    await expect(page.getByTestId("video-weiter")).toBeDisabled();
    await expect(page.getByTestId("karte")).toHaveCount(0);
    // Der Player hat keine eigenen Bedienelemente zum Vorspulen
    await expect(page.getByTestId("video-player").locator("video")).not.toHaveAttribute("controls", /.*/);
    await unterweisungDurcharbeiten(page);
    await expect(page.getByTestId("uw-fertig")).toBeVisible();
    const link = page.getByTestId("nachweis-pdf");
    await expect(link).toHaveAttribute("href", "/api/neu/crew/nachweis/einlass");
    const pdf = await page.request.get("/api/neu/crew/nachweis/einlass");
    expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    await page.close();
  });

  test("Bei englischer Oberfläche läuft die englische Fassung, bei deutscher die deutsche", async () => {
    const page = await (crewCtx as BrowserContext).newPage();
    await page.goto("/crew/unterweisung/hoehe");
    const video = page.getByTestId("video-player").locator("video");
    await expect(video).toHaveAttribute("src", "/api/neu/crew/video/hoehe.de.mp4");
    await expect(video).toHaveAttribute("poster", "/api/neu/crew/video/hoehe.de.jpg");
    await page.locator(".pv-seg button", { hasText: "EN" }).first().click();
    await expect(video).toHaveAttribute("src", "/api/neu/crew/video/hoehe.en.mp4");
    await expect(video).toHaveAttribute("poster", "/api/neu/crew/video/hoehe.en.jpg");
    await expect(page.getByTestId("video-weiter")).toContainText("Continue");
    await page.locator(".pv-seg button", { hasText: "DE" }).first().click();
    await expect(video).toHaveAttribute("src", "/api/neu/crew/video/hoehe.de.mp4");
    await page.close();
  });
});

test.describe("Neues System: Benutzer und Rollen", () => {
  const MEMBER_EMAIL = `rolle-${RUN}@fess.jobs`;
  const MEMBER_NAME = `Rolle ${RUN}`;
  const MEMBER_PASSWORD = "rolle-test-2026!";

  async function loginAls(page: Page, email: string, passwort: string) {
    await page.goto("/login");
    await page.getByLabel(/E-Mail/i).fill(email);
    await page.getByLabel(/Passwort/i).fill(passwort);
    await page.getByRole("button", { name: /anmelden/i }).click();
    await page.waitForURL(/\/(dashboard|einsaetze)/);
  }

  test("Ein Mitglied ohne Rolle kommt nicht hinein; mit Rolle „Disposition“ nur in die Bereiche der Rolle", async ({ browser }) => {
    const admin = await neuerAdmin(browser);
    await admin.goto("/einstellungen/nutzer/neu");
    await admin.getByLabel(/^Name/i).fill(MEMBER_NAME);
    await admin.getByLabel(/E-Mail/i).fill(MEMBER_EMAIL);
    await admin.getByLabel(/Passwort/i).fill(MEMBER_PASSWORD);
    await admin.getByLabel(/Rolle/i).selectOption("MEMBER");
    await admin.getByRole("button", { name: /speichern|anlegen/i }).first().click();
    await expect(admin.getByText(MEMBER_EMAIL)).toBeVisible();

    const ctx = await browser.newContext();
    const m = await ctx.newPage();
    await loginAls(m, MEMBER_EMAIL, MEMBER_PASSWORD);
    expect((await ctx.request.get("/api/neu/state")).status()).toBe(403);
    const seite = await m.goto("/admin");
    expect(seite?.status()).toBe(404);

    // Admin vergibt die Rolle „Disposition“
    await admin.goto("/admin/benutzer");
    await expect(admin.getByTestId("benutzer-tabelle")).toContainText(MEMBER_EMAIL);
    await admin.getByLabel(`Rolle für ${MEMBER_NAME}`).selectOption("dispo");
    await expect(admin.locator(".pv-toast")).toContainText("Rolle gespeichert");

    const st = await ctx.request.get("/api/neu/state");
    expect(st.status()).toBe(200);
    expect((await st.json()).rolle).toBe("dispo");
    await m.goto("/admin");
    await expect(m.getByRole("heading", { name: "Übersicht" })).toBeVisible();
    const nav = m.locator(".pva-side");
    await expect(nav.getByRole("link", { name: "Disposition" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Freigaben" })).toBeVisible();
    for (const nein of ["Stundentabelle", "Unterlagen", "Benutzer", "Schnittstelle", "Einstellungen"]) await expect(nav.getByRole("link", { name: nein })).toHaveCount(0);
    await m.goto("/admin/stunden");
    await expect(m.locator(".pv-note.warn")).toContainText("nicht freigegeben");

    // Der Server zieht die Grenzen selbst, nicht nur das Menü
    const stunde = { kind: "stunde", id: `x-${RUN}`, data: { id: `x-${RUN}`, datum: "2040-01-01", pnr: "1", start: "08:00", pausen: [], ende: "16:00", pauschale: 0, kunde: "", auftrag: "", spesen: 0, reiseKm: 0, reiseGesch: 0, bonus: 0, abzug: 0, bemerkung: "", status: "offen", quelle: "manuell", sourceRef: null } };
    expect((await ctx.request.post("/api/neu/sync", { data: { ops: [stunde] } })).status()).toBe(403);
    expect((await ctx.request.post("/api/neu/sync", { data: { ops: [{ kind: "einst", id: "main", data: {} }] } })).status()).toBe(403);
    expect((await ctx.request.get("/api/neu/benutzer")).status()).toBe(403);
    expect((await ctx.request.get("/api/neu/schnittstelle/status")).status()).toBe(403);
    expect((await ctx.request.get("/api/neu/sicherung?monat=2026-09&bereiche=export")).status()).toBe(403);
    expect((await ctx.request.get("/api/neu/sicherung/vorschau?monat=2026-09&bereiche=export")).status()).toBe(403);
    const anderer = await ctx.request.post("/api/neu/seed", { data: { ops: [] } });
    expect(anderer.status()).toBe(403);

    // Die Disposition darf keine Verträge ändern: Vertrag bleibt, auch wenn der Browser etwas anderes schickt
    const alle = await (await ctx.request.get("/api/neu/state")).json();
    const person = alle.records.crew.find((c: { data: { pnr: string } }) => c.data.pnr === `Z${RUN.toUpperCase()}1`);
    expect(person).toBeTruthy();
    const manipuliert = { ...person.data, contract: { ...person.data.contract, stundenlohn: 99 } };
    expect((await ctx.request.post("/api/neu/sync", { data: { ops: [{ kind: "crew", id: person.id, data: manipuliert, rev: person.rev }] } })).status()).toBe(200);
    const danach = await (await admin.request.get("/api/neu/state")).json();
    expect(danach.records.crew.find((c: { id: string }) => c.id === person.id).data.contract.stundenlohn).toBe(13.9);

    // Zugang wieder entziehen
    await admin.getByLabel(`Rolle für ${MEMBER_NAME}`).selectOption("keine");
    await expect(admin.locator(".pv-toast")).toContainText("Rolle gespeichert");
    expect((await ctx.request.get("/api/neu/state")).status()).toBe(403);
    await ctx.close();
    await admin.close();
  });
});

test.describe("Neues System: Schnittstelle ist vorbereitet, aber aus", () => {
  test("Zustand AUS, keine Daten über die Adressen, Vorschau nur im Browser", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin/schnittstelle");
    await expect(page.getByTestId("schnittstelle-status")).toContainText("AUS – es fließen keine Daten");
    await expect(page.getByTestId("status-umgebung")).toHaveText("aus");
    // Selbst mit angemeldetem Admin liefern die Adressen nichts
    expect((await page.request.get("/api/neu/schnittstelle/auftraege")).status()).toBe(404);
    expect((await page.request.post("/api/neu/schnittstelle/stunden", { data: {} })).status()).toBe(404);
    await page.getByRole("tab", { name: /Aufträge → bisheriges System/ }).click();
    await expect(page.getByTestId("feed-vorschau")).toContainText('"version": 1');
    // Angaben für später lassen sich vormerken – ohne Wirkung
    await page.getByRole("tab", { name: "Einrichtung vorbereiten" }).click();
    await page.getByTestId("schalter-vormerken").check();
    await gespeichert(page);
    await expect(page.getByTestId("schnittstelle-status")).toContainText("AUS – es fließen keine Daten");
    expect((await page.request.get("/api/neu/schnittstelle/auftraege")).status()).toBe(404);
    await page.getByTestId("schalter-vormerken").uncheck();
    await gespeichert(page);
    await page.close();
  });

  test("Ohne Anmeldung nicht erreichbar", async ({ request }) => {
    for (const url of ["/api/neu/schnittstelle/auftraege", "/api/neu/schnittstelle/status"]) expect((await request.get(url)).status(), url).toBe(401);
    expect((await request.post("/api/neu/schnittstelle/stunden", { data: {} })).status()).toBe(401);
    expect((await request.get("/api/neu/benutzer")).status()).toBe(401);
  });
});

test.describe("Neues System: Beleg-Link", () => {
  test("Link erzeugen, Beleg mit Foto einreichen, im Archiv öffnen", async ({ browser }) => {
    const admin = await neuerAdmin(browser);
    await admin.goto("/admin/dispo");
    await admin.getByTestId("dispo-liste").getByRole("link", { name: AUFTRAG }).click();
    await admin.getByRole("button", { name: "Beleg-Link erzeugen" }).click();
    await admin.getByTestId("beleg-link-erzeugen").click();
    belegLink = (await admin.getByTestId("beleg-link").innerText()).trim();
    expect(belegLink).toMatch(/\/b\/[\w-]{20,}$/);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(new URL(belegLink).pathname);
    await expect(page.getByRole("heading", { name: AUFTRAG })).toBeVisible();
    await page.getByTestId("beleg-senden").click();
    await expect(page.locator(".pv-error")).toContainText("Foto oder eine PDF");
    // Ausführbares wird abgelehnt
    await page.getByLabel("Beleg-Datei").setInputFiles({ name: "beleg.jpg", mimeType: "image/jpeg", buffer: Buffer.from("MZ\x90\x00 das ist ein Programm, kein Bild") });
    await page.getByLabel("Betrag").fill("12,50");
    await page.getByLabel("Personalnummer").fill(PNR);
    await page.getByTestId("beleg-senden").click();
    await expect(page.locator(".pv-error")).toContainText("Dateiformat");
    // Unbekannte Personalnummer
    await page.getByLabel("Beleg-Datei").setInputFiles({ name: "beleg.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Personalnummer").fill("GIBTSNICHT");
    await page.getByTestId("beleg-senden").click();
    await expect(page.locator(".pv-error")).toContainText("Personalnummer");
    // Richtig
    await page.getByLabel("Personalnummer").fill(PNR);
    await page.getByTestId("beleg-senden").click();
    await expect(page.getByRole("heading", { name: "✓ Eingereicht" })).toBeVisible();
    await ctx.close();

    await admin.goto("/admin/unterlagen");
    const zeile = admin.getByTestId("unterlagen-tabelle").locator("tr", { hasText: "Tankbeleg" }).first();
    await expect(zeile).toContainText(NACHNAME.slice(0, 0) + "Neuer");
    const href = await zeile.getByRole("link", { name: "Öffnen" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/neu\/files\//);
    const datei = await admin.request.get(href as string);
    expect(datei.status()).toBe(200);
    expect(datei.headers()["content-type"]).toBe("image/png");
    expect((await datei.body()).equals(PNG)).toBe(true);
    await admin.close();
  });

  test("Ein anderer Link und eine fremde Datei-ID liefern nichts", async ({ request }) => {
    expect((await request.get("/api/neu/b/falsch")).status()).toBe(404);
    expect((await request.post("/api/neu/b/falsch", { multipart: { art: "Tanken" } })).status()).toBe(404);
  });
});

test.describe("Neues System: Sicherung pro Monat", () => {
  // Letzter voller Monat (die Seite bietet ihn zuerst an)
  const jetzt = new Date();
  const MONAT = jetzt.getUTCMonth() === 0 ? `${jetzt.getUTCFullYear() - 1}-12` : `${jetzt.getUTCFullYear()}-${String(jetzt.getUTCMonth()).padStart(2, "0")}`;
  const ANDERER_MONAT = MONAT === "2026-01" ? "2025-12" : `${MONAT.slice(0, 4)}-${String(Number(MONAT.slice(5)) - 1 || 12).padStart(2, "0")}`;
  const tag = (monat: string, d: number) => new Date(`${monat}-${String(d).padStart(2, "0")}T10:00:00Z`);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? /DATABASE_URL="?([^"\n]+)"?/.exec(readFileSync(".env", "utf8"))?.[1] });
  const sha = (t: string) => createHash("sha256").update(t).digest("hex");
  const dok = (category: string, name: string, monat: string, inhalt: string) =>
    db.document.create({ data: { organizationId: ORG.id, category, filename: name, mimeType: "application/pdf", bytes: Buffer.from(inhalt), size: inhalt.length, sha256: sha(inhalt), links: { create: [{ datum: new Date(`${monat}-10T00:00:00Z`) }] } } });
  const ORG = { id: "", adminId: "", zweiterAdminId: "" };
  const belegErstellen = (userId: string, art: "AUSLAGE" | "FIRMENZAHLUNG", haendler: string, dateien: Array<{ kind: "PDF" | "ORIGINAL"; name: string; inhalt: string }>) =>
    db.receipt.create({
      data: {
        organizationId: ORG.id, userId, kind: art, status: "ABGELEGT", vendor: haendler, grossAmount: "12.50", receiptDate: tag(MONAT, 12),
        files: { create: dateien.map((d) => ({ kind: d.kind, filename: d.name, mimeType: d.kind === "PDF" ? "application/pdf" : "image/jpeg", bytes: Buffer.from(d.inhalt), size: d.inhalt.length })) },
      },
    });

  test.beforeAll(async () => {
    const admin = await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    ORG.id = admin.organizationId;
    ORG.adminId = admin.id;
    const zweiter = await db.user.create({ data: { organizationId: ORG.id, email: `admin2-${RUN}@fess.jobs`, passwordHash: "x", name: `Zweiter Admin ${RUN}`, role: "ADMIN" } });
    ORG.zweiterAdminId = zweiter.id;
    await dok("konkretisierung", `Konkretisierung_${RUN}.pdf`, MONAT, `%PDF-1.4 konkretisierung ${RUN}`);
    await dok("stundennachweis", `Stundennachweis_${RUN}.pdf`, MONAT, `%PDF-1.4 stundennachweis ${RUN}`);
    await dok("stundennachweis", `Stundennachweis_ANDERER_MONAT_${RUN}.pdf`, ANDERER_MONAT, `%PDF-1.4 anderer monat ${RUN}`);
    await dok("export", `Export_${RUN}.csv`, MONAT, `a;b;c ${RUN}`);
    await belegErstellen(ORG.adminId, "AUSLAGE", `Tankstelle-${RUN}`, [{ kind: "PDF", name: `AUSLAGE_${RUN}.pdf`, inhalt: `%PDF-1.4 auslage ${RUN}` }, { kind: "ORIGINAL", name: `foto_${RUN}.jpg`, inhalt: `JPEGDATEN ${RUN}` }]);
    await belegErstellen(ORG.adminId, "FIRMENZAHLUNG", `Baumarkt-${RUN}`, [{ kind: "PDF", name: `FIRMA_${RUN}.pdf`, inhalt: `%PDF-1.4 firma ${RUN}` }]);
    // Beleg eines anderen Administrators: darf in meiner Sicherung nicht auftauchen
    await belegErstellen(ORG.zweiterAdminId, "AUSLAGE", `Geheim-${RUN}`, [{ kind: "PDF", name: `FREMD_${RUN}.pdf`, inhalt: `%PDF-1.4 fremd ${RUN}` }]);
  });

  test.afterAll(async () => {
    await db.document.deleteMany({ where: { filename: { contains: RUN } } });
    await db.receipt.deleteMany({ where: { userId: { in: [ORG.adminId, ORG.zweiterAdminId] }, vendor: { contains: RUN } } });
    await db.user.deleteMany({ where: { id: ORG.zweiterAdminId } });
    await db.$disconnect();
  });

  const zipVon = async (page: Page, query: string) => {
    const r = await page.request.get(`/api/neu/sicherung?${query}`);
    expect(r.status(), await r.text().catch(() => "")).toBe(200);
    expect(r.headers()["content-type"]).toBe("application/zip");
    return JSZip.loadAsync(await r.body());
  };

  test("Nur die gewählten Bereiche des Monats kommen in die ZIP – mit Inhaltsverzeichnis und Prüfsummen", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    const zip = await zipVon(page, `monat=${MONAT}&bereiche=stundennachweis,konkretisierung`);
    const namen = Object.keys(zip.files);
    expect(namen).toContain(`Stundennachweise/Stundennachweis_${RUN}.pdf`);
    expect(namen).toContain(`Konkretisierungen/Konkretisierung_${RUN}.pdf`);
    // ausgewählt ist nur das, was angehakt war
    expect(namen.some((n) => n.includes(`Export_${RUN}`))).toBe(false);
    expect(namen.some((n) => n.startsWith("Auslagen/") || n.startsWith("Firmenbelege/"))).toBe(false);
    // andere Monate bleiben draußen
    expect(namen.some((n) => n.includes("ANDERER_MONAT"))).toBe(false);
    // Der Inhalt ist unverändert, das Verzeichnis nennt den Fingerabdruck
    expect(await zip.file(`Stundennachweise/Stundennachweis_${RUN}.pdf`)?.async("string")).toBe(`%PDF-1.4 stundennachweis ${RUN}`);
    const inhalt = (await zip.file("Inhalt.csv")?.async("string")) ?? "";
    expect(inhalt).toContain(sha(`%PDF-1.4 stundennachweis ${RUN}`));
    expect(inhalt).toContain("SHA-256");
    const liesmich = (await zip.file("LIESMICH.txt")?.async("string")) ?? "";
    expect(liesmich).toContain("KEINE vollständige Datenbanksicherung");
    await page.close();
  });

  test("Auslagen und Firmenbelege getrennt wählbar; Belege anderer Administratoren fehlen; Original-Fotos nur auf Wunsch", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    const nurAuslagen = await zipVon(page, `monat=${MONAT}&bereiche=auslagen`);
    const n1 = Object.keys(nurAuslagen.files);
    expect(n1.some((n) => n.startsWith("Auslagen/") && n.endsWith(`AUSLAGE_${RUN}.pdf`))).toBe(true);
    expect(n1.some((n) => n.includes(`FIRMA_${RUN}`))).toBe(false);
    expect(n1.some((n) => n.includes(`FREMD_${RUN}`))).toBe(false);
    expect(n1.some((n) => n.includes(`foto_${RUN}`))).toBe(false);
    const uebersicht = (await nurAuslagen.file(`Belege-Übersicht_${MONAT}.csv`)?.async("string")) ?? "";
    expect(uebersicht).toContain(`Tankstelle-${RUN}`);
    expect(uebersicht).not.toContain(`Geheim-${RUN}`);
    expect(uebersicht).not.toContain(`Baumarkt-${RUN}`);

    const alles = await zipVon(page, `monat=${MONAT}&bereiche=auslagen,firmenbelege&originale=1`);
    const n2 = Object.keys(alles.files);
    expect(n2.some((n) => n.startsWith("Firmenbelege/") && n.endsWith(`FIRMA_${RUN}.pdf`))).toBe(true);
    const foto = n2.find((n) => n.includes("/originale/") && n.endsWith(`foto_${RUN}.jpg`));
    expect(foto).toBeTruthy();
    expect(await alles.file(foto as string)?.async("string")).toBe(`JPEGDATEN ${RUN}`);
    expect(n2.some((n) => n.includes(`FREMD_${RUN}`))).toBe(false);
    await page.close();
  });

  test("Exporte, Personalstamm (ohne Geburtsdatum) und neues System", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    const zip = await zipVon(page, `monat=${MONAT}&bereiche=export,personalstamm,neu-stunden,neu-gesamt`);
    const namen = Object.keys(zip.files);
    expect(namen).toContain(`Exporte/Export_${RUN}.csv`);
    const stamm = namen.find((n) => n.startsWith("Personalstamm_Stand_")) as string;
    const kopf = ((await zip.file(stamm)?.async("string")) ?? "").split("\r\n")[0];
    expect(kopf).toContain("Personalnummer");
    expect(kopf).not.toMatch(/Geburt|IBAN/i);
    expect(namen).toContain(`Neues-System/Stunden_${MONAT}.csv`);
    const gesamt = JSON.parse((await zip.file("Neues-System/Gesamtstand.json")?.async("string")) ?? "{}");
    expect(Array.isArray(gesamt.records.crew)).toBe(true);
    expect(gesamt.records.benutzer).toEqual([]);
    await page.close();
  });

  test("Unterweisungsnachweise (PDF mit Unterschrift) und Übersicht des Monats", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    // Die Nachweise aus den Tests oben sind von heute: also der laufende Monat (Berlin)
    const heuteMonat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7);
    const alle = await (await page.request.get("/api/neu/state")).json();
    const PNR_CREW: string = alle.records.crew.find((c: { data: { nachname: string } }) => c.data.nachname.includes(`Crew-${RUN}`)).data.pnr;
    const zip = await zipVon(page, `monat=${heuteMonat}&bereiche=neu-unterweisungen`);
    const namen = Object.keys(zip.files);
    const pdfs = namen.filter((n) => n.startsWith("Neues-System/Unterweisungsnachweise/"));
    expect(pdfs.some((n) => n.includes(`Unterweisung_stapler_${PNR_CREW}_`))).toBe(true);
    expect(pdfs.some((n) => n.includes(`Unterweisung_grund_${PNR_CREW}_`))).toBe(true);
    const pdf = await zip.file(pdfs.find((n) => n.includes(`Unterweisung_stapler_${PNR_CREW}_`)) as string)?.async("nodebuffer");
    expect(pdf?.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const csvText = (await zip.file(`Neues-System/Unterweisungen_${heuteMonat}.csv`)?.async("string")) ?? "";
    expect(csvText.split("\r\n")[0]).toContain("Unterschrift");
    expect(csvText).toContain(PNR_CREW);
    expect(csvText).toContain("abgespielt");
    // Nichts anderes ist dabei – der Bereich ist einzeln wählbar
    expect(namen.some((n) => n.startsWith("Neues-System/Belege") || n.includes("Gesamtstand"))).toBe(false);
    const inhalt = (await zip.file("Inhalt.csv")?.async("string")) ?? "";
    expect(inhalt).toContain("neu-unterweisungen");
    await page.close();
  });

  test("Ungültige Anfragen, ohne Anmeldung und zu große Auswahl", async ({ browser, request }) => {
    const page = await neuerAdmin(browser);
    for (const q of ["monat=2026-13&bereiche=export", "monat=2026-09&bereiche=gibtesnicht", "monat=2026-09&bereiche=", "bereiche=export", "monat=../..&bereiche=export"]) {
      expect((await page.request.get(`/api/neu/sicherung?${q}`)).status(), q).toBe(400);
      expect((await page.request.get(`/api/neu/sicherung/vorschau?${q}`)).status(), q).toBe(400);
    }
    expect((await request.get(`/api/neu/sicherung?monat=${MONAT}&bereiche=export`)).status()).toBe(401);
    expect((await request.get(`/api/neu/sicherung/vorschau?monat=${MONAT}&bereiche=export`)).status()).toBe(401);
    const v = await (await page.request.get(`/api/neu/sicherung/vorschau?monat=${MONAT}&bereiche=stundennachweis,konkretisierung`)).json();
    expect(v.zaehler.stundennachweis.dateien).toBeGreaterThanOrEqual(1);
    expect(v.zuGross).toBe(false);
    await page.close();
  });

  test("Seite: Bereiche wählen, Vorschau, Herunterladen, Verlauf und Erinnerung", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    await page.goto("/admin");
    // Erinnerung auf der Übersicht, solange für den letzten Monat nichts heruntergeladen wurde
    const vorher = await (await page.request.get("/api/neu/state")).json();
    const schonGesichert = vorher.audit.some((a: { tabelle: string; datensatz: string }) => a.tabelle === "sicherung" && a.datensatz === MONAT);
    if (!schonGesichert) await expect(page.getByText(/Sicherung für .* noch nicht heruntergeladen/)).toBeVisible();

    await page.getByRole("link", { name: "Sicherung", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sicherung" })).toBeVisible();
    await page.getByTestId("sicherung-monat").selectOption(MONAT);
    // Vorgabe: Stundenzettel, Konkretisierungen, Auslagen
    await expect(page.getByTestId("bereich-stundennachweis")).toBeChecked();
    await expect(page.getByTestId("bereich-konkretisierung")).toBeChecked();
    await expect(page.getByTestId("bereich-auslagen")).toBeChecked();
    await expect(page.getByTestId("bereich-firmenbelege")).not.toBeChecked();
    await page.getByTestId("bereich-konkretisierung").uncheck();
    await expect(page.getByTestId("sicherung-summe")).toContainText(/KB|MB/);
    await page.getByTestId("bereich-export").check();
    await page.getByTestId("originale").check();

    const download = page.waitForEvent("download");
    await page.getByTestId("sicherung-laden").click();
    const d = await download;
    expect(d.suggestedFilename()).toBe(`Sicherung_${MONAT}.zip`);
    const pfad = await d.path();
    const zip = await JSZip.loadAsync(readFileSync(pfad));
    const namen = Object.keys(zip.files);
    expect(namen).toContain(`Stundennachweise/Stundennachweis_${RUN}.pdf`);
    expect(namen).toContain(`Exporte/Export_${RUN}.csv`);
    expect(namen.some((n) => n.includes(`Konkretisierung_${RUN}`))).toBe(false);
    expect(namen.some((n) => n.includes(`foto_${RUN}`))).toBe(true);

    // Verlauf: steht danach in der Liste und im Änderungsprotokoll; Erinnerung verschwindet
    await expect(page.getByTestId("sicherung-verlauf")).toContainText("Stundennachweise / Stundenzettel", { timeout: 30_000 });
    await page.goto("/admin");
    await expect(page.getByText(/Sicherung für .* noch nicht heruntergeladen/)).toHaveCount(0);
    await page.close();
  });
});

test.describe("Neues Dashboard: Beispieldaten", () => {
  test("Laden und wieder entfernen – eigene Daten bleiben", async ({ browser }) => {
    const page = await neuerAdmin(browser);
    const zeilen = () => page.getByTestId("crew-tabelle").locator("tbody tr");
    await page.goto("/admin/crew");
    await expect(page.getByTestId("crew-tabelle")).toContainText(NACHNAME);
    const vorher = await zeilen().count();

    await page.goto("/admin/einstellungen");
    await page.getByTestId("beispiel-laden").click();
    await expect(page.locator(".pv-toast")).toContainText("Beispieldaten geladen");
    await page.goto("/admin/crew");
    await expect(page.getByTestId("crew-tabelle")).toContainText(NACHNAME);
    expect(await zeilen().count()).toBeGreaterThan(vorher + 50);

    await page.goto("/admin/einstellungen");
    await page.getByTestId("beispiel-entfernen").click();
    await page.getByTestId("beispiel-entfernen-ok").click();
    await expect(page.locator(".pv-toast")).toContainText("entfernt");
    await page.goto("/admin/crew");
    await expect(page.getByTestId("crew-tabelle")).toContainText(NACHNAME);
    await expect(zeilen()).toHaveCount(vorher);
    await page.close();
  });
});
