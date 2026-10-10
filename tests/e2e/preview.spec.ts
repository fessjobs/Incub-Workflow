// Klick-Prototyp „Testversion“ (/preview): läuft gegen einen eigenen Server mit
// PREVIEW_ENABLED=1 (siehe playwright.config.ts, Port 3102). Der Hauptserver
// hat das Flag nicht – dort muss /preview ein 404 sein.
import { expect, test, type Page } from "@playwright/test";

const PV = process.env.PREVIEW_E2E_URL ?? "http://localhost:3102";
const PASSWORT = process.env.PREVIEW_PASSWORD ?? "preview-test";

// Das Passwort wird einmal eingegeben (das Limit erlaubt nur wenige Versuche);
// alle anderen Tests übernehmen den Zugangs-Cookie.
let zugang: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> = [];

test.beforeAll(async ({ browser }) => {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${PV}/preview`);
  if (await p.locator("#pv-pw").count()) {
    await p.fill("#pv-pw", PASSWORT);
    await p.getByRole("button", { name: "Öffnen" }).click();
    await p.waitForSelector(".pv-banner");
  }
  zugang = await c.cookies();
  await c.close();
});

async function oeffnen(page: Page, pfad = "/preview") {
  await page.context().addCookies(zugang);
  await page.goto(`${PV}${pfad}`);
  await page.waitForSelector(".pv-banner");
}

async function karten(page: Page) {
  await page.getByTestId("karte").waitFor();
  while (await page.getByTestId("karte-weiter").isVisible()) await page.getByTestId("karte-weiter").click();
  await page.getByTestId("quiz").waitFor();
}

// Beantwortet die verbleibenden Quizfragen richtig, bis das Ergebnis erscheint
async function quizRichtig(page: Page) {
  for (let i = 0; i < 12; i++) {
    const ergebnis = page.locator('[data-testid="nochmal"], [data-testid="zur-bestaetigung"]');
    if (await ergebnis.count()) return;
    const richtig = page.locator('[data-testid="quiz"] button[data-richtig="1"]:not([disabled])').first();
    if (await richtig.count()) {
      await richtig.click();
      await page.getByTestId("quiz-weiter").click();
    }
  }
}

test.describe("Testversion: Zugang", () => {
  test("ohne Flag gibt es /preview nicht", async ({ request, baseURL }) => {
    test.skip(PV.replace(/\/$/, "") === (baseURL ?? "").replace(/\/$/, ""), "Hauptserver hat das Flag ebenfalls an");
    const r = await request.get("/preview");
    expect(r.status()).toBe(404);
    expect((await request.get("/preview/admin/stunden")).status()).toBe(404);
  });

  test("mit Flag verlangt die Seite ein Passwort und sperrt falsche", async ({ page }) => {
    await page.goto(`${PV}/preview`);
    await expect(page.locator("#pv-pw")).toBeVisible();
    await expect(page.locator(".pv-banner")).toHaveCount(0);
    await page.fill("#pv-pw", "falsch");
    await page.getByRole("button", { name: "Öffnen" }).click();
    await expect(page.locator(".pv-error")).toContainText("Passwort stimmt nicht");
    await page.fill("#pv-pw", PASSWORT);
    await page.getByRole("button", { name: "Öffnen" }).click();
    await expect(page.getByRole("heading", { name: "So könnte es aussehen" })).toBeVisible();
    // jede Seite trägt das Banner und ist für Suchmaschinen gesperrt
    await expect(page.locator(".pv-banner")).toContainText("Testversion");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("Testversion: Dashboard", () => {
  test("Übersicht, Crew mit Ampeln, Bewerber, Unterlagen, Einstellungen", async ({ page }) => {
    await oeffnen(page, "/preview/admin");
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
    await page.getByRole("link", { name: "Crew", exact: true }).click();
    await expect(page.getByTestId("crew-tabelle")).toBeVisible();
    await expect(page.locator(".pv-ampel.rot").first()).toBeVisible();
    await expect(page.locator(".pv-ampel.gruen").first()).toBeVisible();
    await page.getByRole("tab", { name: "Karte" }).click();
    await expect(page.getByRole("img", { name: /Karte/ })).toBeVisible();
    await page.getByRole("link", { name: "Unterlagen" }).click();
    await expect(page.getByTestId("unterlagen-tabelle").locator("tbody tr").first()).toBeVisible();
    await page.getByRole("link", { name: "Einstellungen" }).click();
    // Score-Gewichte wirken live auf die Verteilung der Crew
    const vorher = await page.getByTestId("verteilung").innerText();
    await page.getByLabel("Kategorie A ab Punkten").fill("10");
    await expect(page.getByTestId("verteilung")).not.toHaveText(vorher);
  });
});

test.describe("Testversion: Stundentabelle", () => {
  test("bearbeiten, prüfen, einfügen, Status, Protokoll, Export", async ({ page }) => {
    await oeffnen(page, "/preview/admin/stunden");
    await page.waitForSelector('[data-testid="grid-zeile"]');
    const anzahl = Number((await page.getByTestId("zeilenzahl").innerText()).replace(/\./g, ""));
    expect(anzahl).toBeGreaterThan(1000);
    // nur wenige Zeilen im DOM (Virtualisierung)
    expect(await page.getByTestId("grid-zeile").count()).toBeLessThan(80);

    const zeile = page.getByTestId("grid-zeile").first();
    const gesamt = zeile.locator(".pvg-c.calc").nth(2);
    const vorher = await gesamt.innerText();
    const ende = zeile.locator('input[data-c="ende"]');
    await ende.click();
    await ende.fill("23:30");
    await ende.press("Enter");
    await expect(gesamt).not.toHaveText(vorher);

    // ungültige Uhrzeit wird abgelehnt, die Zelle springt zurück
    const start = zeile.locator('input[data-c="start"]');
    const startAlt = await start.inputValue();
    await start.click();
    await start.fill("99:99");
    await start.press("Enter");
    await expect(page.locator(".pv-toast")).toContainText("keine Uhrzeit");
    await expect(start).toHaveValue(startAlt);

    // Einfügen aus Excel: zwei Zeilen, mehrere Spalten
    const feld = page.getByTestId("grid-zeile").nth(1).locator('input[data-c="pauschale"]');
    await feld.click();
    await feld.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "4\tNordlicht Live GmbH\tFESS-2026-0101\n6\t\t");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(feld).toHaveValue("4,00");
    await expect(page.getByTestId("grid-zeile").nth(2).locator('input[data-c="pauschale"]')).toHaveValue("6,00");

    // Status: offen → geprüft
    const status = zeile.locator(".pvg-status");
    await status.click();
    await expect(status).toContainText("geprüft");

    // Protokoll
    await page.getByRole("button", { name: /Änderungsprotokoll/ }).click();
    await expect(page.getByTestId("protokoll").locator("tbody tr").first()).toContainText("time_entries".length ? "" : "");
    expect(await page.getByTestId("protokoll").locator("tbody tr").count()).toBeGreaterThanOrEqual(4);
    await page.keyboard.press("Escape");

    // Filter „nur Fehler“
    await page.getByTestId("chip-fehler").click();
    const nurFehler = Number((await page.getByTestId("zeilenzahl").innerText()).replace(/\./g, ""));
    expect(nurFehler).toBeGreaterThan(0);
    expect(nurFehler).toBeLessThan(60);
    await page.getByTestId("chip-fehler").click();

    // Export: Prüfbericht nennt die nicht abgestimmte Lohnart (Bonus)
    await page.getByTestId("export-oeffnen").click();
    await expect(page.getByTestId("pruefbericht")).toContainText("Lohnart nicht abgestimmt");
    await page.getByRole("tab", { name: /zvoove/ }).click();
    await expect(page.getByTestId("csv-laden")).toBeDisabled();
    await page.getByLabel(/Trotz .* exportieren/).check();
    const download = page.waitForEvent("download");
    await page.getByTestId("csv-laden").click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^zvoove-stunden-.*\.csv$/);
    await page.keyboard.press("Escape");

    // Exportierte Zeilen sind gesperrt: Änderung nur mit Begründung
    await page.getByLabel("Status").selectOption("exportiert");
    const gesperrt = page.getByTestId("grid-zeile").first().locator('input[data-c="bemerkung"]');
    await gesperrt.click();
    await gesperrt.fill("nachträglich korrigiert");
    await gesperrt.press("Enter");
    await expect(page.getByTestId("begruendung-ok")).toBeDisabled();
    await page.getByLabel(/Begründung/).fill("Zettel nachgereicht, Ende war 18:00.");
    await page.getByTestId("begruendung-ok").click();
    await expect(gesperrt).toHaveValue("nachträglich korrigiert");
  });

  test("Massenbearbeitung setzt den Status mehrerer Zeilen", async ({ page }) => {
    await oeffnen(page, "/preview/admin/stunden");
    await page.waitForSelector('[data-testid="grid-zeile"]');
    await page.getByLabel("Zeile 1 auswählen").check();
    await page.getByLabel("Zeile 3 auswählen").click({ modifiers: ["Shift"] });
    await page.getByTestId("massenbearbeitung").click();
    await page.getByLabel("Neuer Status").selectOption("geprueft");
    await page.getByTestId("mass-ok").click();
    for (const i of [0, 1, 2]) await expect(page.getByTestId("grid-zeile").nth(i).locator(".pvg-status")).toContainText("geprüft");
  });
});

test.describe("Testversion: Disposition", () => {
  test("Drag & Drop, Konflikt mit Begründung, automatisch füllen, Aushang", async ({ page }) => {
    await oeffnen(page, "/preview/admin/dispo/FESS-2026-0145");
    await expect(page.getByTestId("bewerberliste")).toBeVisible();
    const anfangs = await page.getByTestId("eingeplant").count();

    // Ziehen auf die Schicht
    const erster = page.getByTestId("bewerber").first();
    const name = (await erster.locator("b").first().innerText()).trim();
    await erster.dragTo(page.getByTestId("schicht").first());
    await expect(page.getByTestId("eingeplant")).toHaveCount(anfangs + 1);
    await expect(page.getByTestId("schicht").first()).toContainText(name);

    // Konflikt: erste Karte mit Warnhinweis → Begründung ist Pflicht
    const mitKonflikt = page.getByTestId("bewerber").filter({ hasText: "⚠" }).first();
    await mitKonflikt.getByTestId("einplanen").click();
    await expect(page.getByTestId("konflikte")).toBeVisible();
    await expect(page.getByTestId("konflikt-ok")).toBeDisabled();
    await page.getByLabel(/Begründung/).fill("Unterweisung wird vor Ort nachgeholt.");
    await page.getByTestId("konflikt-ok").click();
    await expect(page.getByText("Begründung: Unterweisung wird vor Ort nachgeholt.")).toBeVisible();

    // Automatisch füllen
    const vorAuto = await page.getByTestId("eingeplant").count();
    await page.getByTestId("auto-fuellen").click();
    await expect(page.locator(".pv-toast")).toContainText("eingeplant");
    expect(await page.getByTestId("eingeplant").count()).toBeGreaterThanOrEqual(vorAuto);

    // WhatsApp-Aushang
    await page.getByRole("button", { name: "WhatsApp-Aushang" }).click();
    await expect(page.getByTestId("aushang-text")).toContainText("EINSATZ");
    await expect(page.getByTestId("aushang-text")).toContainText("https://fess.jobs/jobs/FESS-2026-0145");
  });

  test("Briefing zeigt die Nachricht je Person und bereitet die Stundenzettel-Vorlage vor", async ({ page }) => {
    await oeffnen(page, "/preview/admin/dispo/FESS-2026-0142/briefing");
    await expect(page.getByTestId("briefing-vorschau")).toContainText("eingeplant");
    await page.getByTestId("briefing-senden").click();
    await expect(page.locator(".pv-toast")).toContainText("nichts verschickt");
    await page.getByTestId("vorlage-anlegen").click();
    await expect(page.locator(".pv-toast")).toContainText("Zeilen in der Stundentabelle vorbereitet");
    // die Vorlage steht in der Stundentabelle, mit den geplanten Zeiten
    await page.getByRole("link", { name: /Stundentabelle öffnen/ }).click();
    await page.getByLabel("Auftrag", { exact: true }).selectOption("FESS-2026-0142");
    await expect(page.getByTestId("grid-zeile").first()).toContainText("offen");
    await expect(page.getByTestId("grid-zeile").first().locator('input[data-c="start"]')).toHaveValue(/^\d\d:\d\d$/);
  });

  test("Wochenplan zeigt die Aufträge mit Füllgrad", async ({ page }) => {
    await oeffnen(page, "/preview/admin/dispo");
    await page.getByRole("tab", { name: "Wochenplan" }).click();
    await expect(page.getByTestId("wochenplan")).toContainText("Hallenkonzert");
    await expect(page.getByTestId("wochenplan")).toContainText("heute");
  });
});

test.describe("Testversion: Mitarbeiterlink", () => {
  test("Anmelden, Fragebogen, Bewerben mit Unterweisung und Quiz, Status", async ({ page }) => {
    await oeffnen(page, "/preview/crew");
    // ohne Zustimmung kein Code
    await page.getByTestId("code-senden").click();
    await expect(page.getByText("Bitte der Datenspeicherung zustimmen.")).toBeVisible();
    await page.getByTestId("dsgvo").check();
    await page.getByTestId("code-senden").click();
    await page.getByTestId("anmelden").click();
    await expect(page.getByRole("heading", { name: "Hallo Mara" })).toBeVisible();

    // Bewerben ohne Fragebogen geht nicht
    await page.locator(".pvc-main").getByRole("link", { name: /Job finden/ }).click();
    await expect(page.getByText("Fülle zuerst den Fragebogen aus")).toBeVisible();

    // Fragebogen
    await page.locator(".pvc-nav").getByRole("link", { name: "Start" }).click();
    await page.locator(".pvc-main").getByRole("link", { name: /Fragebogen/ }).first().click();
    await page.getByTestId("weiter").click();
    await expect(page.getByText("Bitte ausfüllen.").first()).toBeVisible();
    await page.getByLabel("Postleitzahl").fill("70173");
    await page.getByLabel("Wohnort").fill("Stuttgart");
    await page.locator(".pv-field", { hasText: "Ich bin volljährig." }).getByRole("button", { name: "Ja" }).click();
    for (let i = 0; i < 6; i++) await page.getByTestId("weiter").click();
    // Situationsfragen
    for (const q of await page.locator(".pv-card", { has: page.locator(".pv-opt") }).all()) await q.locator(".pv-opt").first().click();
    await page.getByTestId("weiter").click();
    await expect(page.getByRole("heading", { name: /Danke, Mara/ })).toBeVisible();

    // Bewerben
    await page.getByRole("link", { name: "Jobs ansehen" }).click();
    await page.getByTestId("crew-job").first().click();
    await page.getByTestId("bewerben").click();
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByTestId("weiter").click();
    await page.locator(".pv-field", { hasText: "Ich reise selbst an" }).getByRole("button", { name: "Ja", exact: true }).click();
    await page.getByTestId("weiter").click();
    await expect(page.getByText("Bitte beide Fragen beantworten.")).toBeVisible();
    await page.locator(".pv-field", { hasText: "schon einen Vertrag bei FESS" }).getByRole("button", { name: "Nein", exact: true }).click();
    await page.getByTestId("weiter").click();

    // Unterweisungs-Gate: ohne gültige Unterweisung geht es nicht weiter
    await page.getByTestId("weiter").click();
    await expect(page.getByText("Bitte erst die fehlenden Unterweisungen abschließen.")).toBeVisible();
    for (let runde = 0; runde < 6; runde++) {
      const knopf = page.locator('button[data-testid^="uw-"]').first();
      if ((await knopf.count()) === 0) break;
      await knopf.click();
      await karten(page);
      // Beim ersten Modul bewusst falsch antworten: die passende Karte erscheint erneut
      if (runde === 0) {
        await page.locator('[data-testid="quiz"] button[data-richtig="0"]').first().click();
        await expect(page.getByTestId("karte-nochmal")).toBeVisible();
        await page.getByTestId("quiz-weiter").click();
        await quizRichtig(page);
      } else {
        await quizRichtig(page);
      }
      // Ein Fehler kann unter 80 % führen: dann nochmal lesen und richtig beantworten
      await page.locator('[data-testid="nochmal"], [data-testid="zur-bestaetigung"]').first().waitFor();
      if (await page.getByTestId("nochmal").isVisible()) {
        await page.getByTestId("nochmal").click();
        await karten(page);
        await quizRichtig(page);
      }
      await page.getByTestId("zur-bestaetigung").click();
      // Ohne Haken keine Unterschrift, ohne Unterschrift kein Abschluss
      await expect(page.getByTestId("zur-unterschrift")).toBeDisabled();
      await page.getByTestId("haken").check();
      await page.getByTestId("zur-unterschrift").click();
      await expect(page.getByTestId("bestaetigen-uw")).toBeDisabled();
      const feld = page.getByTestId("signatur");
      await feld.scrollIntoViewIfNeeded();
      const box = await feld.boundingBox();
      if (!box) throw new Error("Unterschriftenfeld nicht sichtbar");
      await page.mouse.move(box.x + 30, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 14; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + box.height / 2 + Math.sin(i) * 26);
      await page.mouse.up();
      await page.getByTestId("bestaetigen-uw").click();
      await page.getByTestId("zurueck-bewerbung").click();
    }
    await expect(page.getByText("Alles gültig – du kannst weiter.")).toBeVisible();
    await page.getByTestId("weiter").click();
    await page.getByTestId("absenden").click();
    await expect(page.getByText("Bitte bestätige deine Angaben.")).toBeVisible();
    await page.getByTestId("bestaetigen").check();
    await page.getByTestId("absenden").click();
    await expect(page.getByTestId("status-tracker")).toContainText("eingegangen");

    // Im Dashboard taucht der Fragebogen mit Score auf
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByRole("link", { name: "Bewerber" }).click();
    await expect(page.getByTestId("fragebogen-tabelle")).toContainText("Mara Beispiel");
    await expect(page.getByTestId("fragebogen-tabelle")).toContainText(/Kategorie [ABC]/);
  });

  test("Daten löschen setzt alles zurück", async ({ page }) => {
    await oeffnen(page, "/preview/crew");
    await page.getByTestId("dsgvo").check();
    await page.getByTestId("code-senden").click();
    await page.getByTestId("anmelden").click();
    await page.locator(".pvc-nav").getByRole("link", { name: "Profil" }).click();
    await page.getByRole("button", { name: "Daten löschen" }).click();
    await page.getByTestId("loeschen-ok").click();
    await expect(page.getByTestId("code-senden")).toBeVisible();
  });
});

test.describe("Testversion: Beleg-Link", () => {
  test("Beleg einreichen, Abweichung wird gelb markiert", async ({ page }) => {
    await oeffnen(page, "/preview/b/demo-token");
    await page.getByTestId("beleg-senden").click();
    await expect(page.locator(".pv-error")).toContainText("Foto oder eine PDF");
    await page.getByTestId("beispielfoto-abweichung").click();
    await page.getByLabel("Betrag").fill("12,50");
    await expect(page.getByTestId("beiblatt")).toContainText("Tankbeleg");
    await page.getByTestId("beleg-senden").click();
    await expect(page.getByTestId("abweichungen")).toContainText("Betrag");
    // landet im Unterlagen-Archiv
    await page.goto(`${PV}/preview/admin/unterlagen`);
    await expect(page.getByTestId("unterlagen-tabelle")).toContainText("Tankbeleg");
  });
});
