import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING, effektiverScore, kategorieFuer, leereErfahrung, leistungScore, scoreProfile, besucherBand } from "@/preview/logic/scoring";
import { ETAPPEN, FRAGEN, SITUATIONSFRAGEN, VERBOTENE_THEMEN, fragenDerEtappe } from "@/preview/logic/fragen";
import { DEFAULT_XP, levelFuer, xpFuerEinsatz } from "@/preview/logic/xp";
import { ampel70Tage, ampelAuslastung, ampelMinijob, ampelVertrag, schlechtereAmpel } from "@/preview/logic/grenzen";
import type { ProfileAnswers, Rating } from "@/preview/logic/types";

function profil(p: Partial<ProfileAnswers> = {}): ProfileAnswers {
  return {
    volljaehrig: true, sprachen: [], fuehrerschein: false, eigenesAuto: false, maxAnfahrtMin: 0, uebernachtungOk: false, fahrgemeinschaft: false,
    erfahrung: leereErfahrung(), groessteVeranstaltung: 0, fruehereFirmen: "",
    nachweise: { stapler: "keiner", ersthelfer: "keiner", hygiene: "keiner", paragraph34a: "keiner" },
    ausruestung: { s3Schuhe: false, handschuhe: false, helm: false, warnweste: false, schwarzeKleidung: false, werkzeug: false },
    shirtgroesse: "M", wunschVertrag: "Minijob", wochentage: [], nachtOk: false, wunschStundenMonat: 0, aktuellerStatus: "Student/in", andereArbeitgeber: false,
    situation: [], ...p,
  };
}

const profi = () =>
  profil({
    fuehrerschein: true, eigenesAuto: true, maxAnfahrtMin: 120, uebernachtungOk: true, fahrgemeinschaft: true,
    erfahrung: { ...leereErfahrung(), Stagehand: { jahre: 6, einsaetze: 120 }, Logistik: { jahre: 4, einsaetze: 60 }, Messebau: { jahre: 3, einsaetze: 40 } },
    groessteVeranstaltung: 60000,
    nachweise: { stapler: "geprueft", ersthelfer: "geprueft", hygiene: "geprueft", paragraph34a: "geprueft" },
    ausruestung: { s3Schuhe: true, handschuhe: true, helm: true, warnweste: true, schwarzeKleidung: true, werkzeug: true },
    situation: SITUATIONSFRAGEN.map(() => 0),
  });

describe("Scoring des Fragebogens", () => {
  it("ein leeres Profil bekommt null Punkte und Kategorie C", () => {
    const r = scoreProfile(profil());
    expect(r.gesamt).toBe(0);
    expect(r.kategorie).toBe("C");
  });

  it("ein volles Profil mit besten Antworten erreicht 100", () => {
    const r = scoreProfile(profi());
    expect(r.gesamt).toBe(100);
    expect(r.kategorie).toBe("A");
  });

  it("die vier Blöcke summieren sich zum Gesamtwert, Höchstwerte auf 100", () => {
    const r = scoreProfile(profi());
    expect(r.blocks.map((b) => b.maximal)).toEqual([40, 20, 20, 20]);
    expect(r.blocks.reduce((n, b) => n + b.punkte, 0)).toBeCloseTo(r.gesamt, 1);
  });

  it("geprüfter Nachweis zählt voll, nur angegebener halb", () => {
    const geprueft = scoreProfile(profil({ nachweise: { stapler: "geprueft", ersthelfer: "keiner", hygiene: "keiner", paragraph34a: "keiner" } }));
    const angegeben = scoreProfile(profil({ nachweise: { stapler: "angegeben", ersthelfer: "keiner", hygiene: "keiner", paragraph34a: "keiner" } }));
    const q = (r: ReturnType<typeof scoreProfile>) => r.blocks.find((b) => b.key === "qualifikation")!.quote;
    expect(q(geprueft)).toBeCloseTo(6 / 20);
    expect(q(angegeben)).toBeCloseTo(3 / 20);
  });

  it("Schwellen: A ab 70, B ab 45, sonst C", () => {
    expect(kategorieFuer(70, DEFAULT_SCORING)).toBe("A");
    expect(kategorieFuer(69.9, DEFAULT_SCORING)).toBe("B");
    expect(kategorieFuer(45, DEFAULT_SCORING)).toBe("B");
    expect(kategorieFuer(44.9, DEFAULT_SCORING)).toBe("C");
  });

  it("die Gewichte lassen sich verschieben, die Summe bleibt auf 100 normiert", () => {
    const nurErfahrung = { ...DEFAULT_SCORING, gewicht: { erfahrung: 100, mobilitaet: 0, qualifikation: 0, situation: 0 } };
    const r = scoreProfile(profil({ erfahrung: { ...leereErfahrung(), Stagehand: { jahre: 10, einsaetze: 300 }, Logistik: { jahre: 10, einsaetze: 300 }, Messebau: { jahre: 10, einsaetze: 300 } }, groessteVeranstaltung: 50000 }), nurErfahrung);
    expect(r.gesamt).toBe(100);
  });

  it("die Größe der Veranstaltung wirkt in Stufen", () => {
    expect([0, 499, 500, 5000, 20000].map(besucherBand)).toEqual([0, 0, 0.35, 0.7, 1]);
  });
});

describe("Einsatzleistung überschreibt den Fragebogen schrittweise", () => {
  const gut: Rating = { jobId: "j", von: "Dispo", puenktlich: 5, einsatz: 5, teamwork: 5, kommentar: "" };
  const schlecht: Rating = { jobId: "j", von: "Dispo", puenktlich: 1, einsatz: 1, teamwork: 1, kommentar: "" };

  it("ohne Bewertungen bleibt es beim Fragebogen", () => {
    expect(effektiverScore(80, 30, [])).toEqual({ score: 80, anteilLeistung: 0 });
  });

  it("der Leistungs-Score reicht von 0 bis 100", () => {
    expect(leistungScore([gut])).toBe(100);
    expect(leistungScore([schlecht])).toBe(0);
    expect(leistungScore([])).toBeNull();
  });

  it("der Anteil wächst mit den Einsätzen bis zum Höchstanteil", () => {
    expect(effektiverScore(80, 0, [schlecht]).anteilLeistung).toBe(0);
    expect(effektiverScore(80, 10, [schlecht]).anteilLeistung).toBe(0.35);
    expect(effektiverScore(80, 20, [schlecht]).anteilLeistung).toBe(0.7);
    expect(effektiverScore(80, 200, [schlecht]).anteilLeistung).toBe(0.7);
  });

  it("schlechte Einsätze ziehen einen guten Fragebogen runter, gute heben einen schwachen", () => {
    expect(effektiverScore(80, 20, [schlecht]).score).toBe(24);
    expect(effektiverScore(30, 20, [gut]).score).toBe(79);
  });
});

describe("Fragebogen und AGG", () => {
  it("sechs Etappen, rund 35 Fragen und vier Situationsfragen", () => {
    expect(ETAPPEN).toHaveLength(6);
    expect(FRAGEN.length).toBeGreaterThanOrEqual(30);
    expect(FRAGEN.length).toBeLessThanOrEqual(40);
    expect(SITUATIONSFRAGEN).toHaveLength(4);
    for (const e of ETAPPEN) expect(fragenDerEtappe(e.nr).length).toBeGreaterThan(0);
  });

  it("keine Frage berührt ein verbotenes Thema (Alter, Herkunft, Religion, Gesundheit, Schwangerschaft)", () => {
    // Einzige zulässige Altersfrage laut Plan: „volljährig ja/nein“. Sie wird
    // gezielt ausgenommen (die englische Fassung enthält „age“), alles andere
    // bleibt geprüft.
    const texte = [
      ...FRAGEN.filter((f) => f.id !== "volljaehrig").flatMap((f) => [f.label.de, f.label.en, f.hilfe?.de ?? "", f.hilfe?.en ?? "", ...(f.optionen ?? []).flatMap((o) => [o.de, o.en])]),
      ...SITUATIONSFRAGEN.flatMap((s) => [s.frage.de, s.frage.en, ...s.optionen.flatMap((o) => [o.de, o.en])]),
    ];
    for (const wort of VERBOTENE_THEMEN) {
      const re = new RegExp(`\\b${wort}\\b`, "i");
      for (const t of texte) expect(t, `„${t}“ enthält „${wort}“`).not.toMatch(re);
    }
  });

  it("nur „volljährig“ wird gefragt, kein Geburtsdatum", () => {
    expect(FRAGEN.some((f) => f.id === "volljaehrig")).toBe(true);
    expect(FRAGEN.some((f) => /geburt/i.test(f.id) || /birth/i.test(f.id))).toBe(false);
  });

  it("jede Situationsfrage hat Antworten mit 0 bis 5 Punkten und genau eine beste", () => {
    for (const s of SITUATIONSFRAGEN) {
      expect(Math.max(...s.optionen.map((o) => o.punkte))).toBe(5);
      expect(Math.min(...s.optionen.map((o) => o.punkte))).toBe(0);
      expect(s.optionen.filter((o) => o.punkte === 5)).toHaveLength(1);
    }
  });

  it("jede Frage ist zweisprachig", () => {
    for (const f of FRAGEN) {
      expect(f.label.de).toBeTruthy();
      expect(f.label.en).toBeTruthy();
    }
  });
});

describe("XP und Level", () => {
  const ok = { erschienen: true, puenktlich: true, zettelVollstaendig: true, bewertungSchnitt: 5 };

  it("Basis +10, pünktlich und Zettel +5, gute Bewertung +5", () => {
    expect(xpFuerEinsatz({ ...ok, bewertungSchnitt: null, puenktlich: false })).toBe(10);
    expect(xpFuerEinsatz({ ...ok, bewertungSchnitt: null })).toBe(15);
    expect(xpFuerEinsatz(ok)).toBe(20);
    expect(xpFuerEinsatz({ ...ok, bewertungSchnitt: 3.9 })).toBe(15);
    expect(xpFuerEinsatz({ ...ok, bewertungSchnitt: 4 })).toBe(20);
  });

  it("No-Show −20, fehlender Zettel −10", () => {
    expect(xpFuerEinsatz({ ...ok, erschienen: false })).toBe(-20);
    expect(xpFuerEinsatz({ ...ok, zettelVollstaendig: false, bewertungSchnitt: null })).toBe(0);
  });

  it("Level nach Schwellen, mit Fortschritt zum nächsten", () => {
    expect(levelFuer(0).name).toBe("Rookie");
    expect(levelFuer(99).name).toBe("Rookie");
    expect(levelFuer(100).name).toBe("Crew");
    expect(levelFuer(350).name).toBe("Senior Crew");
    expect(levelFuer(650).name).toBe("Teamleiter-fähig");
    expect(levelFuer(650).naechstes).toBeNull();
    expect(levelFuer(50).naechstes).toEqual({ name: "Crew", fehlend: 50 });
    expect(levelFuer(50).fortschritt).toBe(0.5);
  });

  it("negative XP bleiben Rookie", () => {
    expect(levelFuer(-40, DEFAULT_XP).name).toBe("Rookie");
  });
});

describe("Ampeln der Crew-Übersicht", () => {
  it("Auslastung: grün unter 80 %, gelb 80 bis 100 %, rot darüber", () => {
    expect(ampelAuslastung(31, 40)).toBe("gruen");
    expect(ampelAuslastung(32, 40)).toBe("gelb");
    expect(ampelAuslastung(40, 40)).toBe("gelb");
    expect(ampelAuslastung(40.1, 40)).toBe("rot");
    expect(ampelAuslastung(10, null)).toBe("grau");
  });

  it("Vertrag: abgelaufen rot, Ablauf in 30 Tagen gelb, sonst grün", () => {
    expect(ampelVertrag("2026-10-08", "2026-10-09")).toBe("rot");
    expect(ampelVertrag("2026-10-09", "2026-10-09")).toBe("gelb");
    expect(ampelVertrag("2026-11-08", "2026-10-09")).toBe("gelb");
    expect(ampelVertrag("2026-11-09", "2026-10-09")).toBe("gruen");
    expect(ampelVertrag(null, "2026-10-09")).toBe("gruen");
  });

  it("70-Tage-Grenze und Minijob-Grenze", () => {
    expect(ampel70Tage(55)).toBe("gruen");
    expect(ampel70Tage(56)).toBe("gelb");
    expect(ampel70Tage(71)).toBe("rot");
    expect(ampelMinijob(500, 603)).toBe("gelb");
    expect(ampelMinijob(604, 603)).toBe("rot");
  });

  it("die schlechtere Ampel gewinnt", () => {
    expect(schlechtereAmpel("gruen", "rot")).toBe("rot");
    expect(schlechtereAmpel("gelb", "gruen")).toBe("gelb");
  });
});

import { antwortenZuProfil, fortschritt, handyGueltig, leereAntworten, offenePflicht, plzGueltig, situationVollstaendig } from "@/preview/logic/profil";

describe("Fragebogen: Antworten → Profil", () => {
  it("leere Antworten ergeben ein leeres Profil mit Kategorie C", () => {
    const p = antwortenZuProfil(leereAntworten());
    expect(p.volljaehrig).toBe(false);
    expect(scoreProfile(p).kategorie).toBe("C");
  });

  it("offene Antworten (null) zählen nicht als Ja", () => {
    const a = { ...leereAntworten(), fuehrerschein: null, eigenesAuto: true };
    const p = antwortenZuProfil(a);
    expect(p.fuehrerschein).toBe(false);
    expect(p.eigenesAuto).toBe(true);
  });

  it("Pflichtfragen je Etappe", () => {
    const a = leereAntworten();
    expect(offenePflicht(a, 1)).toEqual(["vorname", "nachname", "handy", "plz", "wohnort", "volljaehrig"]);
    expect(offenePflicht({ ...a, vorname: "Mara", nachname: "B", handy: "0151 0000 9001", plz: "70173", wohnort: "Stuttgart", volljaehrig: true }, 1)).toEqual([]);
    expect(offenePflicht(a, 2)).toEqual([]); // Mobilität ist freiwillig
  });

  it("PLZ und Handynummer werden geprüft", () => {
    expect(plzGueltig("70173")).toBe(true);
    expect(plzGueltig("7017")).toBe(false);
    expect(handyGueltig("0151 0000 9001")).toBe(true);
    expect(handyGueltig("+49 151 00009001")).toBe(true);
    expect(handyGueltig("12345")).toBe(false);
  });

  it("Fortschritt wächst mit den Antworten", () => {
    const leer = fortschritt(leereAntworten());
    const teil = fortschritt({ ...leereAntworten(), vorname: "M", nachname: "B", plz: "70173", volljaehrig: true });
    expect(teil.gesamt).toBe(leer.gesamt);
    expect(teil.beantwortet).toBeGreaterThan(leer.beantwortet);
    expect(situationVollstaendig({ ...leereAntworten(), situation: [0, 1, 0, 2] })).toBe(true);
    expect(situationVollstaendig(leereAntworten())).toBe(false);
  });

  it("volle Antworten mit besten Situationsantworten erreichen Kategorie A", () => {
    const a = leereAntworten();
    a.fuehrerschein = a.eigenesAuto = a.uebernachtungOk = a.fahrgemeinschaft = true;
    a.maxAnfahrtMin = 120;
    a.erfahrung = { ...leereErfahrung(), Stagehand: { jahre: 6, einsaetze: 120 }, Logistik: { jahre: 4, einsaetze: 60 }, Messebau: { jahre: 3, einsaetze: 40 } };
    a.groessteVeranstaltung = 60000;
    a.nachweis_stapler = a.nachweis_ersthelfer = a.nachweis_hygiene = a.nachweis_34a = "geprueft";
    a.ausr_s3 = a.ausr_handschuhe = a.ausr_helm = a.ausr_warnweste = a.ausr_schwarz = a.ausr_werkzeug = true;
    a.situation = [0, 0, 0, 0];
    expect(scoreProfile(antwortenZuProfil(a)).kategorie).toBe("A");
  });
});
