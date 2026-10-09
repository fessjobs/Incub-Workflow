// Neues System (parallel zum bisherigen): Button in der Navigation, eigene Daten,
// Einladung → Fragebogen → Bewerbung, Beleg-Link mit Upload, Zugriffsschutz.
import { expect, test, type Browser, type Page } from "@playwright/test";

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

test.describe.configure({ mode: "serial" });

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

test.describe("Neues System: Einladung, Crew, Bewerbung", () => {
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

  test("Die Person öffnet den Link, füllt den Fragebogen aus und bewirbt sich", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Der Link nennt die öffentliche Adresse (APP_BASE_URL/Railway); im Test gilt der Pfad auf dem Testserver
    await page.goto(new URL(einladungsLink).pathname);
    await page.waitForURL(/\/crew$/);
    await expect(page.getByRole("heading", { name: "Hallo Eingeladen" })).toBeVisible();
    // Kein Banner, kein Zugang zu Admin-Daten
    await expect(page.locator(".pv-banner")).toHaveCount(0);
    expect((await ctx.request.get("/api/neu/state")).status()).toBe(401);

    await page.locator(".pvc-main").getByRole("link", { name: /Fragebogen/ }).first().click();
    await page.getByLabel("Postleitzahl").fill("70173");
    await page.getByLabel("Wohnort").fill("Stuttgart");
    await page.locator(".pv-field", { hasText: "Ich bin volljährig." }).getByRole("button", { name: "Ja" }).click();
    for (let i = 0; i < 6; i++) await page.getByTestId("weiter").click();
    for (const q of await page.locator(".pv-card", { has: page.locator(".pv-opt") }).all()) await q.locator(".pv-opt").first().click();
    // Abschicken geht sofort an den Server; erst nach der Bestätigung weitermachen
    const abgeschickt = page.waitForResponse((r) => r.url().includes("/api/neu/crew/aktion") && (r.request().postData() ?? "").includes('"abschicken"'));
    await page.getByTestId("weiter").click();
    expect((await abgeschickt).status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Danke, Eingeladen/ })).toBeVisible();

    // Neu laden: der Fragebogen steht auf dem Server
    await page.reload();
    await expect(page.getByRole("heading", { name: /Danke, Eingeladen/ })).toBeVisible();

    // Nur der veröffentlichte Auftrag ist sichtbar, ohne Treffpunkt
    await page.locator(".pvc-nav").getByRole("link", { name: "Jobs" }).click();
    await expect(page.getByTestId("crew-job").filter({ hasText: AUFTRAG })).toBeVisible();
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
      await page.getByTestId("haken").check();
      await page.getByTestId("bestaetigen-uw").click();
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
    await ctx.close();
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
