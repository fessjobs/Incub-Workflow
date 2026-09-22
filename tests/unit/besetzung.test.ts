import { describe, expect, it } from "vitest";
import { bearbeitbarkeit, nameKey, namenAusText, teileEingabe, zeitvorgabeVon } from "@/lib/einsatz/service/besetzung";

describe("Namen aus eingefügtem Text", () => {
  it("liest eine Person je Zeile", () => {
    expect(namenAusText("Mohammad Alhariri\nJana Weidner\n").map((n) => n.name)).toEqual(["Mohammad Alhariri", "Jana Weidner"]);
  });

  it("dreht „Nachname, Vorname“ um", () => {
    expect(namenAusText("Gülhan, Samira").map((n) => n.name)).toEqual(["Samira Gülhan"]);
    expect(namenAusText("von der Heide, Jana").map((n) => n.name)).toEqual(["Jana von der Heide"]);
  });

  it("behandelt mehrere Namen in einer Zeile als Aufzählung", () => {
    // Drei Teile → Liste, nicht Nachname/Vorname
    expect(namenAusText("Max Mustermann, Erika Musterfrau, Jana Weidner").map((n) => n.name)).toEqual(["Max Mustermann", "Erika Musterfrau", "Jana Weidner"]);
    expect(namenAusText("Max Mustermann; Jana Weidner").map((n) => n.name)).toEqual(["Max Mustermann", "Jana Weidner"]);
  });

  it("entfernt Aufzählungszeichen und erkennt Rollen", () => {
    const n = namenAusText("- Tobias Krämer (AP)\n2) Jana Weidner\n• Ali Demir (Spare)");
    expect(n.map((x) => x.name)).toEqual(["Tobias Krämer", "Jana Weidner", "Ali Demir"]);
    expect(n.map((x) => x.rolle)).toEqual(["ANSPRECHPARTNER", "MITARBEITER", "SPARE"]);
  });

  it("überspringt Kopf-, Schicht- und Trennzeilen eines mitkopierten Plans", () => {
    const n = namenAusText(`Kunde: Mannheimer Power GmbH
Arbeitsbeginn 18.09.2026:
Load-Out | 21:30 Uhr | 4x Hands
---
Mohammad Alhariri
Jana Weidner`);
    expect(n.map((x) => x.name)).toEqual(["Mohammad Alhariri", "Jana Weidner"]);
  });

  it("wirft Dubletten raus, unabhängig von der Schreibreihenfolge", () => {
    const n = namenAusText("Samira Gülhan\nGülhan, Samira\nSAMIRA GÜLHAN");
    expect(n).toHaveLength(1);
  });

  it("ignoriert Zeilen ohne Buchstaben", () => {
    expect(namenAusText("42\n07:00\n \nJana Weidner").map((x) => x.name)).toEqual(["Jana Weidner"]);
  });
});

describe("Namensschlüssel", () => {
  it("erkennt dieselbe Person unabhängig von Reihenfolge und Schreibweise", () => {
    expect(nameKey("Samira", "Gülhan")).toBe(nameKey("Gülhan", "Samira"));
    expect(nameKey("SAMIRA", "gülhan")).toBe(nameKey("Samira", "Gülhan"));
    expect(nameKey("Max", "Mustermann")).not.toBe(nameKey("Max", "Musterfrau"));
  });

  it("räumt Leerraum auf, ohne Doppelnamen zu zerstören", () => {
    expect(teileEingabe("  Saad  Mohammad ", " Hassan ")).toEqual({ vorname: "Saad Mohammad", nachname: "Hassan" });
  });
});

describe("Was wann geändert werden darf", () => {
  const leer = { status: "KONKRETISIERT", confirmations: [], shifts: [] };
  const mitEintrag = (t: { review: string; unterschriftZeitpunkt: Date | null }) => ({
    status: "LAUFEND",
    confirmations: [],
    shifts: [{ assignments: [{ timeEntries: [t] }] }],
  });

  it("solange nichts unterschrieben ist, ist alles offen", () => {
    const b = bearbeitbarkeit(leer);
    expect(b).toMatchObject({ kopf: true, schichten: true, besetzung: true, namen: true, grund: null });
  });

  it("nach der ersten Unterschrift bleiben Kopf und Besetzung offen, Schichtzeiten nicht", () => {
    const b = bearbeitbarkeit(mitEintrag({ review: "ERFASST", unterschriftZeitpunkt: new Date() }));
    expect(b).toMatchObject({ kopf: true, schichten: false, besetzung: true });
    expect(b.grund).toMatch(/Zeitkorrektur/);
  });

  it("nach der Kundenbestätigung sind nur noch Namen änderbar", () => {
    const b = bearbeitbarkeit({ ...leer, confirmations: [{}] });
    expect(b).toMatchObject({ kopf: false, schichten: false, besetzung: false, namen: true });
    expect(b.grund).toMatch(/Kunde/);
  });

  it("freigegebene Zeiten sperren alles außer den Namen", () => {
    const b = bearbeitbarkeit(mitEintrag({ review: "FREIGEGEBEN", unterschriftZeitpunkt: new Date() }));
    expect(b).toMatchObject({ kopf: false, schichten: false, besetzung: false, namen: true });
    expect(b.grund).toMatch(/freigegeben/);
  });

  it("ein abgeschlossener Einsatz ist zu", () => {
    expect(bearbeitbarkeit({ ...leer, status: "ABGESCHLOSSEN" })).toMatchObject({ kopf: false, schichten: false, besetzung: false, namen: true });
  });
});

describe("Zeitvorgabe je Schicht", () => {
  const leer = { vorgabeStart: null, vorgabeEnde: null, vorgabePause: null, vorgabeVon: null, vorgabeAm: null };

  it("ohne gesetzte Vorgabe gibt es keine", () => {
    expect(zeitvorgabeVon(leer)).toBeNull();
    // Halb gesetzt zählt nicht – sonst stünde im Formular eine Zeit ohne Ende
    expect(zeitvorgabeVon({ ...leer, vorgabeStart: new Date("2026-09-18T05:00:00Z") })).toBeNull();
  });

  it("rechnet die gespeicherten Zeitpunkte in Berliner Zeit um", () => {
    const v = zeitvorgabeVon({
      vorgabeStart: new Date("2026-09-18T05:00:00Z"),
      vorgabeEnde: new Date("2026-09-18T13:30:00Z"),
      vorgabePause: 45,
      vorgabeVon: "Samira Gülhan",
      vorgabeAm: new Date("2026-09-18T14:00:00Z"),
    });
    expect(v).toMatchObject({ startDatum: "2026-09-18", start: "07:00", endeDatum: "2026-09-18", ende: "15:30", pauseMinuten: 45, von: "Samira Gülhan" });
  });

  it("trägt eine Schicht über Mitternacht richtig aus", () => {
    const v = zeitvorgabeVon({
      vorgabeStart: new Date("2026-09-18T19:30:00Z"),
      vorgabeEnde: new Date("2026-09-19T01:30:00Z"),
      vorgabePause: 0,
      vorgabeVon: "Ali Demir",
      vorgabeAm: new Date(),
    });
    expect(v).toMatchObject({ startDatum: "2026-09-18", start: "21:30", endeDatum: "2026-09-19", ende: "03:30" });
  });

  it("eine Pause von 0 Minuten ist eine gültige Vorgabe", () => {
    const v = zeitvorgabeVon({ vorgabeStart: new Date("2026-09-18T05:00:00Z"), vorgabeEnde: new Date("2026-09-18T13:00:00Z"), vorgabePause: 0, vorgabeVon: "X", vorgabeAm: new Date() });
    expect(v?.pauseMinuten).toBe(0);
  });
});
