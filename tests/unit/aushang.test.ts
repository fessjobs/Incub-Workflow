import { describe, expect, it } from "vitest";
import { aushangText, ortTeile } from "@/lib/einsatz/mail";
import { fromBerlin } from "@/lib/einsatz/tz";

const basis = {
  projekt: "Apache Tour",
  artist: "APACHE 207",
  einsatzort: "Lanxess Arena, Köln",
};

function schicht(datum: string, start: string, ende: string, offen: number, extra: Partial<{ bezeichnung: string; taetigkeit: string; treffpunkt: string | null }> = {}) {
  return {
    bezeichnung: extra.bezeichnung ?? "Load-In",
    taetigkeit: extra.taetigkeit ?? "Stagehands",
    planStart: fromBerlin(datum, start),
    planEnde: fromBerlin(datum, ende),
    treffpunkt: extra.treffpunkt ?? null,
    offen,
  };
}

describe("Ort in Halle und Stadt zerlegen", () => {
  it("trennt am Komma", () => {
    expect(ortTeile("Lanxess Arena, Köln")).toEqual({ halle: "Lanxess Arena", stadt: "Köln" });
  });

  it("ohne Komma ist das letzte Wort die Stadt", () => {
    expect(ortTeile("Porsche Arena Stuttgart")).toEqual({ halle: "Porsche Arena Stuttgart", stadt: "Stuttgart" });
  });

  it("ein einzelnes Wort bleibt ohne Stadt", () => {
    expect(ortTeile("Festhalle")).toEqual({ halle: "Festhalle", stadt: "" });
  });
});

describe("Aushang für die WhatsApp-Gruppe", () => {
  it("heutiger Abend: Kopfzeile, Datum und Ansprache stimmen", () => {
    const text = aushangText({ ...basis, heute: "2026-10-06", schichten: [schicht("2026-10-06", "21:15", "23:59", 15)] });
    expect(text).toContain("🚨 KURZFRISTIGER EINSATZ HEUTE 🚨");
    expect(text).toContain("🎤 APACHE 207 in Köln");
    expect(text).toContain("📅 Heute, Dienstag 06.10.");
    expect(text).toContain("⏰ Call: 21:15 Uhr");
    expect(text).toContain("📍 Lanxess Arena");
    expect(text).toContain("👥 Gesucht: 15x Stagehands");
    expect(text).toContain("Wer heute Abend kann, bitte auf die Nachricht mit „👍🏻“ reagieren");
    expect(text).toContain("Danke euch 💪");
  });

  it("tagsüber heute heißt es nur „heute“", () => {
    const text = aushangText({ ...basis, heute: "2026-10-06", schichten: [schicht("2026-10-06", "09:00", "17:00", 4)] });
    expect(text).toContain("Wer heute kann,");
  });

  it("morgen und später bekommen eigene Kopfzeilen", () => {
    const morgen = aushangText({ ...basis, heute: "2026-10-06", schichten: [schicht("2026-10-07", "09:00", "17:00", 4)] });
    expect(morgen).toContain("🚨 KURZFRISTIGER EINSATZ MORGEN 🚨");
    expect(morgen).toContain("📅 Morgen, Mittwoch 07.10.");
    expect(morgen).toContain("Wer morgen kann,");

    const spaeter = aushangText({ ...basis, heute: "2026-10-06", schichten: [schicht("2026-10-12", "09:00", "17:00", 4)] });
    expect(spaeter).toContain("🚨 EINSATZ AM 12.10. 🚨");
    expect(spaeter).toContain("📅 Montag 12.10.");
    expect(spaeter).toContain("Wer am 12.10. kann,");
  });

  it("mehrere Schichten: je Schicht eine Call-Zeit, Tätigkeiten summiert", () => {
    const text = aushangText({
      ...basis,
      heute: "2026-10-06",
      schichten: [
        schicht("2026-10-06", "08:00", "14:00", 6, { bezeichnung: "Load-In" }),
        schicht("2026-10-06", "22:00", "23:59", 4, { bezeichnung: "Load-Out" }),
      ],
    });
    expect(text).toContain("⏰ Call Load-In: 08:00 Uhr");
    expect(text).toContain("⏰ Call Load-Out: 22:00 Uhr");
    expect(text).toContain("👥 Gesucht: 10x Stagehands");
  });

  it("verschiedene Tätigkeiten stehen einzeln", () => {
    const text = aushangText({
      ...basis,
      heute: "2026-10-06",
      schichten: [schicht("2026-10-06", "08:00", "14:00", 6), schicht("2026-10-06", "08:00", "14:00", 2, { taetigkeit: "Rigger" })],
    });
    expect(text).toContain("👥 Gesucht: 6x Stagehands, 2x Rigger");
  });

  it("ist die Schicht voll, fehlt die Gesucht-Zeile", () => {
    const text = aushangText({ ...basis, heute: "2026-10-06", schichten: [schicht("2026-10-06", "08:00", "14:00", 0)] });
    expect(text).not.toContain("👥 Gesucht");
    expect(text).toContain("🎤 APACHE 207 in Köln");
  });

  it("ein Treffpunkt steht mit drin, ohne Artist zählt das Projekt", () => {
    const text = aushangText({
      ...basis,
      artist: null,
      heute: "2026-10-06",
      schichten: [schicht("2026-10-06", "08:00", "14:00", 3, { treffpunkt: "Tor 3" })],
    });
    expect(text).toContain("🎤 Apache Tour in Köln");
    expect(text).toContain("🚪 Treffpunkt: Tor 3");
  });
});
