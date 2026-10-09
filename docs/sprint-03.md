# Sprint 3: Export (Entwurf)

Status: **Entwurf, nicht freigegeben** · Bereich E · Flag `FEATURE_EXPORT` · Tabellen: `v2.settings` (Lohnarten-Zuordnung)

## Ziel
Am Monatsende per Knopfdruck eine **geprüfte** Datei für zvoove One – mit Prüfbericht vorweg.

## Voraussetzungen
Sprint 2 · Lohnarten-Nummern mit Daniel abgestimmt (Bonus, Abzug, Reisekosten privat/geschäftlich, Spesen, Garantie) · Entscheidung: baut der Export auf dem **bestehenden** zvoove-Export (`config/zvoove-mapping.json`) auf (Empfehlung) oder daneben.

## User Stories
1. Als **Buchhaltung** möchte ich vor dem Export einen Prüfbericht mit allen Warnungen, damit nichts Falsches in zvoove landet.
2. Als **Buchhaltung** möchte ich das Spalten-/Lohnart-Mapping in den Einstellungen pflegen.
3. Als **Buchhaltung** möchte ich eine Excel-Datei mit den 18 Spalten und eine Kundenübersicht je Auftrag.
4. Als **Admin** möchte ich, dass exportierte Zeilen danach gesperrt sind.

## Akzeptanzkriterien
- [ ] Prüfbericht nennt: Zeilen gesamt, exportierbar, nicht freigegeben, mit Fehler, Warnungen, Positionen ohne Lohnart.
- [ ] Nur **freigegebene** Zeilen ohne Fehler gehen in die CSV; alle anderen bleiben draußen und stehen im Bericht.
- [ ] Positionen: Arbeitszeit, Garantie (Aufstockung), Spesen, Reise privat (km × Satz), Reise geschäftlich, Bonus, Abzug (negativ). Zuschläge Nacht/Sonntag/Feiertag **rechnet zvoove**, nicht wir.
- [ ] Ohne Lohnart kein stiller Export: ausdrückliche Bestätigung nötig.
- [ ] CSV (Trennzeichen, Dezimalkomma, UTF-8 mit BOM) lässt sich in zvoove einlesen – **Test mit echter Datei von Daniel**.
- [ ] Export wird archiviert (bestehende Archivierung), Zeilen danach „exportiert“.

## Testfälle
Unit: Positionsbildung je Zeile, Vorzeichen, Rundung, Mapping, Prüfbericht-Zahlen, CSV-Maskierung. E2E: Export
mit Warnung, ohne Lohnart (blockiert), mit Bestätigung, Sperre danach.

## Aus dem Prototyp übernehmen
`logic/export.ts` (+ Tests), `ExportModal` aus `pages/admin-stunden.tsx`.

## Risiken und offene Fragen
Lohnart-Nummern im Prototyp sind **Platzhalter**. Reisekosten privat: steuerfreier Satz 0,30 €/km ist
im Prototyp Annahme (in `settings`). Excel als echte `.xlsx` statt CSV (`exceljs` ist da).
