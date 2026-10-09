import { describe, expect, it } from "vitest";
import { aenderungen, revsAnwenden, zustandAusServer, revKey, type ServerStand } from "@/neu/state";
import { KIND_SCHEMA, opSchema, syncSchema } from "@/lib/neu/schemas";
import { erkenneDatei } from "@/lib/neu/beleg";
import { neuesToken, tokenHash, inTagen, dateiHash } from "@/lib/neu/token";
import { darfNeu } from "@/lib/neu/auth";
import { leererZustand, initialerZustand, neueAudit } from "@/preview/state/store";
import { benenneNummer, naechsteAuftragsNr, naechsteBewerberNr } from "@/preview/pages/formulare";
import { heuteBerlin } from "@/preview/logic/zeit";

const leererStand = (): ServerStand => ({ records: { crew: [], job: [], bewerbung: [], auftrag: [], stunde: [], zuweisung: [], briefing: [], beleg: [], notiz: [], einst: [] }, audit: [], version: "0:0:0" });

describe("Zugangs-Tokens", () => {
  it("sind zufällig, lang und nur als Hash vergleichbar", () => {
    const a = neuesToken();
    const b = neuesToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(30);
    expect(tokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(a)).not.toContain(a);
    expect(tokenHash(a)).toBe(tokenHash(a));
  });
  it("Ablauf und Datei-Hash", () => {
    expect(inTagen(2, new Date("2026-10-10T00:00:00Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(dateiHash(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{64}$/);
  });
  it("nur Administratoren dürfen ins neue Dashboard", () => {
    expect(darfNeu("ADMIN")).toBe(true);
    for (const r of ["BUCHHALTUNG", "DISPONENT", "MEMBER", "EINREICHER"]) expect(darfNeu(r)).toBe(false);
  });
});

describe("Dateien am Beleg-Link", () => {
  const mit = (kopf: number[]) => new Uint8Array([...kopf, ...new Array(20).fill(0)]);
  it("erkennt Bild und PDF am Inhalt, nicht an der Endung", () => {
    expect(erkenneDatei(mit([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(erkenneDatei(mit([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(erkenneDatei(mit([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
  });
  it("lehnt Ausführbares und Text ab", () => {
    expect(erkenneDatei(mit([0x4d, 0x5a, 0x90]))).toBeNull(); // Windows-Programm
    expect(erkenneDatei(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(erkenneDatei(new Uint8Array([0xff, 0xd8]))).toBeNull(); // zu kurz
  });
});

describe("Schemas an der Grenze", () => {
  const demo = initialerZustand();
  it("die Beispieldaten des Prototyps sind gültig", () => {
    for (const c of demo.crew) expect(KIND_SCHEMA.crew.safeParse(c).success, c.id).toBe(true);
    for (const j of demo.jobs) expect(KIND_SCHEMA.job.safeParse(j).success, j.id).toBe(true);
    for (const b of demo.bewerbungen.slice(0, 50)) expect(KIND_SCHEMA.bewerbung.safeParse(b).success, b.id).toBe(true);
    for (const a of demo.auftraege) expect(KIND_SCHEMA.auftrag.safeParse(a).success, a.id).toBe(true);
    for (const r of demo.stunden.slice(0, 300)) expect(KIND_SCHEMA.stunde.safeParse(r).success, r.id).toBe(true);
    expect(KIND_SCHEMA.einst.safeParse(demo.einst).success).toBe(true);
  });
  it("kaputte Stundenzeilen werden abgelehnt", () => {
    const r = demo.stunden[0];
    expect(KIND_SCHEMA.stunde.safeParse({ ...r, datum: "05.10.2026" }).success).toBe(false);
    expect(KIND_SCHEMA.stunde.safeParse({ ...r, status: "gelöscht" }).success).toBe(false);
    expect(KIND_SCHEMA.stunde.safeParse({ ...r, spesen: -5 }).success).toBe(false);
    expect(KIND_SCHEMA.stunde.safeParse({ ...r, start: "7 Uhr" }).success).toBe(false);
  });
  it("unbekannte Arten und zu viele Änderungen werden abgelehnt", () => {
    expect(opSchema.safeParse({ kind: "receipts", id: "x", data: {} }).success).toBe(false);
    expect(syncSchema.safeParse({ ops: new Array(501).fill({ kind: "notiz", id: "n", data: null }) }).success).toBe(false);
    expect(syncSchema.safeParse({ ops: [{ kind: "notiz", id: "n", data: null }] }).success).toBe(true);
  });
});

describe("Abgleich zwischen Oberfläche und Server", () => {
  it("aus dem Serverstand entsteht der Zustand, mit Stand je Datensatz", () => {
    const demo = initialerZustand();
    const stand = leererStand();
    stand.records.crew = [{ id: demo.crew[0].id, rev: 3, data: demo.crew[0] }];
    stand.records.zuweisung = [{ id: "s1", rev: 2, data: [{ pnr: "P1", begruendung: null }] }];
    stand.records.einst = [{ id: "main", rev: 5, data: { minijobEur: 650 } }];
    const { s, revs } = zustandAusServer(stand);
    expect(s.crew).toHaveLength(1);
    expect(s.zuweisung.s1).toHaveLength(1);
    expect(s.einst.minijobEur).toBe(650);
    expect(s.einst.xp.basis).toBe(10); // Standardwerte bleiben, was fehlt
    expect(revs.get(revKey("crew", demo.crew[0].id))).toBe(3);
    expect(revs.get(revKey("einst", "main"))).toBe(5);
  });

  it("ohne Änderung gibt es nichts zu speichern", () => {
    const s = initialerZustand();
    expect(aenderungen(s, s, new Map())).toEqual({ ops: [], audit: [] });
  });

  it("geänderte, neue und gelöschte Zeilen werden erkannt – nur diese", () => {
    const alt = initialerZustand();
    const revs = new Map([[revKey("stunde", alt.stunden[0].id), 4], [revKey("stunde", alt.stunden[2].id), 1]]);
    const geaendert = { ...alt.stunden[0], ende: "23:00" };
    const neu = { ...alt, stunden: [geaendert, alt.stunden[1], ...alt.stunden.slice(3), { ...alt.stunden[1], id: "z-neu" }] };
    const { ops } = aenderungen(alt, neu, revs);
    expect(ops).toHaveLength(3);
    expect(ops.find((o) => o.id === geaendert.id)).toMatchObject({ kind: "stunde", rev: 4 });
    expect(ops.find((o) => o.id === "z-neu")).toMatchObject({ kind: "stunde", rev: undefined });
    expect(ops.find((o) => o.id === alt.stunden[2].id)).toMatchObject({ data: null, rev: 1 });
  });

  it("ein neu erzeugtes, aber gleiches Objekt zählt nicht als Änderung", () => {
    const alt = initialerZustand();
    const neu = { ...alt, stunden: alt.stunden.map((r) => ({ ...r })) };
    expect(aenderungen(alt, neu, new Map()).ops).toEqual([]);
  });

  it("Einteilungen, Einstellungen und neue Protokolleinträge werden gespeichert", () => {
    const alt = leererZustand();
    const e = neueAudit("Maik", "time_entries", "z1", "ende", "16:00", "17:00", null);
    const neu = { ...alt, zuweisung: { s1: [{ pnr: "P1", begruendung: "nachgeholt" }] }, einst: { ...alt.einst, minijobEur: 700 }, audit: [e] };
    const { ops, audit } = aenderungen(alt, neu, new Map());
    expect(ops.map((o) => o.kind).sort()).toEqual(["einst", "zuweisung"]);
    expect(audit).toEqual([e]);
  });

  it("nach dem Speichern merkt sich der Client die neuen Stände und vergisst Gelöschtes", () => {
    const revs = new Map([[revKey("notiz", "a"), 2], [revKey("notiz", "b"), 1]]);
    revsAnwenden(revs, [{ kind: "notiz", id: "a", data: {}, rev: 2 }, { kind: "notiz", id: "b", data: null, rev: 1 }, { kind: "notiz", id: "c", data: {} }], { "notiz:a": 3, "notiz:c": 1 });
    expect(revs.get("notiz:a")).toBe(3);
    expect(revs.has("notiz:b")).toBe(false);
    expect(revs.get("notiz:c")).toBe(1);
  });
});

describe("Anlegen: Nummern", () => {
  it("vorläufige Bewerber-Nummern zählen hoch", () => {
    const s = initialerZustand();
    expect(naechsteBewerberNr([])).toBe("B0001");
    expect(naechsteBewerberNr([{ ...s.crew[0], pnr: "B0007" }, { ...s.crew[1], pnr: "P1002" }])).toBe("B0008");
  });
  it("Auftragsnummern zählen im laufenden Jahr hoch", () => {
    const s = leererZustand();
    const jahr = heuteBerlin().slice(0, 4);
    expect(naechsteAuftragsNr(s)).toBe(`AUF-${jahr}-0001`);
    const mit = { ...s, auftraege: [{ id: `AUF-${jahr}-0004`, kunde: "K", titel: "T", taetigkeit: "Stagehand" as const }] };
    expect(naechsteAuftragsNr(mit)).toBe(`AUF-${jahr}-0005`);
  });
  it("eine geänderte Personalnummer zieht überall mit", () => {
    const s = initialerZustand();
    const pnr = s.stunden[0].pnr;
    const n = benenneNummer(s, pnr, "X999");
    expect(n.stunden.filter((r) => r.pnr === pnr)).toHaveLength(0);
    expect(n.stunden.filter((r) => r.pnr === "X999").length).toBe(s.stunden.filter((r) => r.pnr === pnr).length);
    expect(n.bewerbungen.some((b) => b.pnr === pnr)).toBe(false);
    expect(benenneNummer(s, pnr, pnr)).toBe(s);
  });
});
