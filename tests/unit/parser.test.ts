import { describe, expect, it } from "vitest";
import { analyseParsed, normalizeName, parseHeuristic, suggestEnd } from "@/lib/einsatz/parser";
import { SAMPLE } from "../fixtures/sample";


describe("Heuristik-Parser", () => {
  it("liest den Beispiel-Rohtext vollständig", () => {
    const p = parseHeuristic(SAMPLE);
    expect(p.artist).toBe("Reezy");
    expect(p.projekt).toBe("Reezy");
    expect(p.einsatzort).toBe("Porsche Arena Stuttgart");
    expect(p.kunde).toBe("Mannheimer Power GmbH");
    expect(p.datum).toBe("2026-09-18");
    expect(p.schichten).toHaveLength(3);

    const [call2, frueh, loadOut] = p.schichten;
    expect(call2).toMatchObject({ bezeichnung: "Call 2", start: "08:00", ende: null, anzahlSoll: 2, taetigkeit: "Hands", datum: "2026-09-18" });
    expect(call2.personen.map((x) => x.name)).toEqual(["Mohammad Alhariri", "Saad Mohammad Hassan"]);
    expect(frueh).toMatchObject({ bezeichnung: "Frühschicht", anzahlSoll: 2, taetigkeit: "Cateringhilfen" });
    expect(frueh.personen.map((x) => x.name)).toEqual(["Mohammad Salama Alsmman", "Samira Gülhan"]);
    expect(loadOut).toMatchObject({ bezeichnung: "Load-Out", start: "21:30", anzahlSoll: 4, taetigkeit: "Hands" });
    expect(loadOut.personen.map((x) => x.name)).toEqual(["Manitarun Sundaram", "Mohammad Alhariri", "Assurance Erhis", "Ibrahim Bouriahi"]);
    expect(loadOut.personen.every((x) => x.rolle === "mitarbeiter")).toBe(true);
  });

  it("überspringt Trennlinien und Dateiüberschriften", () => {
    // So sieht der Rohtext aus, wenn mehrere angehängte Dateien zusammenkommen
    const p = parseHeuristic(`--- ablaufplan.txt ---
Artist: Reezy
Aufbau | 07:00 Uhr | 1x Hands
Tobias Krämer
=====
--- nachtrag.txt ---
Abbau | 22:00 Uhr | 1x Hands
Jana Weidner`);
    expect(p.artist).toBe("Reezy");
    expect(p.projekt).toBe("Reezy");
    expect(p.schichten.map((s) => s.bezeichnung)).toEqual(["Aufbau", "Abbau"]);
    expect(p.schichten.flatMap((s) => s.personen.map((x) => x.name))).toEqual(["Tobias Krämer", "Jana Weidner"]);
  });

  it("liest Zeitspannen, Rollen und einzeilige Kopfzeilen", () => {
    const p = parseHeuristic(`Projekt: Messeaufbau
Datum: 3.10.26
Aufbau 07:00 - 15:30 Uhr 3x Stagehands
- Max Mustermann (AP)
- Erika Beispiel
- Kai Muster (Spare)`);
    expect(p.schichten[0]).toMatchObject({ bezeichnung: "Aufbau", start: "07:00", ende: "15:30", anzahlSoll: 3, datum: "2026-10-03" });
    expect(p.schichten[0].personen).toEqual([
      { name: "Max Mustermann", rolle: "ansprechpartner" },
      { name: "Erika Beispiel", rolle: "mitarbeiter" },
      { name: "Kai Muster", rolle: "spare" },
    ]);
  });
});

describe("Analyse", () => {
  it("meldet Dubletten, fehlende Nachnamen, Soll-Abweichung und fehlende Endzeit", () => {
    const p = analyseParsed(
      parseHeuristic(`Kunde: Test GmbH
Ort: Halle
Arbeitsbeginn 18.09.2026:
Aufbau | 08:00 Uhr | 2x Hands
Mohammad Alhariri
Mohammad Alhariri
Sami`)
    );
    expect(p.hinweise.some((h) => h.includes("2× eingetragen"))).toBe(true);
    expect(p.hinweise.some((h) => h.includes("keinen Nachnamen"))).toBe(true);
    expect(p.hinweise.some((h) => h.includes("Soll 2"))).toBe(true);
    expect(p.hinweise.some((h) => h.includes("Endzeit fehlt"))).toBe(true);
  });

  it("normalisiert Namen ohne Diakritika und schlägt Endzeiten über Mitternacht vor", () => {
    expect(normalizeName("Samira Gülhan")).toBe("samira gulhan");
    expect(suggestEnd("2026-09-18", "21:30")).toEqual({ datum: "2026-09-19", ende: "05:30" });
    expect(suggestEnd("2026-09-18", "08:00")).toEqual({ datum: "2026-09-18", ende: "16:00" });
  });
});
