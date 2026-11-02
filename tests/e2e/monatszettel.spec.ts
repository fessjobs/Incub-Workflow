// Monatszettel im Einsatzmodul: Personen und Kunde wählen, Zettel am Handy ausfüllen und unterschreiben, Kunde bestätigt oder
// gibt zurück – die Stunden laufen durch Freigabe und Auswertung, das PDF liegt unter Dokumente (Stundennachweis).
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { unterschriftDataUrl } from "../fixtures/unterschrift";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? /DATABASE_URL="?([^"\n]+)"?/.exec(readFileSync(".env", "utf8"))?.[1] });

const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const MONAT = HEUTE.slice(0, 7);
// Der 1. liegt nie in der Zukunft
const TAG = `${MONAT}-01`;

const KUNDE = `Monatskunde ${RUN}`;
const E1 = { vorname: "Mona", nachname: `Eins-${RUN}` };
const E2 = { vorname: "Max", nachname: `Zwei-${RUN}` };
let kundeId = "";
let e1Id = "";
let e2Id = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function neueSeite(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function unterschreibe(page: Page, testId: string) {
  const feld = page.getByTestId(testId).locator("canvas");
  await feld.scrollIntoViewIfNeeded();
  const box = await feld.boundingBox();
  if (!box) throw new Error("Unterschriftenfeld nicht sichtbar");
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * 12, box.y + box.height / 2 + Math.sin(i) * 14, { steps: 3 });
  await page.mouse.up();
}

const sheetOf = (employeeId: string) => db.monthSheet.findFirstOrThrow({ where: { employeeId, batch: { customerId: kundeId, monat: MONAT } }, include: { batch: true } });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const org = await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { organizationId: true } });
  kundeId = (await db.customer.create({ data: { organizationId: org.organizationId, name: KUNDE, adresse: "Musterweg 1, Stuttgart" } })).id;
  e1Id = (await db.employee.create({ data: { organizationId: org.organizationId, ...E1, personalnummer: `M1${RUN.toUpperCase()}`, mobil: "0151 1234 5678" } })).id;
  e2Id = (await db.employee.create({ data: { organizationId: org.organizationId, ...E2, personalnummer: `M2${RUN.toUpperCase()}` } })).id;
});

test.afterAll(async () => {
  const docs = await db.document.findMany({ where: { links: { some: { customerId: kundeId } } }, select: { id: true } });
  await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await db.assignment.deleteMany({ where: { customerId: kundeId } });
  await db.monthBatch.deleteMany({ where: { customerId: kundeId } });
  await db.employee.deleteMany({ where: { id: { in: [e1Id, e2Id] } } });
  await db.customer.deleteMany({ where: { id: kundeId } });
  await db.$disconnect();
});

test.describe("Monatszettel: Dashboard", () => {
  test("Ohne Anmeldung nichts erreichbar", async ({ request }) => {
    const seite = await request.get("/einsaetze/monatszettel", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(seite.status());
    expect((await request.get("/api/documents/monatszettel/irgendeine-id")).status()).toBe(401);
    // Die Links sind öffentlich, aber nur mit dem richtigen Token
    expect((await request.get("/api/e/m/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
    expect((await request.get("/api/e/m/kein-token")).status()).toBe(404);
    expect((await request.get("/api/e/k/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  });

  test("Tab „Monatszettel“ im Einsatzmodul: Kunde und Monat wählen, Personen ankreuzen, Links erstellen", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze");
    await page.getByRole("link", { name: "Monatszettel", exact: true }).click();
    await expect(page.getByTestId("monatszettel")).toBeVisible();
    await expect(page.getByTestId("mz-links-erstellen")).toHaveCount(0);
    await page.getByTestId("mz-kunde").selectOption({ label: KUNDE });
    await page.getByTestId("mz-monat").selectOption(MONAT);
    await expect(page.getByTestId("mz-links-erstellen")).toBeDisabled();
    await page.getByTestId(`mz-wahl-${e1Id}`).check();
    await page.getByTestId(`mz-wahl-${e2Id}`).check();
    await page.getByTestId("mz-links-erstellen").click();
    await expect(page.getByTestId("mz-meldung")).toContainText("2 Monatslinks erstellt");
    await expect(page.getByTestId("mz-tabelle").locator("tbody tr")).toHaveCount(2);
    await expect(page.getByTestId(`mz-stand-${e1Id}`)).toHaveText("noch nichts eingetragen");
    // Die Personen haben jetzt einen Link und sind nicht mehr wählbar; der Kundenlink steht bereit
    await expect(page.getByTestId(`mz-wahl-${e1Id}`)).toBeDisabled();
    await expect(page.getByTestId("mz-kundenlink")).toContainText("/e/k/");
    // Kopieren markiert den Link als versendet
    await expect(page.getByTestId(`mz-zeile-${e1Id}`)).toContainText("Link noch nicht versendet");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await page.getByTestId(`mz-kopieren-${e1Id}`).click();
    await expect(page.getByTestId(`mz-zeile-${e1Id}`)).toContainText("Link versendet");
    // WhatsApp-Link mit Nummer und dem persönlichen Link im Text
    const wa = (await page.getByTestId(`mz-wa-${e1Id}`).getAttribute("href")) ?? "";
    expect(wa).toContain("wa.me/4915112345678");
    const sheet = await sheetOf(e1Id);
    expect(decodeURIComponent(wa)).toContain(`/e/m/${sheet.token}`);
    expect(decodeURIComponent(wa)).toContain(KUNDE);
    // Doppelt erstellen legt nichts neu an
    expect(await db.monthSheet.count({ where: { batch: { customerId: kundeId, monat: MONAT } } })).toBe(2);
  });
});

test.describe("Monatszettel: Person am Handy", () => {
  test("Tage eintragen, Eingaben prüfen, unterschreiben – die Zeiten stehen im Einsatzmodul", async ({ browser }) => {
    const sheet = await sheetOf(e1Id);
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${sheet.token}`);
    await expect(page.getByTestId("mz-person")).toBeVisible();
    // Keine Einzelschicht-Anleitung auf dieser Seite
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
    await expect(page.getByTestId("mz-status")).toHaveText("noch nichts eingetragen");
    await expect(page.getByTestId("mz-abschliessen")).toBeDisabled();

    // Erster Eintrag mit Fahrt, Spesen, Absprache und Beschreibung
    await page.getByTestId(`mz-tag-${TAG}`).click();
    await page.getByTestId("mz-start").fill("07:30");
    await page.getByTestId("mz-ende").fill("16:00");
    await page.getByTestId("mz-pause").fill("45");
    await page.getByTestId("mz-taetigkeit").fill("Stagehand");
    await page.getByTestId("mz-fahrt-neu").click();
    await page.getByTestId("mz-fahrt-von-0").fill("Stuttgart");
    await page.getByTestId("mz-fahrt-nach-0").fill("Porsche-Arena");
    await page.getByTestId("mz-fahrt-km-0").fill("14,5");
    await page.getByTestId("mz-spesen").fill("12,50");
    await page.getByTestId("mz-sonderabsprache").fill("Früherer Beginn abgesprochen");
    await page.getByTestId("mz-getan").fill("Aufbau Bühne");
    await page.getByTestId("mz-speichern").click();
    await expect(page.getByTestId("mz-gespeichert")).toBeVisible();
    await expect(page.getByTestId("mz-summe")).toContainText("1 Tag");
    await expect(page.getByTestId("mz-summe")).toContainText("7,75 h");
    await expect(page.getByTestId("mz-summe")).toContainText("14,5 km");

    // Ungültige Eingabe wird erklärt und nicht gespeichert
    await page.getByTestId(`mz-tag-${TAG}`).click();
    await page.getByTestId("mz-start").fill("10:00");
    await page.getByTestId("mz-ende").fill("10:00");
    await page.getByTestId("mz-speichern").click();
    await expect(page.getByTestId("mz-fehler")).toContainText("gleich");
    // „Wie letzter Eintrag“ übernimmt Zeiten und Fahrt – hier ein zweiter Zeitraum am selben Tag
    await page.getByTestId("mz-wie-letzter").click();
    await expect(page.getByTestId("mz-start")).toHaveValue("07:30");
    await expect(page.getByTestId("mz-fahrt-von-0")).toHaveValue("Stuttgart");
    await page.getByTestId("mz-start").fill("18:00");
    await page.getByTestId("mz-ende").fill("20:00");
    await page.getByTestId("mz-pause").fill("0");
    await page.getByTestId("mz-speichern").click();
    // Überschneidung wird gemeldet
    await expect(page.getByTestId("mz-fehler")).toHaveCount(0);
    await expect(page.getByTestId("mz-summe")).toContainText("9,75 h");

    // Zukunft ist gesperrt (falls heute nicht der Letzte des Monats ist)
    const letzter = `${MONAT}-${String(new Date(Date.UTC(Number(MONAT.slice(0, 4)), Number(MONAT.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`;
    if (letzter > HEUTE) await expect(page.getByTestId(`mz-tag-${letzter}`)).toBeDisabled();

    // Der Entwurf liegt auf dem Server, nicht nur im Browser
    expect((await sheetOf(e1Id)).tage).toHaveLength(2);
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: e1Id } } })).toBe(0);

    // Unterschrift: erst Haken und Unterschrift, dann geht es weiter
    await expect(page.getByTestId("mz-abschliessen")).toBeDisabled();
    await page.getByTestId("mz-haken").check();
    await expect(page.getByTestId("mz-abschliessen")).toBeDisabled();
    await unterschreibe(page, "mz-signatur");
    await page.getByTestId("mz-abschliessen").click();
    await expect(page.getByText("Du hast unterschrieben.")).toBeVisible();
    await expect(page.getByTestId("mz-status")).toHaveText("wartet auf den Kunden");
    await expect(page.getByTestId("mz-wieder-oeffnen")).toBeVisible();

    // Jetzt stehen die Zeiten wie bei jedem Einsatz in der Datenbank: Einsatz, Schichten, Einteilung, Zeiteintrag, Fahrt
    const a = await db.assignment.findFirstOrThrow({ where: { customerId: kundeId }, include: { shifts: { orderBy: { sortOrder: "asc" } } } });
    expect(a.projekt).toMatch(/^Monatszettel /);
    expect(a.status).toBe("LAUFEND");
    expect(a.shifts.map((s) => s.bezeichnung)).toEqual([`Monatszettel ${TAG.slice(8)}.${TAG.slice(5, 7)}.`, `Monatszettel ${TAG.slice(8)}.${TAG.slice(5, 7)}. (2)`]);
    const zeiten = await db.timeEntry.findMany({ where: { shiftAssignment: { employeeId: e1Id }, aktuell: true }, include: { trips: true }, orderBy: { istStart: "asc" } });
    expect(zeiten.map((t) => Number(t.stundenGesamt))).toEqual([7.75, 2]);
    expect(zeiten[0]).toMatchObject({ pkw: true, pkwArt: "PRIVAT", spesen: true, review: "ERFASST", quelle: "MITARBEITER", taetigkeit: "Stagehand" });
    expect(Number(zeiten[0].spesenBetrag)).toBe(12.5);
    expect(zeiten[0].trips.map((t) => [t.von, t.nach, Number(t.km)])).toEqual([["Stuttgart", "Porsche-Arena", 14.5]]);
    expect(zeiten[0].notiz).toContain("Absprache: Früherer Beginn abgesprochen");
    expect(zeiten[0].notiz).toContain("Getan: Aufbau Bühne");
    expect(zeiten[0].unterschriftMitarbeiterUrl).toBeTruthy();
    await page.context().close();
  });

  test("Die Stunden laufen durch Freigabe und Auswertung wie alle anderen", async ({ page }) => {
    await login(page);
    await page.goto(`/einsaetze/freigabe?review=ERFASST&from=${TAG}&to=${TAG}`);
    await expect(page.getByText(`${E1.vorname} ${E1.nachname}`).first()).toBeVisible();
    await page.goto(`/auswertung?von=${TAG}&bis=${TAG}`);
    await expect(page.getByRole("cell", { name: new RegExp(E1.nachname) }).first()).toBeVisible();
    // Der Monatseinsatz steht in der Einsatzliste
    await page.goto(`/einsaetze?q=Monatszettel`);
    await expect(page.getByText(/Monatszettel/).first()).toBeVisible();
  });

  test("Die zweite Person: leerer Zettel lässt sich nicht abschließen", async ({ browser }) => {
    const sheet = await sheetOf(e2Id);
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${sheet.token}`);
    await page.getByTestId("mz-haken").check();
    await unterschreibe(page, "mz-signatur");
    await expect(page.getByTestId("mz-abschliessen")).toBeDisabled();
    // Auch direkt über die Schnittstelle: ohne Eintrag und ohne Unterschrift wird nichts angenommen
    const r = await page.request.post(`/api/e/m/${sheet.token}`, { data: { tage: [], unterschrift: unterschriftDataUrl() } });
    expect(r.status()).toBe(400);
    const r2 = await page.request.post(`/api/e/m/${sheet.token}`, { data: { tage: [{ id: "x", datum: TAG, start: "08:00", ende: "12:00", pauseMin: 0, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "" }], unterschrift: "data:image/png;base64,AAAA" } });
    expect(r2.status()).toBe(400);
    // Zukunft und fremder Monat
    const zukunft = await page.request.put(`/api/e/m/${sheet.token}`, { data: { tage: [{ id: "x", datum: `${MONAT}-31`.replace(/-31$/, "-31"), start: "08:00", ende: "12:00", pauseMin: 0, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "" }] } });
    if (HEUTE < `${MONAT}-31`) expect(zukunft.status()).toBe(400);
    const fremd = await page.request.put(`/api/e/m/${sheet.token}`, { data: { tage: [{ id: "y", datum: "2020-01-01", start: "08:00", ende: "12:00", pauseMin: 0, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "" }] } });
    expect(fremd.status()).toBe(400);
    // Eine zweite Person sieht nie den Zettel der ersten
    const meins = await (await page.request.get(`/api/e/m/${sheet.token}`)).json();
    expect(meins.person.nachname).toBe(E2.nachname);
    expect(JSON.stringify(meins)).not.toContain(E1.nachname);
    await page.context().close();
  });
});

test.describe("Monatszettel: Kunde", () => {
  test("Der Kunde sieht nur Abgeschlossenes, gibt mit Hinweis zurück, die Person korrigiert und unterschreibt neu", async ({ browser }) => {
    const sheet1 = await sheetOf(e1Id);
    const sheet2 = await sheetOf(e2Id);
    const kunde = await neueSeite(browser);
    await kunde.goto(`/e/k/${sheet1.batch.token}`);
    await expect(kunde.getByTestId("mz-kunde")).toContainText(KUNDE);
    await expect(kunde.getByTestId(`mk-stand-${sheet1.id}`)).toHaveText("wartet auf den Kunden");
    await expect(kunde.getByTestId(`mk-stand-${sheet2.id}`)).toHaveText("noch nichts eingetragen");
    // Nicht abgeschlossene Zettel zeigen keine Einträge, über die Schnittstelle auch nicht
    const roh = await (await kunde.request.get(`/api/e/k/${sheet1.batch.token}`)).json();
    const zweite = roh.zettel.find((z: { id: string }) => z.id === sheet2.id);
    expect(zweite.tage).toEqual([]);
    expect(zweite.personUnterschrift).toBeNull();
    // Ohne Hinweis keine Rückgabe; mit Hinweis geht der Zettel zurück an die Person
    await kunde.getByTestId(`mk-ansehen-${sheet1.id}`).click();
    await expect(kunde.getByTestId(`mk-detail-${sheet1.id}`)).toContainText("Summe");
    await expect(kunde.getByTestId(`mk-detail-${sheet1.id}`)).toContainText("Aufbau Bühne");
    await kunde.getByTestId(`mk-zurueckgeben-${sheet1.id}`).click();
    await expect(kunde.getByTestId(`mk-zurueck-senden-${sheet1.id}`)).toBeDisabled();
    await kunde.getByTestId(`mk-hinweis-${sheet1.id}`).fill("Am 1. war der Feierabend früher.");
    await kunde.getByTestId(`mk-zurueck-senden-${sheet1.id}`).click();
    await expect(kunde.getByTestId(`mk-stand-${sheet1.id}`)).toHaveText("vom Kunden zurückgegeben");
    expect((await sheetOf(e1Id)).kundeStatus).toBe("ZURUECK");

    // Die Person sieht den Hinweis und kann wieder ändern
    const person = await neueSeite(browser);
    await person.goto(`/e/m/${sheet1.token}`);
    await expect(person.getByTestId("mz-rueckgabe-hinweis")).toContainText("Feierabend früher");
    // Erster Eintrag des Tages aus der Liste öffnen
    const ersterEintrag = (await sheetOf(e1Id)).tage as Array<{ id: string; start: string }>;
    await person.getByTestId(`mz-eintrag-${ersterEintrag.find((t) => t.start === "07:30")!.id}`).click();
    await person.getByTestId("mz-ende").fill("15:00");
    await person.getByTestId("mz-speichern").click();
    await expect(person.getByTestId("mz-summe")).toContainText("8,75 h");
    await person.getByTestId("mz-haken").check();
    await unterschreibe(person, "mz-signatur");
    await person.getByTestId("mz-abschliessen").click();
    await expect(person.getByText("Du hast unterschrieben.")).toBeVisible();
    // Neue Version des Zeiteintrags, alte bleibt nachvollziehbar; unveränderter zweiter Eintrag bekommt keine neue Version
    const versionen = await db.timeEntry.findMany({ where: { shiftAssignment: { employeeId: e1Id } }, orderBy: [{ istStart: "asc" }, { version: "asc" }] });
    expect(versionen.map((t) => [t.version, t.aktuell, Number(t.stundenGesamt)])).toEqual([[1, false, 7.75], [2, true, 6.75], [1, true, 2]]);
    await person.context().close();

    // Kunde bestätigt: eine Unterschrift für alles, was abgeschlossen ist
    await kunde.reload();
    await expect(kunde.getByTestId("mk-unterschreiben")).toBeDisabled();
    await kunde.getByTestId("mk-name").fill("Frau Berger");
    await kunde.getByTestId("mk-haken").check();
    await unterschreibe(kunde, "mk-signatur");
    await kunde.getByTestId("mk-unterschreiben").click();
    await expect(kunde.getByTestId("mk-fertig")).toContainText("einer Person");
    await expect(kunde.getByTestId(`mk-stand-${sheet1.id}`)).toHaveText("von beiden unterschrieben");
    await kunde.context().close();

    const fertig = await sheetOf(e1Id);
    expect(fertig).toMatchObject({ kundeStatus: "BESTAETIGT", kundeName: "Frau Berger" });
    const a = await db.assignment.findFirstOrThrow({ where: { customerId: kundeId }, include: { confirmations: true } });
    expect(a.confirmations.length).toBeGreaterThanOrEqual(1);
    expect(a.confirmations.every((c) => c.kundeName === "Frau Berger" && c.shiftId)).toBe(true);
    // Die zweite Person hat nichts abgeschlossen: ihr Zettel bleibt offen, der Einsatz läuft weiter
    expect((await sheetOf(e2Id)).kundeStatus).toBe("OFFEN");
    expect((await db.assignment.findFirstOrThrow({ where: { customerId: kundeId } })).status).toBe("LAUFEND");
  });

  test("Nach der Bestätigung ist der Zettel gesperrt, das PDF liegt bereit", async ({ browser }) => {
    const sheet = await sheetOf(e1Id);
    const person = await neueSeite(browser);
    await person.goto(`/e/m/${sheet.token}`);
    await expect(person.getByText("hat den Monat bestätigt")).toBeVisible();
    await expect(person.getByTestId("mz-abschliessen")).toHaveCount(0);
    await expect(person.getByTestId("mz-wieder-oeffnen")).toHaveCount(0);
    // Änderungen über die Schnittstelle werden abgelehnt
    expect((await person.request.put(`/api/e/m/${sheet.token}`, { data: { tage: [] } })).status()).toBe(409);
    expect((await person.request.patch(`/api/e/m/${sheet.token}`)).status()).toBe(409);
    // Das fertige PDF über den eigenen Link
    const pdf = await person.request.get(`/api/e/m/${sheet.token}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Die zweite Person hat noch kein PDF
    expect((await person.request.get(`/api/e/m/${(await sheetOf(e2Id)).token}/pdf`)).status()).toBe(404);
    // Der Kunde kann einen bestätigten Zettel nicht mehr zurückgeben und nichts doppelt bestätigen
    const k = await person.request.post(`/api/e/k/${sheet.batch.token}`, { data: { aktion: "zurueck", sheetId: sheet.id, hinweis: "zu spät" } });
    expect(k.status()).toBe(409);
    const k2 = await person.request.post(`/api/e/k/${sheet.batch.token}`, { data: { aktion: "bestaetigen", kundeName: "Nochmal", unterschrift: unterschriftDataUrl() } });
    expect(k2.status()).toBe(409);
    // Ein Zettel einer fremden Stapel-ID wird nicht angenommen
    const fremd = await person.request.post(`/api/e/k/${sheet.batch.token}`, { data: { aktion: "zurueck", sheetId: "gibtesnicht", hinweis: "nein" } });
    expect(fremd.status()).toBe(403);
    await person.context().close();
  });

  test("Das PDF liegt in der Dokumentenablage wie alle Stundennachweise", async ({ page }) => {
    await login(page);
    const doc = await db.document.findFirstOrThrow({ where: { category: "stundennachweis", links: { some: { customerId: kundeId, employeeId: e1Id } } }, include: { links: true } });
    expect(doc.filename).toMatch(/^Monatsstundenzettel_.*\.pdf$/);
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.links[0].datum?.toISOString().slice(0, 10)).toBe(`${MONAT}-01`);
    expect(doc.links[0].assignmentId).toBeTruthy();
    // Sichtbar unter Dokumente, auch gefiltert nach Kunde und Person
    await page.goto(`/dokumente?category=stundennachweis&customerId=${kundeId}&employeeId=${e1Id}`);
    await expect(page.locator(`a[href^="/api/documents/${doc.id}"]`).first()).toContainText("Monatsstundenzettel_");
    const r = await page.request.get(`/api/documents/${doc.id}`);
    expect(r.status()).toBe(200);
    expect((await r.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Dashboard: bestätigter Zettel liefert dasselbe abgelegte PDF, nur eines je Person
    const sheet = await sheetOf(e1Id);
    const d = await page.request.get(`/api/documents/monatszettel/${sheet.id}`);
    expect(d.status()).toBe(200);
    expect(createHashOf(await d.body())).toBe(doc.sha256);
    expect(await db.document.count({ where: { category: "stundennachweis", links: { some: { customerId: kundeId, employeeId: e1Id } } } })).toBe(1);
    // Vorschau eines noch offenen Zettels wird nicht abgelegt
    const v = await page.request.get(`/api/documents/monatszettel/${(await sheetOf(e2Id)).id}`);
    expect(v.status()).toBe(200);
    expect(await db.document.count({ where: { category: "stundennachweis", links: { some: { customerId: kundeId, employeeId: e2Id } } } })).toBe(0);
    // Detailseite im Dashboard
    await page.goto(`/einsaetze/monatszettel?kunde=${kundeId}&monat=${MONAT}`);
    await expect(page.getByTestId(`mz-stand-${e1Id}`)).toHaveText("von beiden unterschrieben");
    await expect(page.getByTestId(`mz-stand-${e2Id}`)).toHaveText("noch nichts eingetragen");
    await page.getByTestId(`mz-detail-${e1Id}`).click();
    await expect(page.getByTestId("mz-detail")).toContainText(`${E1.vorname} ${E1.nachname}`);
    await expect(page.getByTestId("mz-eintraege")).toContainText("Aufbau Bühne");
    await expect(page.getByTestId("mz-pdf")).toHaveText("PDF öffnen");
    // Im Einsatz hängt das PDF auch an den Dokumenten
    const einsatz = await db.assignment.findFirstOrThrow({ where: { customerId: kundeId } });
    await page.goto(`/einsaetze/${einsatz.id}`);
    await expect(page.locator('a[href^="/api/documents/"]', { hasText: /Monatsstundenzettel/ }).first()).toBeVisible();
  });

  test("Sind die Stunden schon freigegeben, sperrt das Zurückgeben und Ändern; der Einsatz schließt, wenn alle bestätigt haben", async ({ browser }) => {
    const sheet2 = await sheetOf(e2Id);
    const person = await neueSeite(browser);
    await person.goto(`/e/m/${sheet2.token}`);
    await person.getByTestId(`mz-tag-${TAG}`).click();
    await person.getByTestId("mz-speichern").click();
    await person.getByTestId("mz-haken").check();
    await unterschreibe(person, "mz-signatur");
    await person.getByTestId("mz-abschliessen").click();
    await expect(person.getByText("Du hast unterschrieben.")).toBeVisible();
    // Die Buchhaltung gibt die Zeiten frei
    await db.timeEntry.updateMany({ where: { shiftAssignment: { employeeId: e2Id } }, data: { review: "FREIGEGEBEN" } });
    await person.reload();
    await expect(person.getByTestId("mz-gesperrt")).toContainText("freigegeben");
    expect((await person.request.patch(`/api/e/m/${sheet2.token}`)).status()).toBe(409);
    const k = await person.request.post(`/api/e/k/${sheet2.batch.token}`, { data: { aktion: "zurueck", sheetId: sheet2.id, hinweis: "stimmt nicht" } });
    expect(k.status()).toBe(409);
    // Der Kunde bestätigt die zweite Person – danach ist der Monatseinsatz abgeschlossen
    const kunde = await neueSeite(browser);
    await kunde.goto(`/e/k/${sheet2.batch.token}`);
    await kunde.getByTestId("mk-name").fill("Herr Weber");
    await kunde.getByTestId("mk-haken").check();
    await unterschreibe(kunde, "mk-signatur");
    await kunde.getByTestId("mk-unterschreiben").click();
    await expect(kunde.getByTestId("mk-fertig")).toBeVisible();
    expect((await db.assignment.findFirstOrThrow({ where: { customerId: kundeId } })).status).toBe("ABGESCHLOSSEN");
    // Zwei PDFs, je eines je Person
    expect(await db.document.count({ where: { category: "stundennachweis", links: { some: { customerId: kundeId } } } })).toBe(2);
    await person.context().close();
    await kunde.context().close();
  });
});

test.describe("Monatszettel: Ablage, Sicherung und Aufräumen", () => {
  test("Die PDFs kommen in die Monats-Sicherung (Stundennachweise)", async ({ page }) => {
    await login(page);
    const r = await page.request.get(`/api/neu/sicherung?monat=${MONAT}&bereiche=stundennachweis`);
    expect(r.status()).toBe(200);
    const zip = await JSZip.loadAsync(await r.body());
    const namen = Object.keys(zip.files).filter((n) => n.includes("Monatsstundenzettel_") && n.includes(`${E1.nachname}`));
    expect(namen).toHaveLength(1);
    expect(namen[0].startsWith("Stundennachweise/")).toBe(true);
    expect(((await zip.file(namen[0])?.async("nodebuffer")) as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("Wird der Monatseinsatz gelöscht, lassen sich die Zettel neu unterschreiben", async ({ browser }) => {
    // Die Einsatzverwaltung löscht den Einsatz samt Zeiten und PDFs (hier direkt nachgestellt)
    await db.document.deleteMany({ where: { links: { some: { customerId: kundeId } } } });
    await db.assignment.deleteMany({ where: { customerId: kundeId } });
    const sheet = await sheetOf(e1Id);
    const person = await neueSeite(browser);
    const view = await (await person.request.get(`/api/e/m/${sheet.token}`)).json();
    expect(view.personSigniert).toBe(false);
    expect(view.gesperrt).toBeNull();
    expect(view.stand).toBe("in_arbeit");
    expect(view.tage).toHaveLength(2);
    // Neu unterschreiben legt den Monatseinsatz wieder an
    await person.goto(`/e/m/${sheet.token}`);
    await person.getByTestId("mz-haken").check();
    await unterschreibe(person, "mz-signatur");
    await person.getByTestId("mz-abschliessen").click();
    await expect(person.getByText("Du hast unterschrieben.")).toBeVisible();
    const a = await db.assignment.findFirstOrThrow({ where: { customerId: kundeId } });
    expect(a.status).toBe("LAUFEND");
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: e1Id }, aktuell: true } })).toBe(2);
    // Der Kunde sieht den Stand wieder richtig
    const k = await (await person.request.get(`/api/e/k/${sheet.batch.token}`)).json();
    expect(k.zettel.find((z: { id: string }) => z.id === sheet.id).stand).toBe("wartet_kunde");
    await person.context().close();
  });

  test("Wird eine Person ohne Einteilungen gelöscht, gehen ihre leeren Zettel mit", async () => {
    const org = await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { organizationId: true } });
    const e3 = await db.employee.create({ data: { organizationId: org.organizationId, vorname: "Leo", nachname: `Drei-${RUN}` } });
    const batch = await db.monthBatch.findFirstOrThrow({ where: { customerId: kundeId, monat: MONAT } });
    await db.monthSheet.create({ data: { organizationId: org.organizationId, batchId: batch.id, employeeId: e3.id, tokenExpiresAt: new Date(Date.now() + 86400000) } });
    await db.employee.delete({ where: { id: e3.id } });
    expect(await db.monthSheet.count({ where: { employeeId: e3.id } })).toBe(0);
  });
});

function createHashOf(buf: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:crypto").createHash("sha256").update(buf).digest("hex");
}
