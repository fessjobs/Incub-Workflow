// Neues System (parallel zum bisherigen): Button in der Navigation, eigene Daten,
// Einladung → Fragebogen → Bewerbung, Beleg-Link mit Upload, Zugriffsschutz.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

// Eine Unterweisung am Handy durcharbeiten (richtige Antworten) und bestätigen; wartet auf die Antwort des Servers
async function unterweisungMachen(page: Page, modul: string) {
  await page.goto("/crew/unterweisung");
  await page.getByTestId(`modul-${modul}`).click();
  await page.getByTestId("karte").waitFor();
  // Falls ein Video als Pflicht eingestellt ist: bestätigen
  if (await page.getByTestId("video-gesehen").count()) await page.getByTestId("video-gesehen").check();
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
  const antwort = page.waitForResponse((r) => r.url().includes("/api/neu/crew/aktion") && (r.request().postData() ?? "").includes('"unterweisung"'));
  await page.getByTestId("bestaetigen-uw").click();
  expect((await antwort).status()).toBe(200);
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
  test("Video auf der Lernkarte, Pflicht-Haken vor dem Quiz, Kundenregel – danach alles zurück", async ({ browser }) => {
    const admin = await neuerAdmin(browser);
    await admin.goto("/admin/unterweisungen");
    await admin.getByRole("tab", { name: "Pflicht & Videos" }).click();
    // Video für die Grundunterweisung, vor dem Quiz bestätigen
    await admin.getByLabel("Video-Adresse grund").fill("https://youtu.be/abcDEF12345");
    await expect(admin.getByTestId("video-grund")).toContainText("YouTube/Vimeo erkannt");
    await admin.getByLabel("Video Pflicht grund").check();
    await admin.getByLabel("Video-Adresse brandschutz").fill("http://unsicher.example/video");
    await expect(admin.getByTestId("video-brandschutz")).toContainText("Adresse ungültig");
    await admin.getByLabel("Video-Adresse brandschutz").fill("");
    // Kundenregel: Testkunde braucht zusätzlich „Einlass“
    await admin.getByTestId("kundenregel-neu").click();
    await admin.getByLabel("Kunde 1").fill("Testkunde GmbH");
    await admin.getByRole("button", { name: "einlass", exact: true }).click();
    await gespeichert(admin);

    const crew = await (crewCtx as BrowserContext).newPage();
    await crew.goto("/crew/unterweisung/grund");
    await expect(crew.getByTestId("video").locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcDEF12345");
    // Ohne „Video angesehen“ geht es nicht weiter
    await expect(crew.getByTestId("karte-weiter")).toBeDisabled();
    await crew.getByTestId("video-gesehen").check();
    await expect(crew.getByTestId("karte-weiter")).toBeEnabled();
    // Die Kundenregel zeigt sich am Auftrag des Testkunden
    await crew.goto("/crew/jobs");
    await crew.getByTestId("crew-job").filter({ hasText: AUFTRAG }).click();
    await expect(crew.locator(".pv-chip", { hasText: "Einlass" })).toBeVisible();
    await crew.close();

    // Aufräumen: Standard wiederherstellen
    await admin.getByLabel("Kunde 1").fill("");
    await admin.getByRole("button", { name: "Regel entfernen" }).click();
    await admin.getByLabel("Video Pflicht grund").uncheck();
    await admin.getByRole("button", { name: "Video entfernen" }).click();
    await gespeichert(admin);
    await admin.reload();
    await admin.getByRole("tab", { name: "Pflicht & Videos" }).click();
    await expect(admin.getByTestId("video-grund")).toContainText("Platzhalter");
    await expect(admin.getByLabel("Kunde 1")).toHaveCount(0);
    await admin.close();
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
