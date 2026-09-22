// PDF-Stammdatenimport mit gemocktem Claude-Aufruf: geht das PDF als
// Dokument-Block raus, und wird die Antwort sauber in eine Tabelle überführt?
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Anthropic {
    static APIError = APIError;
    messages = { parse: parseMock };
  }
  return { default: Anthropic };
});

import { parsePdfTabelle } from "@/lib/einsatz/import/pdf-tabelle";
import { parseTabelle } from "@/lib/einsatz/import/parse-table";
import { erkenneSpalten } from "@/lib/einsatz/import/parse-table";
import { leseMitarbeiterZeile } from "@/lib/einsatz/import/stammdaten";

const PDF = Buffer.from("%PDF-1.7\nfake");

function antwort(kopf: string[], zeilen: string[][]) {
  return { stop_reason: "end_turn", parsed_output: { kopf, zeilen }, content: [] };
}

describe("PDF-Liste auslesen", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("schickt das PDF als Dokument-Block vor dem Text", async () => {
    parseMock.mockResolvedValue(antwort(["Personalnummer", "Name"], [["10001", "Mustermann, Max"]]));
    await parsePdfTabelle(PDF, "personal.pdf");

    const args = parseMock.mock.calls[0][0];
    const bloecke = args.messages[0].content as Array<Record<string, unknown>>;
    expect(bloecke.map((b) => b.type)).toEqual(["document", "text"]);
    expect(bloecke[0].source).toMatchObject({ type: "base64", media_type: "application/pdf", data: PDF.toString("base64") });
    expect(String(bloecke[1].text)).toContain("personal.pdf");
    expect(args.output_config?.format?.type).toBe("json_schema");
  });

  it("liefert dieselbe Tabellenform wie CSV und Excel", async () => {
    parseMock.mockResolvedValue(antwort(["Pers.-Nr", "Vorname", "Nachname"], [["10001", "Max", "Mustermann"]]));
    const t = await parsePdfTabelle(PDF, "personal.pdf");
    expect(t).toEqual({ kopf: ["Pers.-Nr", "Vorname", "Nachname"], zeilen: [["10001", "Max", "Mustermann"]], quelle: "pdf" });

    // …und läuft damit durch dieselbe Spaltenerkennung
    const sp = erkenneSpalten(t.kopf, [
      { feld: "personalnummer", muster: /^(persnr|personalnummer)$/ },
      { feld: "vorname", muster: /^vorname$/ },
      { feld: "nachname", muster: /^nachname$/ },
    ]);
    expect(sp).toEqual({ personalnummer: 0, vorname: 1, nachname: 2 });
    expect(leseMitarbeiterZeile(t.zeilen[0], { ...sp, name: -1, email: -1, mobil: -1, geburtsdatum: -1, zulagen: -1, status: -1 }).satz).toMatchObject({
      vorname: "Max",
      nachname: "Mustermann",
      personalnummer: "10001",
    });
  });

  it("bringt krumme Zeilen auf die Kopfbreite und wirft leere raus", async () => {
    parseMock.mockResolvedValue(
      antwort(
        ["Vorname", "Nachname", "E-Mail"],
        [
          ["Max", "Mustermann"], // zu kurz → auffüllen
          ["Erika", "Musterfrau", "e@fess.jobs", "zuviel"], // zu lang → kappen
          ["", "", ""], // leer → raus
          [" Jana ", " Weidner ", ""], // Leerraum → getrimmt
        ]
      )
    );
    const t = await parsePdfTabelle(PDF, "personal.pdf");
    expect(t.zeilen).toEqual([
      ["Max", "Mustermann", ""],
      ["Erika", "Musterfrau", "e@fess.jobs"],
      ["Jana", "Weidner", ""],
    ]);
  });

  it("sagt klar Bescheid, wenn nichts drinsteht", async () => {
    parseMock.mockResolvedValue(antwort([], []));
    await expect(parsePdfTabelle(PDF, "leer.pdf")).rejects.toThrow(/keine Tabelle/);
    parseMock.mockResolvedValue(antwort(["Vorname", "Nachname"], []));
    await expect(parsePdfTabelle(PDF, "leer.pdf")).rejects.toThrow(/keine Zeile/);
  });

  it("reicht Ablehnung und unlesbare Antworten als Klartext weiter", async () => {
    parseMock.mockResolvedValue({ stop_reason: "refusal", parsed_output: null, content: [] });
    await expect(parsePdfTabelle(PDF, "x.pdf")).rejects.toThrow(/abgelehnt/);
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null, content: [] });
    await expect(parsePdfTabelle(PDF, "x.pdf")).rejects.toThrow(/nicht als Tabelle lesbar/);
  });

  it("ohne API-Schlüssel steht die Alternative in der Meldung", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(parsePdfTabelle(PDF, "x.pdf")).rejects.toThrow(/ANTHROPIC_API_KEY/);
    await expect(parsePdfTabelle(PDF, "x.pdf")).rejects.toThrow(/Excel oder CSV/);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("parseTabelle leitet PDFs selbst weiter – an Endung und Signatur", async () => {
    parseMock.mockResolvedValue(antwort(["Vorname", "Nachname"], [["Max", "Mustermann"]]));
    expect((await parseTabelle(PDF, "liste.pdf")).quelle).toBe("pdf");
    // Auch ohne passende Endung
    expect((await parseTabelle(PDF, "export")).quelle).toBe("pdf");
    // CSV geht weiterhin ohne die API
    const csv = await parseTabelle(Buffer.from("Vorname;Nachname\nMax;Mustermann\n", "utf8"), "liste.csv");
    expect(csv.quelle).toBe("csv");
  });
});
