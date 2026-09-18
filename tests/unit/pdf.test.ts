// Rendert beide PDF-Layouts serverseitig (react-pdf, kein Browser) – prüft,
// dass gültige PDFs mit den erwarteten Metadaten entstehen.
import { describe, expect, it } from "vitest";
import { renderKonkretisierung } from "@/lib/einsatz/pdf/konkretisierung";
import { renderStundennachweis } from "@/lib/einsatz/pdf/stundennachweis";

// 1×1-PNG als Platzhalter-Unterschrift
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("PDF-Layouts", () => {
  it("Konkretisierung", async () => {
    const buf = await renderKonkretisierung({
      einsatznummer: "2026-0918-01",
      projekt: "Reezy",
      artist: "Reezy",
      entleiher: { name: "Mannheimer Power GmbH", adresse: "Hafenstraße 12, 68159 Mannheim", ansprechpartner: "Jonas Keller" },
      einsatzort: "Porsche Arena Stuttgart",
      datumVon: "18.09.2026",
      datumBis: "19.09.2026",
      einsatzbereich: "Veranstaltungstechnik",
      aueVertragRef: "AÜV-2026-014",
      erstelltAm: "17.09.2026",
      zeilen: [{ nr: 1, name: "Mohammad Alhariri", schicht: "Call 2", beginn: "18.09.2026 08:00", ende: "18.09.2026 16:00", taetigkeit: "Hands", funktion: "Mitarbeiter" }],
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("Stundennachweis mit Unterschriften, Fahrten, Kunde und Anlage", async () => {
    const buf = await renderStundennachweis({
      einsatznummer: "2026-0918-01",
      projekt: "Reezy",
      artist: null,
      entleiher: { name: "Mannheimer Power GmbH", adresse: null },
      einsatzort: "Porsche Arena Stuttgart",
      datumVon: "18.09.2026",
      datumBis: "18.09.2026",
      einsatzbereich: null,
      aueVertragRef: null,
      erstelltAm: "19.09.2026",
      zeilen: [
        { nr: 1, name: "Mohammad Alhariri", schicht: "Call 2", datum: "18.09.2026", start: "08:00", pause: "30 min", ende: "16:00", gesamt: "7,50", taetigkeit: "Hands", pkw: "privat", spesen: "ja", notiz: "", signature: PNG, unterschriftZeitpunkt: "18.09.2026 16:05", status: "unterschrieben" },
        { nr: 2, name: "Samira Gülhan", schicht: "Frühschicht", datum: "18.09.2026", start: "(08:00)", pause: "–", ende: "(16:00)", gesamt: "–", taetigkeit: "Cateringhilfen", pkw: "–", spesen: "–", notiz: "Plan, nicht erfasst", signature: null, unterschriftZeitpunkt: null, status: "offen" },
      ],
      fahrten: [{ person: "Mohammad Alhariri", fahrzeugart: "Privat-PKW", strecken: [{ von: "Göppingen", nach: "Stuttgart", km: "45,0" }], summe: "45,0" }],
      kunde: { name: "Jonas Keller", signature: PNG, zeitpunkt: "18.09.2026 23:10" },
      summeStunden: "7,50",
      unterweisungVersion: "1.0",
      hinweise: ["1 Person(en) ohne Unterschrift"],
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    // Zwei Seiten (Nachweis + Anlage) → mindestens zwei Page-Objekte
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
