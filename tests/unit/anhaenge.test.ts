import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { leseAnhaenge, MAX_ANHAENGE, MAX_ANHANG_BYTES, medientyp } from "@/lib/einsatz/anhaenge";
import { parseRawText } from "@/lib/einsatz/parser";

function datei(name: string, inhalt: Buffer | string, typ = ""): File {
  const bytes = typeof inhalt === "string" ? Buffer.from(inhalt, "utf8") : inhalt;
  return new File([new Uint8Array(bytes)], name, { type: typ });
}

// 1×1-PNG, damit ein echter Bild-Anhang ohne Fixture-Datei auskommt
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("Medientyp erkennen", () => {
  it("nimmt den gemeldeten Typ, wenn er passt", () => {
    expect(medientyp("plan.png", "image/png")).toBe("image/png");
    expect(medientyp("plan.pdf", "application/pdf")).toBe("application/pdf");
  });

  it("fällt auf die Endung zurück, wenn der Browser nichts meldet", () => {
    expect(medientyp("WhatsApp Image.jpeg", "")).toBe("image/jpeg");
    expect(medientyp("plan.PDF", "application/octet-stream")).toBe("application/pdf");
    expect(medientyp("liste.csv", "")).toBe("");
  });
});

describe("Anhänge lesen", () => {
  it("reicht Bilder und PDFs als Base64 weiter", async () => {
    const res = await leseAnhaenge([datei("screenshot.png", PNG, "image/png")]);
    expect(res.anhaenge).toHaveLength(1);
    expect(res.anhaenge[0]).toMatchObject({ name: "screenshot.png", mediaType: "image/png" });
    expect(Buffer.from(res.anhaenge[0].dataBase64, "base64")).toEqual(PNG);
    expect(res.abgelehnt).toEqual([]);
  });

  it("liest Textdateien direkt aus, statt sie an die API zu schicken", async () => {
    const res = await leseAnhaenge([datei("plan.txt", "Artist: Reezy\nLoad-Out | 21:30 Uhr | 4x Hands", "text/plain")]);
    expect(res.anhaenge).toEqual([]);
    expect(res.zusatzText).toContain("--- plan.txt ---");
    expect(res.zusatzText).toContain("Load-Out | 21:30 Uhr | 4x Hands");
  });

  it("macht aus einer Excel-Liste Text", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.addRow(["Schicht", "Beginn", "Anzahl"]);
    ws.addRow(["Load-Out", "21:30", 4]);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await leseAnhaenge([datei("plan.xlsx", bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]);
    expect(res.anhaenge).toEqual([]);
    expect(res.zusatzText).toContain("Schicht | Beginn | Anzahl");
    expect(res.zusatzText).toContain("Load-Out | 21:30 | 4");
  });

  it("lehnt zu große, zu viele und unbekannte Dateien mit Begründung ab", async () => {
    const zuGross = datei("riesig.png", Buffer.alloc(MAX_ANHANG_BYTES + 1), "image/png");
    const fremd = datei("vertrag.docx", "x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const viele = Array.from({ length: MAX_ANHAENGE + 2 }, (_, i) => datei(`s${i}.png`, PNG, "image/png"));
    const res = await leseAnhaenge([zuGross, fremd, ...viele]);
    expect(res.abgelehnt.find((a) => a.name === "riesig.png")?.grund).toMatch(/größer/);
    expect(res.abgelehnt.find((a) => a.name === "vertrag.docx")?.grund).toMatch(/nicht unterstützt/);
    expect(res.anhaenge.length).toBeLessThanOrEqual(MAX_ANHAENGE);
    expect(res.abgelehnt.some((a) => /höchstens/.test(a.grund))).toBe(true);
  });
});

describe("Auswertung mit Anhängen", () => {
  it("reicht die Anhänge an den Client durch", async () => {
    let gesehen: string[] = [];
    await parseRawText("Artist: Reezy", [{ name: "s.png", mediaType: "image/png", dataBase64: PNG.toString("base64") }], async (_text, anhaenge) => {
      gesehen = anhaenge.map((a) => a.name);
      return { kunde: null, projekt: "Reezy", artist: "Reezy", einsatzort: null, datum: null, schichten: [], hinweise: [] };
    });
    expect(gesehen).toEqual(["s.png"]);
  });

  it("sagt deutlich, dass die Heuristik Bilder nicht lesen kann", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await parseRawText("Artist: Reezy", [{ name: "s.png", mediaType: "image/png", dataBase64: PNG.toString("base64") }]);
    expect(out.quelle).toBe("heuristik");
    expect(out.parsed.hinweise[0]).toContain("s.png");
    expect(out.parsed.hinweise[0]).toMatch(/nicht ausgewertet/);
  });

  it("verlangt Rohtext oder Anhang", async () => {
    await expect(parseRawText("", [])).rejects.toThrow(/Rohtext|Datei/);
  });
});
