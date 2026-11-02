// Monatszettel: Links ohne Namen. Die Dispo erzeugt Links, die keiner Person gehören; wer so einen Link bekommt, trägt Vor- und
// Nachnamen selbst ein und kann sie ändern, bis der Kunde unterschrieben hat. Beim Unterschreiben wird die Person im
// Mitarbeiterstamm gefunden oder neu angelegt, bei einer Namensänderung umbenannt bzw. gewechselt.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { unterschriftDataUrl } from "../fixtures/unterschrift";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@incub.live";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "incub2026!";
const RUN = Date.now().toString(36);
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? /DATABASE_URL="?([^"\n]+)"?/.exec(readFileSync(".env", "utf8"))?.[1] });

const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const MONAT = HEUTE.slice(0, 7);
const TAG = `${MONAT}-01`;

const KUNDE = `Namenskunde ${RUN}`;
const GEWAEHLT = { vorname: "Paula", nachname: `Gewaehlt-${RUN}` };
const RITA = { vorname: "Rita", nachname: `Real-${RUN}` };
const ROLF = { vorname: "Rolf", nachname: `Zwei-${RUN}` };
let orgId = "";
let kundeId = "";
let gewaehltId = "";
let ritaId = "";
let rolfId = "";
let batchId = "";
let batchToken = "";
let gewaehltSheet = { id: "", token: "" };
// Die drei Links ohne Namen, die die Dispo erzeugt
const links: Array<{ id: string; token: string }> = [];

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

async function tagEintragen(page: Page) {
  await page.getByTestId(`mz-tag-${TAG}`).click();
  await page.getByTestId("mz-speichern").click();
  await expect(page.getByTestId("mz-gespeichert")).toBeVisible();
}

async function nameSpeichern(page: Page, vorname: string, nachname: string) {
  await page.getByTestId("mz-vorname").fill(vorname);
  await page.getByTestId("mz-nachname").fill(nachname);
  await page.getByTestId("mz-name-speichern").click();
}

async function abschliessen(page: Page) {
  await page.getByTestId("mz-haken").check();
  await unterschreibe(page, "mz-signatur");
  await page.getByTestId("mz-abschliessen").click();
  await expect(page.getByText("Du hast unterschrieben.")).toBeVisible();
}

const blatt = (id: string) => db.monthSheet.findUniqueOrThrow({ where: { id }, include: { employee: true } });
const personen = (vorname: string, nachname: string) => db.employee.findMany({ where: { organizationId: orgId, vorname, nachname } });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  orgId = (await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { organizationId: true } })).organizationId;
  kundeId = (await db.customer.create({ data: { organizationId: orgId, name: KUNDE, adresse: "Namensweg 2, Stuttgart" } })).id;
  gewaehltId = (await db.employee.create({ data: { organizationId: orgId, ...GEWAEHLT, personalnummer: `G${RUN.toUpperCase()}` } })).id;
  ritaId = (await db.employee.create({ data: { organizationId: orgId, ...RITA, personalnummer: `R${RUN.toUpperCase()}`, mobil: "0151 9999 0000" } })).id;
  rolfId = (await db.employee.create({ data: { organizationId: orgId, ...ROLF, personalnummer: `Z${RUN.toUpperCase()}` } })).id;
});

test.afterAll(async () => {
  const docs = await db.document.findMany({ where: { links: { some: { customerId: kundeId } } }, select: { id: true } });
  await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await db.assignment.deleteMany({ where: { customerId: kundeId } });
  await db.monthBatch.deleteMany({ where: { customerId: kundeId } });
  await db.employee.deleteMany({ where: { organizationId: orgId, nachname: { contains: RUN } } });
  await db.customer.deleteMany({ where: { id: kundeId } });
  await db.$disconnect();
});

test.describe("Links ohne Namen: Dashboard", () => {
  test("Die Dispo legt eine gewählte Person und drei Links ohne Namen an", async ({ page }) => {
    await login(page);
    await page.goto("/einsaetze/monatszettel");
    await page.getByTestId("mz-kunde").selectOption({ label: KUNDE });
    await page.getByTestId("mz-monat").selectOption(MONAT);
    await expect(page.getByTestId("mz-ohne-namen")).toContainText("Links ohne Namen");
    await page.getByTestId(`mz-wahl-${gewaehltId}`).check();
    await page.getByTestId("mz-links-erstellen").click();
    await expect(page.getByTestId("mz-meldung")).toContainText("1 Monatslink erstellt");

    await page.getByTestId("mz-ohne-anzahl").fill("3");
    await page.getByTestId("mz-links-ohne-namen").click();
    await expect(page.getByTestId("mz-meldung")).toContainText("3 Monatslinks erstellt (3 ohne Namen)");
    await expect(page.getByTestId("mz-tabelle").locator("tbody tr")).toHaveCount(4);
    await expect(page.getByText("Noch kein Name")).toHaveCount(3);

    const alle = await db.monthSheet.findMany({ where: { organizationId: orgId, batch: { customerId: kundeId, monat: MONAT } }, orderBy: { id: "asc" } });
    batchId = alle[0].batchId;
    batchToken = (await db.monthBatch.findUniqueOrThrow({ where: { id: batchId } })).token;
    const ohne = alle.filter((s) => s.employeeId === null);
    expect(ohne).toHaveLength(3);
    expect(ohne.every((s) => s.nameOffen && s.vorname === null && s.nachname === null)).toBe(true);
    links.push(...ohne.map((s) => ({ id: s.id, token: s.token })));
    const gewaehlt = alle.find((s) => s.employeeId === gewaehltId);
    expect(gewaehlt?.nameOffen).toBe(false);
    gewaehltSheet = { id: gewaehlt!.id, token: gewaehlt!.token };

    // Die Nachricht für einen Link ohne Namen: keine Anrede mit Leerstelle, dafür der Hinweis, zuerst den Namen einzutragen
    const wa = decodeURIComponent((await page.getByTestId(`mz-wa-${links[0].id}`).getAttribute("href")) ?? "");
    expect(wa).toContain(`/e/m/${links[0].token}`);
    expect(wa).toContain("Hallo, bitte trage hier");
    expect(wa).toContain("Trage oben zuerst deinen Vor- und Nachnamen ein.");
    // Die gewählte Person bekommt wie bisher ihre Anrede und keinen Hinweis
    const waPaula = decodeURIComponent((await page.getByTestId(`mz-wa-${gewaehltId}`).getAttribute("href")) ?? "");
    expect(waPaula).toContain("Hallo Paula,");
    expect(waPaula).not.toContain("Trage oben zuerst");
  });
});

test.describe("Links ohne Namen: Person trägt den Namen ein", () => {
  test("Ohne gespeicherten Namen lässt sich nicht unterschreiben; danach entsteht die Person im Stamm", async ({ browser }) => {
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${links[0].token}`);
    await expect(page.getByTestId("mz-name-karte")).toBeVisible();
    await expect(page.getByTestId("mz-name-pill")).toHaveText("Name fehlt noch");
    await expect(page.getByTestId("mz-name-hinweis")).toBeVisible();

    await tagEintragen(page);
    await page.getByTestId("mz-haken").check();
    await unterschreibe(page, "mz-signatur");
    // Tag, Haken und Unterschrift sind da, aber der Name fehlt noch
    await expect(page.getByTestId("mz-abschliessen")).toBeDisabled();

    // Zu kurze Eingaben lassen sich nicht speichern
    await page.getByTestId("mz-vorname").fill("N");
    await page.getByTestId("mz-nachname").fill("F");
    await expect(page.getByTestId("mz-name-speichern")).toBeDisabled();
    await nameSpeichern(page, "Nora", `Frei-${RUN}`);
    await expect(page.getByTestId("mz-name-pill")).toHaveText(`Nora Frei-${RUN}`);
    await expect(page.getByTestId("mz-name-speichern")).toHaveText("✓ Name gespeichert");
    await expect(page.getByTestId("mz-name-hinweis")).toHaveCount(0);

    // Bis zur Unterschrift ist nur der Name vermerkt; im Stamm gibt es die Person noch nicht
    const entwurf = await blatt(links[0].id);
    expect(entwurf).toMatchObject({ employeeId: null, vorname: "Nora", nachname: `Frei-${RUN}`, nameOffen: true });
    expect(await personen("Nora", `Frei-${RUN}`)).toHaveLength(0);

    await page.getByTestId("mz-abschliessen").click();
    await expect(page.getByText("Du hast unterschrieben.")).toBeVisible();
    // Jetzt steht die Person im Stamm (ohne Personalnummer), der Zettel gehört ihr, der Eintrag ist übernommen
    const neu = await personen("Nora", `Frei-${RUN}`);
    expect(neu).toHaveLength(1);
    expect(neu[0].personalnummer).toBeNull();
    const fertig = await blatt(links[0].id);
    expect(fertig).toMatchObject({ employeeId: neu[0].id, vorname: null, nachname: null });
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: neu[0].id }, aktuell: true } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { organizationId: orgId, action: "monatszettel.person_bestimmt", entityId: links[0].id } });
    expect(log.data).toMatchObject({ neu: `Nora Frei-${RUN}`, weg: "angelegt" });
    // Der Name ist jetzt nicht mehr änderbar, solange die Unterschrift gilt
    await expect(page.getByTestId("mz-name-anzeige")).toContainText(`Nora Frei-${RUN}`);
    await expect(page.getByTestId("mz-vorname")).toHaveCount(0);
    await page.context().close();
  });

  test("Bis der Kunde unterschrieben hat, lässt sich der Name ändern – die Person wird umbenannt, nicht doppelt angelegt", async ({ browser }) => {
    const vorher = (await blatt(links[0].id)).employeeId!;
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${links[0].token}`);
    await page.getByTestId("mz-wieder-oeffnen").click();
    await expect(page.getByTestId("mz-vorname")).toHaveValue("Nora");
    await expect(page.getByTestId("mz-nachname")).toHaveValue(`Frei-${RUN}`);
    await nameSpeichern(page, "Nora", `Neu-${RUN}`);
    await expect(page.getByTestId("mz-name-pill")).toHaveText(`Nora Neu-${RUN}`);
    // Vermerkt, aber noch nicht übertragen: der Stamm kennt weiter den alten Namen
    expect(await blatt(links[0].id)).toMatchObject({ vorname: "Nora", nachname: `Neu-${RUN}` });
    expect((await db.employee.findUniqueOrThrow({ where: { id: vorher } })).nachname).toBe(`Frei-${RUN}`);
    await abschliessen(page);
    // Derselbe Datensatz trägt jetzt den neuen Namen; es gibt keinen zweiten
    expect((await db.employee.findUniqueOrThrow({ where: { id: vorher } })).nachname).toBe(`Neu-${RUN}`);
    expect(await personen("Nora", `Frei-${RUN}`)).toHaveLength(0);
    expect(await personen("Nora", `Neu-${RUN}`)).toHaveLength(1);
    expect(await blatt(links[0].id)).toMatchObject({ employeeId: vorher, vorname: null, nachname: null });
    // Der unveränderte Zeiteintrag bekommt keine neue Version
    const zeiten = await db.timeEntry.findMany({ where: { shiftAssignment: { employeeId: vorher } } });
    expect(zeiten.map((t) => [t.version, t.aktuell])).toEqual([[1, true]]);
    const log = await db.auditLog.findFirstOrThrow({ where: { organizationId: orgId, action: "monatszettel.person_bestimmt", entityId: links[0].id }, orderBy: { createdAt: "desc" } });
    expect(log.data).toMatchObject({ weg: "umbenannt" });
    await page.context().close();
  });

  test("Passt der Name zu jemandem im Stamm, wird die Person dort zugeordnet (Schreibweise egal)", async ({ browser }) => {
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${links[1].token}`);
    await tagEintragen(page);
    await nameSpeichern(page, "rita", `real-${RUN}`.toLowerCase());
    await expect(page.getByTestId("mz-name-speichern")).toHaveText("✓ Name gespeichert");
    await abschliessen(page);
    const z = await blatt(links[1].id);
    expect(z.employeeId).toBe(ritaId);
    // Der Stamm bleibt, wie die Dispo ihn führt – kein zweiter Datensatz, keine Umschreibung
    expect(await db.employee.count({ where: { organizationId: orgId, nachname: { equals: RITA.nachname, mode: "insensitive" } } })).toBe(1);
    expect((await db.employee.findUniqueOrThrow({ where: { id: ritaId } })).vorname).toBe("Rita");
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: ritaId }, aktuell: true } })).toBe(1);
    await page.context().close();
  });

  test("Dieselbe Person kann nicht auf zwei Zetteln desselben Monats stehen", async ({ browser }) => {
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${links[2].token}`);
    // Name einer Person, die auf einem anderen Zettel schon steht (im Stamm, neu angelegt und gewählt)
    for (const [v, n] of [["Nora", `Neu-${RUN}`], [RITA.vorname, RITA.nachname], [GEWAEHLT.vorname, GEWAEHLT.nachname]]) {
      await nameSpeichern(page, v, n);
      await expect(page.getByTestId("mz-name-fehler")).toContainText("schon einen Zettel");
    }
    expect(await blatt(links[2].id)).toMatchObject({ employeeId: null, vorname: null, nachname: null });
    await page.context().close();
  });

  test("Ein Wechsel auf jemand anderen aus dem Stamm nimmt die Zeiten mit; der überflüssige Datensatz verschwindet", async ({ browser }) => {
    const page = await neueSeite(browser);
    await page.goto(`/e/m/${links[2].token}`);
    await tagEintragen(page);
    await nameSpeichern(page, "Tom", `Drei-${RUN}`);
    await expect(page.getByTestId("mz-name-speichern")).toHaveText("✓ Name gespeichert");
    await abschliessen(page);
    const tom = (await blatt(links[2].id)).employeeId!;
    expect((await db.employee.findUniqueOrThrow({ where: { id: tom } })).nachname).toBe(`Drei-${RUN}`);

    // Es war doch jemand anders: der Name von Rolf aus dem Stamm
    await page.getByTestId("mz-wieder-oeffnen").click();
    await nameSpeichern(page, ROLF.vorname, ROLF.nachname);
    await expect(page.getByTestId("mz-name-speichern")).toHaveText("✓ Name gespeichert");
    await abschliessen(page);
    expect((await blatt(links[2].id)).employeeId).toBe(rolfId);
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: rolfId }, aktuell: true } })).toBe(1);
    expect(await db.timeEntry.count({ where: { shiftAssignment: { employeeId: tom } } })).toBe(0);
    // Der Datensatz, der nur für diesen Zettel entstanden war, ist weg
    expect(await db.employee.count({ where: { id: tom } })).toBe(0);
    await page.context().close();
  });
});

test.describe("Links ohne Namen: Regeln über die Schnittstelle", () => {
  test("Eingaben werden geprüft, gewählte Personen behalten ihren Namen, nichts Fremdes wird sichtbar", async ({ request }) => {
    const vierter = await db.monthSheet.create({ data: { organizationId: orgId, batchId, nameOffen: true, tokenExpiresAt: new Date(Date.now() + 30 * 86400000) } });
    const put = (token: string, data: object) => request.put(`/api/e/m/${token}`, { data });
    expect((await put(vierter.token, { aktion: "name", vorname: "A", nachname: "B" })).status()).toBe(400);
    expect((await put(vierter.token, { aktion: "name", vorname: "Uwe", nachname: " " })).status()).toBe(400);
    expect((await put(vierter.token, { aktion: "name", vorname: "Uwe" })).status()).toBe(400);
    // Ohne gespeicherten Namen wird keine Unterschrift angenommen
    const tage = [{ id: "x", datum: TAG, start: "08:00", ende: "12:00", pauseMin: 0, taetigkeit: "", fahrten: [], pkwArt: "PRIVAT", spesen: null, sonderabsprache: "", getan: "", notiz: "" }];
    const ohneName = await request.post(`/api/e/m/${vierter.token}`, { data: { tage, unterschrift: unterschriftDataUrl() } });
    expect(ohneName.status()).toBe(400);
    expect((await ohneName.json()).error).toContain("Nachnamen");
    expect((await blatt(vierter.id)).personSignedAt).toBeNull();

    const ok = await put(vierter.token, { aktion: "name", vorname: "  Uwe ", nachname: `Vier-${RUN}` });
    expect(ok.status()).toBe(200);
    const view = (await ok.json()).view;
    expect(view).toMatchObject({ nameOffen: true, nameAenderbar: true, person: { vorname: "Uwe", nachname: `Vier-${RUN}` } });
    // Niemand sieht Namen anderer Zettel
    expect(JSON.stringify(view)).not.toContain(RITA.nachname);
    expect(JSON.stringify(view)).not.toContain(GEWAEHLT.nachname);

    // Eine von der Dispo gewählte Person kann ihren Namen nicht selbst ändern
    const gewaehlt = await put(gewaehltSheet.token, { aktion: "name", vorname: "Anders", nachname: "Heißen" });
    expect(gewaehlt.status()).toBe(403);
    const ansicht = await (await request.get(`/api/e/m/${gewaehltSheet.token}`)).json();
    expect(ansicht).toMatchObject({ nameOffen: false, nameAenderbar: false, person: { vorname: GEWAEHLT.vorname, nachname: GEWAEHLT.nachname } });
    expect((await personen("Anders", "Heißen")).length).toBe(0);
    // Ein erfundener Link bleibt ein erfundener Link
    expect((await put("00000000-0000-4000-8000-000000000000", { aktion: "name", vorname: "Uwe", nachname: "Vier" })).status()).toBe(404);
  });
});

test.describe("Links ohne Namen: Kunde und Sperre", () => {
  test("Der Kunde sieht die eingetragenen Namen und bestätigt; danach ist der Name gesperrt", async ({ browser }) => {
    const kunde = await neueSeite(browser);
    await kunde.goto(`/e/k/${batchToken}`);
    await expect(kunde.getByTestId(`mk-zettel-${links[0].id}`)).toContainText(`Nora Neu-${RUN}`);
    await expect(kunde.getByTestId(`mk-zettel-${links[1].id}`)).toContainText(`${RITA.vorname} ${RITA.nachname}`);
    await expect(kunde.getByTestId(`mk-zettel-${links[2].id}`)).toContainText(`${ROLF.vorname} ${ROLF.nachname}`);
    // Wer noch nichts abgeschlossen hat, steht mit dem bisher eingetragenen Namen oder dem Hinweis da
    const vierter = await db.monthSheet.findFirstOrThrow({ where: { batchId, vorname: "Uwe" } });
    await expect(kunde.getByTestId(`mk-zettel-${vierter.id}`)).toContainText(`Uwe Vier-${RUN}`);
    await expect(kunde.getByTestId(`mk-stand-${vierter.id}`)).toHaveText("noch nichts eingetragen");

    await kunde.getByTestId("mk-name").fill("Frau Berger");
    await kunde.getByTestId("mk-haken").check();
    await unterschreibe(kunde, "mk-signatur");
    await kunde.getByTestId("mk-unterschreiben").click();
    await expect(kunde.getByTestId("mk-fertig")).toContainText("3 Personen");
    await kunde.context().close();

    // Der Name von Nora ist gesperrt, in der Oberfläche wie über die Schnittstelle
    const person = await neueSeite(browser);
    await person.goto(`/e/m/${links[0].token}`);
    await expect(person.getByTestId("mz-name-anzeige")).toContainText(`Nora Neu-${RUN}`);
    await expect(person.getByTestId("mz-name-anzeige")).toContainText("nicht mehr ändern");
    await expect(person.getByTestId("mz-vorname")).toHaveCount(0);
    const r = await person.request.put(`/api/e/m/${links[0].token}`, { data: { aktion: "name", vorname: "Spät", nachname: "Dran" } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toContain("Kunde hat bestätigt");
    expect(await personen("Spät", "Dran")).toHaveLength(0);
    expect((await blatt(links[0].id)).vorname).toBeNull();
    await person.context().close();
  });

  test("Das PDF trägt den Namen, wie er bei der Bestätigung galt; ein Zettel ohne Namen lässt sich als Vorschau öffnen", async ({ page }) => {
    await login(page);
    const doc = await db.document.findFirstOrThrow({ where: { category: "stundennachweis", links: { some: { customerId: kundeId, employeeId: (await blatt(links[0].id)).employeeId! } } } });
    expect(doc.filename).toContain(`Neu-${RUN}`);
    expect(doc.filename).not.toContain(`Frei-${RUN}`);
    const r = await page.request.get(`/api/documents/monatszettel/${links[0].id}`);
    expect(r.status()).toBe(200);
    // Ein Link, in den noch niemand einen Namen eingetragen hat, bricht die Vorschau nicht
    const leer = await db.monthSheet.create({ data: { organizationId: orgId, batchId, nameOffen: true, tokenExpiresAt: new Date(Date.now() + 30 * 86400000) } });
    const v = await page.request.get(`/api/documents/monatszettel/${leer.id}`);
    expect(v.status()).toBe(200);
    expect((await v.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Dashboard und Detailseite zeigen ihn als „Noch kein Name“
    await page.goto(`/einsaetze/monatszettel/${leer.id}`);
    await expect(page.getByTestId("mz-detail")).toContainText("Name noch nicht eingetragen");
    await page.goto(`/einsaetze/monatszettel?kunde=${kundeId}&monat=${MONAT}`);
    await expect(page.getByTestId(`mz-name-${leer.id}`)).toHaveText("Noch kein Name");
    // …und leere Links lassen sich entfernen
    await page.getByRole("button", { name: "Link für ohne Namen entfernen" }).first().click();
    await expect(page.getByTestId("mz-meldung")).toContainText("Link entfernt");
    expect(await db.monthSheet.count({ where: { id: leer.id } })).toBe(0);
  });
});
