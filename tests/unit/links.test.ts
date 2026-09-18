import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrl, crewLinkUrl, employeeLinkUrl, whatsappText } from "@/lib/einsatz/mail";

const TOKEN = "11111111-2222-3333-4444-555555555555";

afterEach(() => {
  delete process.env.APP_BASE_URL;
});

describe("Mitarbeiter-Link-Adressen", () => {
  it("nutzt APP_BASE_URL und entfernt einen Schrägstrich am Ende", () => {
    process.env.APP_BASE_URL = "https://app.example.com/";
    expect(employeeLinkUrl(TOKEN)).toBe(`https://app.example.com/e/${TOKEN}`);
    expect(crewLinkUrl(TOKEN)).toBe(`https://app.example.com/e/crew/${TOKEN}`);
  });

  it("fällt ohne Variable auf die Adresse aus dem Aufruf zurück (vollständiger Link fürs Handy)", () => {
    expect(employeeLinkUrl(TOKEN, "https://incub.up.railway.app")).toBe(`https://incub.up.railway.app/e/${TOKEN}`);
    expect(appBaseUrl("https://incub.up.railway.app/")).toBe("https://incub.up.railway.app");
  });

  it("die Variable hat Vorrang vor der abgeleiteten Adresse", () => {
    process.env.APP_BASE_URL = "https://gesetzt.example.com";
    expect(employeeLinkUrl(TOKEN, "https://abgeleitet.example.com")).toBe(`https://gesetzt.example.com/e/${TOKEN}`);
  });

  it("der WhatsApp-Text enthält den vollständigen Link", () => {
    const text = whatsappText(
      {
        vorname: "Samira",
        projekt: "Reezy",
        kunde: "Mannheimer Power GmbH",
        einsatzort: "Porsche Arena Stuttgart",
        bezeichnung: "Load-Out",
        planStart: new Date("2026-09-18T19:30:00Z"),
        planEnde: new Date("2026-09-19T01:30:00Z"),
        treffpunkt: "Tor 3",
        token: TOKEN,
      },
      "https://incub.up.railway.app"
    );
    expect(text).toContain(`https://incub.up.railway.app/e/${TOKEN}`);
    expect(text).not.toMatch(/\n\/e\//);
  });
});

describe("Leere Variable", () => {
  it("eine leer angelegte APP_BASE_URL blockiert den Fallback nicht", () => {
    process.env.APP_BASE_URL = "";
    expect(employeeLinkUrl(TOKEN, "https://incub.up.railway.app")).toBe(`https://incub.up.railway.app/e/${TOKEN}`);
    process.env.APP_BASE_URL = "   ";
    expect(employeeLinkUrl(TOKEN, "https://incub.up.railway.app")).toBe(`https://incub.up.railway.app/e/${TOKEN}`);
  });

  it("ohne jede Angabe bleibt der Pfad relativ (Altverhalten, kein Absturz)", () => {
    expect(employeeLinkUrl(TOKEN)).toBe(`/e/${TOKEN}`);
  });
});
