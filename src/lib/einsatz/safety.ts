// Sicherheitsunterweisung und PSA – Inhalt der Anlage zum Stundennachweis
// und der aufklappbaren Unterweisung im Mitarbeiter-Link. Die Version wird
// pro Zeiteintrag gespeichert (unterweisungVersion). Bei inhaltlichen
// Änderungen Version + Stand hochsetzen.

export const SAFETY_VERSION = "1.0";
export const SAFETY_STAND = "2026-09-01";

export type SafetySection = { titel: string; punkte: string[] };

export const SAFETY_SECTIONS: SafetySection[] = [
  {
    titel: "Für alle",
    punkte: [
      "Anweisungen des Ansprechpartners vor Ort und der Einsatzleitung des Entleihers sind zu befolgen.",
      "Vor Arbeitsbeginn: Flucht- und Rettungswege, Sammelplatz und Erste-Hilfe-Einrichtungen erfragen.",
      "Kein Alkohol, keine Drogen, keine Medikamente, die die Reaktionsfähigkeit beeinträchtigen.",
      "Handynutzung nur in Pausen oder auf Anweisung; nie beim Tragen, Fahren oder Führen von Geräten.",
      "Unfälle, Beinaheunfälle und Schäden sofort dem Ansprechpartner und FESS melden.",
      "Nur Arbeiten ausführen, für die man eingewiesen und ausgebildet ist.",
    ],
  },
  {
    titel: "Persönliche Schutzausrüstung (PSA)",
    punkte: [
      "Sicherheitsschuhe S3 sind bei allen Aufbau-, Abbau-, Logistik- und Lagertätigkeiten Pflicht.",
      "Handschuhe beim Tragen scharfkantiger, rauer oder schwerer Lasten.",
      "Schutzhelm bei Arbeiten unter schwebenden Lasten, im Rigging-Bereich oder auf Anweisung.",
      "Warnweste in Verkehrs- und Staplerbereichen, bei Dunkelheit und im Außenbereich.",
      "Gehörschutz bei Lärm (Soundcheck, Maschinen); Schutzbrille bei Schleif-, Bohr- und Sägearbeiten.",
      "Fehlende oder defekte PSA vor Arbeitsbeginn melden – nicht ohne PSA beginnen.",
    ],
  },
  {
    titel: "Stagehands, Auf- und Abbau",
    punkte: [
      "Lasten nur mit ausreichend Personen bewegen; schwere Cases mit zwei Personen oder Hilfsmitteln.",
      "Rücken gerade, aus den Beinen heben; Drehbewegungen unter Last vermeiden.",
      "Cases sichern (Bremsen), Rampen nie allein befahren, Stolperstellen (Kabel, Kanten) beachten.",
      "Traversen, Bühnenelemente und Gerüstteile nur nach Anweisung und nie über Kopf werfen.",
      "Hände aus dem Gefahrenbereich von Scharnieren, Klemmen und Stapelkanten halten.",
    ],
  },
  {
    titel: "Höhenarbeit, Rigging, Gerüst",
    punkte: [
      "Arbeiten in der Höhe nur mit nachgewiesener Qualifikation und ausdrücklicher Einteilung.",
      "Absturzsicherung (PSAgA) ab 2 m Absturzhöhe; Anschlagpunkte nur nach Freigabe nutzen.",
      "Aufenthalt unter schwebenden Lasten ist verboten; Gefahrenbereich absperren.",
      "Werkzeug in der Höhe gegen Herabfallen sichern; keine losen Teile in Taschen.",
      "Leitern nur bestimmungsgemäß, standsicher und nie als Arbeitsplatz über 2 m.",
    ],
  },
  {
    titel: "Stapler und Flurförderzeuge",
    punkte: [
      "Führen nur mit gültigem Staplerschein und schriftlicher Beauftragung durch den Entleiher.",
      "Vor Fahrtantritt Sicht-/Funktionsprüfung (Bremsen, Hupe, Gabel, Hydraulik); Mängel melden.",
      "Anschnallen, Last tief und geneigt fahren, Schrittgeschwindigkeit in Hallen, keine Personen mitnehmen.",
      "Fußgänger haben Vorrang; Blickkontakt suchen; an Kreuzungen und Toren hupen.",
      "Gerät beim Verlassen abstellen: Gabel ab, Feststellbremse, Schlüssel abziehen.",
    ],
  },
  {
    titel: "Logistik",
    punkte: [
      "Ladungssicherung nach Anweisung (Zurrgurte, Antirutschmatten); nie unter angehobenen Ladebordwänden aufhalten.",
      "Verkehrswege freihalten, Paletten sicher stapeln, beschädigte Paletten aussortieren.",
      "Beim Be- und Entladen von Lkw Rampenkanten, Abstand und Rückwärtsfahrten beachten.",
    ],
  },
  {
    titel: "Catering",
    punkte: [
      "Hygiene: Händewaschen, saubere Arbeitskleidung, Haare zusammenbinden, keine Arbeit bei ansteckender Krankheit (IfSG-Belehrung).",
      "Schnittschutz bei Messerarbeiten; heiße Flächen, Fett und Dampf – Verbrennungsgefahr.",
      "Rutschgefahr: verschüttete Flüssigkeiten sofort aufnehmen, rutschfeste Schuhe tragen.",
      "Kühlketten einhalten, Allergene kennzeichnen, Gäste-Anfragen an die Küchenleitung.",
    ],
  },
  {
    titel: "Promotion",
    punkte: [
      "Freundliches, respektvolles Auftreten; Kleidung laut Briefing; Namensschild sichtbar.",
      "Bei Konflikten mit Passanten deeskalieren und den Ansprechpartner hinzuziehen.",
      "Stände und Aufsteller standsicher aufbauen (Wind!), Kabel abdecken, Fluchtwege freihalten.",
    ],
  },
  {
    titel: "Verhalten im Notfall",
    punkte: [
      "Ruhe bewahren, Eigenschutz geht vor; Gefahrenbereich verlassen und andere warnen.",
      "Notruf 112 (Feuerwehr/Rettung) – Wer, wo, was, wie viele Verletzte, warten auf Rückfragen.",
      "Erste Hilfe leisten, soweit möglich; Ersthelfer und Ansprechpartner vor Ort informieren.",
      "Sammelplatz aufsuchen, Anwesenheit bestätigen; Halle erst nach Freigabe wieder betreten.",
      "Jeden Unfall zusätzlich an FESS melden (Unfallanzeige Berufsgenossenschaft).",
    ],
  },
];

export const CONFIRMATION_TEXT = [
  "Die eingetragenen Arbeitszeiten sind korrekt.",
  "Ich habe die Sicherheitsunterweisung gelesen und verstanden.",
  "Ich habe die vorgeschriebene PSA getragen.",
  "Ich wurde durch die FESS recruitment GmbH & Co. KG überlassen.",
  "Die Angaben zu PKW-Nutzung und Spesen sind zutreffend.",
];

export const VERLEIHER = {
  name: "FESS recruitment GmbH & Co. KG",
  marke: "fess.jobs",
  farbe: "#E3682E",
};
