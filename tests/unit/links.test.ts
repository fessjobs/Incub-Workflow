import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrl, crewLinkUrl, employeeLinkUrl, gruppenText, whatsappShareUrl, whatsappText } from "@/lib/einsatz/mail";
import { schichtlinkeFor } from "@/lib/einsatz/service/links";

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

describe("Gruppennachricht (ein Link für alle)", () => {
  const eingabe = {
    projekt: "Reezy",
    kunde: "Mannheimer Power GmbH",
    einsatzort: "Porsche Arena Stuttgart",
    datumVon: new Date("2026-09-18T06:00:00Z"),
    datumBis: new Date("2026-09-18T06:00:00Z"),
    schichten: [
      { bezeichnung: "Aufbau", planStart: new Date("2026-09-18T06:00:00Z"), planEnde: new Date("2026-09-18T14:00:00Z"), treffpunkt: "Tor 3" },
      { bezeichnung: "Load-Out", planStart: new Date("2026-09-18T19:30:00Z"), planEnde: new Date("2026-09-19T01:30:00Z"), treffpunkt: null },
    ],
    crewToken: TOKEN,
  };

  it("nennt alle Schichten und genau einen Link", () => {
    const text = gruppenText(eingabe, "https://incub.up.railway.app");
    expect(text).toContain("Mannheimer Power GmbH – Reezy");
    expect(text).toContain("18.09.2026");
    expect(text).toContain("Aufbau: 08:00–16:00 Uhr (Treffpunkt: Tor 3)");
    expect(text).toContain("Load-Out: 21:30–03:30 Uhr");
    expect(text.match(/https:\/\//g)).toHaveLength(1);
    expect(text).toContain(`https://incub.up.railway.app/e/crew/${TOKEN}`);
    // keine persönliche Anrede – die Nachricht geht in die Gruppe
    expect(text).not.toMatch(/^Hallo /m);
  });

  it("zeigt bei mehrtägigen Einsätzen den Tag je Schicht", () => {
    const text = gruppenText({ ...eingabe, datumBis: new Date("2026-09-19T06:00:00Z") }, "https://incub.up.railway.app");
    expect(text).toContain("18.09.2026 – 19.09.2026");
    expect(text).toContain("Aufbau: 18.09.2026, 08:00–16:00 Uhr");
  });

  it("baut einen wa.me-Link mit kodiertem Text", () => {
    const url = whatsappShareUrl("Hallo Welt & mehr");
    expect(url).toBe("https://wa.me/?text=Hallo%20Welt%20%26%20mehr");
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

describe("Link je Schicht", () => {
  const TOKEN_AUFBAU = "aaaaaaaa-2222-3333-4444-555555555555";
  const TOKEN_LOADOUT = "bbbbbbbb-2222-3333-4444-555555555555";

  // Nur die Felder, die schichtlinkeFor liest – der Rest des Einsatzes ist
  // für die Linkbildung ohne Belang.
  function einsatz(opts: { tokens?: Array<string | null>; storniert?: boolean; unterschrieben?: boolean } = {}) {
    const [t1, t2] = opts.tokens ?? [TOKEN_AUFBAU, TOKEN_LOADOUT];
    return {
      projekt: "Reezy",
      customer: { name: "Mannheimer Power GmbH" },
      einsatzort: "Porsche Arena Stuttgart",
      datumVon: new Date("2026-09-18T00:00:00Z"),
      datumBis: new Date("2026-09-19T00:00:00Z"),
      crewToken: TOKEN,
      shifts: [
        {
          id: "s1",
          bezeichnung: "Aufbau",
          taetigkeit: "Hands",
          planStart: new Date("2026-09-18T06:00:00Z"),
          planEnde: new Date("2026-09-18T14:00:00Z"),
          treffpunkt: "Tor 3",
          crewToken: t1,
          assignments: [
            { status: "ERFASST", timeEntries: [{ unterschriftZeitpunkt: opts.unterschrieben ? new Date() : null }] },
            { status: opts.storniert ? "STORNIERT" : "GEPLANT", timeEntries: [] },
          ],
        },
        {
          id: "s2",
          bezeichnung: "Load-Out",
          taetigkeit: "Hands",
          planStart: new Date("2026-09-19T19:30:00Z"),
          planEnde: new Date("2026-09-20T01:30:00Z"),
          treffpunkt: null,
          crewToken: t2,
          assignments: [{ status: "GEPLANT", timeEntries: [] }],
        },
      ],
    } as unknown as Parameters<typeof schichtlinkeFor>[0];
  }

  it("je Schicht ein eigener Link mit eigenem Token", () => {
    const links = schichtlinkeFor(einsatz(), "https://incub.up.railway.app");
    expect(links.map((l) => l.shiftId)).toEqual(["s1", "s2"]);
    expect(links[0].url).toBe(`https://incub.up.railway.app/e/crew/${TOKEN_AUFBAU}`);
    expect(links[1].url).toBe(`https://incub.up.railway.app/e/crew/${TOKEN_LOADOUT}`);
    // nicht der Token des ganzen Einsatzes
    expect(links[0].url).not.toContain(TOKEN);
  });

  it("die Nachricht nennt nur diese Schicht und sagt das auch", () => {
    const [aufbau] = schichtlinkeFor(einsatz(), "https://incub.up.railway.app");
    expect(aufbau.whatsapp).toContain("Mannheimer Power GmbH – Reezy · Aufbau");
    expect(aufbau.whatsapp).toContain("Aufbau: 08:00–16:00 Uhr (Treffpunkt: Tor 3)");
    expect(aufbau.whatsapp).not.toContain("Load-Out");
    expect(aufbau.whatsapp).toContain("gilt nur für diese Schicht");
    // der Tag der Schicht, nicht die Spanne des Einsatzes
    expect(aufbau.whatsapp).toContain("18.09.2026");
    expect(aufbau.whatsapp).not.toContain("18.09.2026 – 19.09.2026");
    expect(aufbau.whatsapp.match(/https:\/\//g)).toHaveLength(1);
    expect(aufbau.teilen).toContain("https://wa.me/?text=");
  });

  it("Zeit, Datum und Zähler stehen an der Schicht", () => {
    const [aufbau] = schichtlinkeFor(einsatz({ unterschrieben: true }), "https://x.example.com");
    expect(aufbau.datumDE).toBe("18.09.2026");
    expect(aufbau.zeit).toBe("08:00–16:00");
    expect(aufbau.personen).toBe(2);
    expect(aufbau.unterschrieben).toBe(1);
  });

  it("stornierte Einteilungen zählen nicht mit", () => {
    const [aufbau] = schichtlinkeFor(einsatz({ storniert: true }), "https://x.example.com");
    expect(aufbau.personen).toBe(1);
  });

  it("ohne Token (Altbestand) und ohne Besetzung entsteht kein Link", () => {
    expect(schichtlinkeFor(einsatz({ tokens: [null, TOKEN_LOADOUT] }), "https://x.example.com").map((l) => l.shiftId)).toEqual(["s2"]);
  });

  it("der Kunde darf nur unterschreiben, wenn die Schicht die einzige ist", () => {
    const mehrere = schichtlinkeFor(einsatz(), "https://x.example.com");
    expect(mehrere.every((l) => l.kundeMoeglich)).toBe(false);
    const eine = einsatz();
    eine.shifts = [eine.shifts[0]];
    expect(schichtlinkeFor(eine, "https://x.example.com")[0].kundeMoeglich).toBe(true);
  });
});
