// Integrationstest des Parsers mit gemocktem Claude-Aufruf: sowohl über den
// injizierbaren Client als auch über das gemockte SDK-Modul (messages.parse).
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

import { ParsedAssignmentSchema, parseRawText, parseWithClaude } from "@/lib/einsatz/parser";
import { SAMPLE } from "../fixtures/sample";

const CLAUDE_RESULT = {
  kunde: "Mannheimer Power GmbH",
  projekt: "Reezy",
  artist: "Reezy",
  einsatzort: "Porsche Arena Stuttgart",
  datum: "2026-09-18",
  schichten: [
    { bezeichnung: "Call 2", taetigkeit: "Hands", datum: "2026-09-18", start: "08:00", ende: null, anzahlSoll: 2, personen: [{ name: "Mohammad Alhariri", rolle: "mitarbeiter" }, { name: "Saad Mohammad Hassan", rolle: "mitarbeiter" }] },
    { bezeichnung: "Frühschicht", taetigkeit: "Cateringhilfen", datum: "2026-09-18", start: "08:00", ende: null, anzahlSoll: 2, personen: [{ name: "Mohammad Salama Alsmman", rolle: "mitarbeiter" }, { name: "Samira Gülhan", rolle: "mitarbeiter" }] },
    { bezeichnung: "Load-Out", taetigkeit: "Hands", datum: "2026-09-18", start: "21:30", ende: null, anzahlSoll: 4, personen: [{ name: "Manitarun Sundaram", rolle: "mitarbeiter" }, { name: "Mohammad Alhariri", rolle: "mitarbeiter" }, { name: "Assurance Erhis", rolle: "mitarbeiter" }, { name: "Ibrahim Bouriahi", rolle: "mitarbeiter" }] },
  ],
  hinweise: [],
};

describe("Parser mit gemocktem Claude", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("nutzt Structured Output (messages.parse) und ergänzt die Analyse", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: CLAUDE_RESULT, content: [] });
    const out = await parseRawText(SAMPLE);
    expect(out.quelle).toBe("claude");
    expect(out.fehler).toBeNull();
    expect(parseMock).toHaveBeenCalledTimes(1);
    const args = parseMock.mock.calls[0][0];
    expect(args.output_config?.format?.type).toBe("json_schema");
    expect(args.messages[0].content).toContain("Porsche Arena");
    expect(out.parsed.schichten).toHaveLength(3);
    expect(out.parsed.schichten[2].personen).toHaveLength(4);
    // Endzeiten fehlen → Hinweise
    expect(out.parsed.hinweise.filter((h) => h.includes("Endzeit fehlt"))).toHaveLength(3);
  });

  it("fällt bei API-Fehler auf die Heuristik zurück und meldet das", async () => {
    parseMock.mockRejectedValue(new Error("boom"));
    const out = await parseRawText(SAMPLE);
    expect(out.quelle).toBe("heuristik");
    expect(out.fehler).toContain("boom");
    expect(out.parsed.hinweise[0]).toContain("KI-Auswertung fehlgeschlagen");
    expect(out.parsed.schichten.map((s) => s.bezeichnung)).toEqual(["Call 2", "Frühschicht", "Load-Out"]);
  });

  it("lehnt Refusals und leere Antworten ab", async () => {
    parseMock.mockResolvedValue({ stop_reason: "refusal", parsed_output: null, content: [] });
    await expect(parseWithClaude(SAMPLE)).rejects.toThrow("abgelehnt");
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null, content: [] });
    await expect(parseWithClaude(SAMPLE)).rejects.toThrow("nicht als JSON lesbar");
  });

  it("validiert das Schema der Modellantwort", () => {
    expect(() => ParsedAssignmentSchema.parse({ ...CLAUDE_RESULT, schichten: [{ bezeichnung: "" }] })).toThrow();
  });

  it("akzeptiert einen injizierten Client (ohne SDK)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await parseRawText(SAMPLE, async () => CLAUDE_RESULT);
    expect(out.quelle).toBe("claude");
    expect(out.parsed.kunde).toBe("Mannheimer Power GmbH");
  });
});
