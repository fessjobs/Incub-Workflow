import { describe, expect, it } from "vitest";
import { detectDelimiter, erkenneSpalten, isPdf, normalisiereKopf, parseCsv, splitCsvLine } from "@/lib/einsatz/import/parse-table";
import { leseBundesland, leseKundeZeile, leseMitarbeiterZeile, parseDatum, teileName } from "@/lib/einsatz/import/stammdaten";

describe("Tabellen einlesen", () => {
  it("erkennt Trennzeichen und Anführungszeichen", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c,d")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(splitCsvLine('Müller, Max;"Haupt; 3";10001', ";")).toEqual(["Müller, Max", "Haupt; 3", "10001"]);
    expect(splitCsvLine('"sagt ""hallo""";b', ";")).toEqual(['sagt "hallo"', "b"]);
  });

  it("liest CSV mit Kopfzeile und füllt kurze Zeilen auf", () => {
    const t = parseCsv(Buffer.from("Personalnummer;Vorname;Nachname\n10001;Max;Mustermann\n10002;Erika\n", "utf8"));
    expect(t.kopf).toEqual(["Personalnummer", "Vorname", "Nachname"]);
    expect(t.zeilen).toEqual([
      ["10001", "Max", "Mustermann"],
      ["10002", "Erika", ""],
    ]);
  });

  it("erkennt Spalten unabhängig von Schreibweise und Reihenfolge", () => {
    expect(normalisiereKopf("Pers.-Nr.")).toBe("persnr");
    const sp = erkenneSpalten(["Nachname", "Pers.-Nr.", "E-Mail Adresse"], [
      { feld: "personalnummer", muster: /^(persnr|personalnummer)$/ },
      { feld: "nachname", muster: /^(nachname|name)$/ },
      { feld: "email", muster: /^(emailadresse|email)$/ },
    ]);
    expect(sp).toEqual({ personalnummer: 1, nachname: 0, email: 2 });
  });
});

describe("Mitarbeiterzeilen", () => {
  const sp = { vorname: 0, nachname: 1, name: -1, personalnummer: 2, email: 3, mobil: 4, geburtsdatum: 5, zulagen: 6, status: 7 };

  it("liest eine vollständige Zeile", () => {
    const { satz } = leseMitarbeiterZeile(["Max", "Mustermann", "10001", "max@fess.jobs", "0170 1234567", "01.02.1990", "Stapler, Rigger", "aktiv"], sp);
    expect(satz).toMatchObject({
      vorname: "Max",
      nachname: "Mustermann",
      personalnummer: "10001",
      email: "max@fess.jobs",
      geburtsdatum: "1990-02-01",
      zulagen: ["stapler", "rigger"],
      status: "AKTIV",
    });
  });

  it("teilt zusammengeschriebene Namen", () => {
    expect(teileName("Mustermann, Max")).toEqual({ vorname: "Max", nachname: "Mustermann" });
    expect(teileName("Saad Mohammad Hassan")).toEqual({ vorname: "Saad Mohammad", nachname: "Hassan" });
    const nurName = { ...sp, vorname: -1, nachname: -1, name: 0 };
    expect(leseMitarbeiterZeile(["Gülhan, Samira"], nurName).satz).toMatchObject({ vorname: "Samira", nachname: "Gülhan" });
  });

  it("meldet fehlende und fehlerhafte Angaben statt sie zu übernehmen", () => {
    expect(leseMitarbeiterZeile(["", "", "", "", "", "", "", ""], sp).fehler).toMatch(/Kein Name/);
    expect(leseMitarbeiterZeile(["Max", "", "", "", "", "", "", ""], sp).fehler).toMatch(/Nachname fehlt/);
    // Einteiliger Name: für die Konkretisierung nach AÜG unbrauchbar
    expect(leseMitarbeiterZeile(["", "NurEinName", "", "", "", "", "", ""], sp).fehler).toMatch(/Vorname fehlt/);
    expect(leseMitarbeiterZeile(["Max", "Muster", "", "keine-mail", "", "", "", ""], sp).fehler).toMatch(/E-Mail/);
    expect(leseMitarbeiterZeile(["Max", "Muster", "", "", "", "irgendwann", "", ""], sp).fehler).toMatch(/Geburtsdatum/);
  });

  it("erkennt inaktive Mitarbeiter", () => {
    expect(leseMitarbeiterZeile(["Max", "Muster", "", "", "", "", "", "inaktiv"], sp).satz?.status).toBe("INAKTIV");
    expect(leseMitarbeiterZeile(["Max", "Muster", "", "", "", "", "", ""], sp).satz?.status).toBe("AKTIV");
  });

  it("liest deutsche und ISO-Datumsangaben", () => {
    expect(parseDatum("1.2.1990")).toBe("1990-02-01");
    expect(parseDatum("1990-02-01")).toBe("1990-02-01");
    expect(parseDatum("01.02.90")).toBe("1990-02-01");
    expect(parseDatum("32.13.2000")).toBeNull();
  });
});

describe("Kundenzeilen", () => {
  const sp = { name: 0, adresse: 1, plz: 2, ort: 3, ustid: 4, ansprechpartner: 5, email: 6, telefon: 7, einsatzort: 8, bundesland: 9, vertrag: 10 };

  it("setzt die Adresse aus Straße, PLZ und Ort zusammen", () => {
    const { satz } = leseKundeZeile(["Mannheimer Power GmbH", "Hafenstraße 12", "68159", "Mannheim", "DE123", "Jonas Keller", "jk@power.de", "0621 1", "SAP Arena", "Baden-Württemberg", "AÜV-1"], sp);
    expect(satz).toMatchObject({
      name: "Mannheimer Power GmbH",
      adresse: "Hafenstraße 12, 68159 Mannheim",
      bundesland: "BW",
      aueVertragRef: "AÜV-1",
    });
  });

  it("erkennt Bundesländer ausgeschrieben und als Kürzel", () => {
    expect(leseBundesland("Bayern")).toBe("BY");
    expect(leseBundesland("nordrhein-westfalen")).toBe("NW");
    expect(leseBundesland("BW")).toBe("BW");
    expect(leseBundesland("Irgendwo")).toBeNull();
  });

  it("verlangt einen Namen", () => {
    expect(leseKundeZeile(["", "Str. 1"], sp).fehler).toMatch(/Kundenname/);
  });
});

describe("PDF erkennen", () => {
  it("erkennt PDF an der Endung und an der Signatur", () => {
    expect(isPdf(Buffer.from("irgendwas"), "liste.pdf")).toBe(true);
    expect(isPdf(Buffer.from("irgendwas"), "LISTE.PDF")).toBe(true);
    // Ohne passende Endung entscheidet die Dateisignatur
    expect(isPdf(Buffer.from("%PDF-1.7\n..."), "export")).toBe(true);
  });

  it("hält andere Formate auseinander", () => {
    expect(isPdf(Buffer.from("Name;Vorname"), "liste.csv")).toBe(false);
    // xlsx ist ein ZIP
    expect(isPdf(Buffer.from("PK\u0003\u0004"), "liste.xlsx")).toBe(false);
    expect(isPdf(Buffer.from("PDF steht im Text"), "notiz.txt")).toBe(false);
  });
});
