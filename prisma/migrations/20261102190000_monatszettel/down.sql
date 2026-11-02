-- Rückweg: entfernt nur die Monatszettel-Tabellen. Einsätze, Schichten, Zeiteinträge und Dokumente, die bei der
-- Unterschrift unter einem Einsatz „Monatszettel …“ angelegt wurden, bleiben als ganz normale Einsätze bestehen.
DROP TABLE IF EXISTS "month_sheets";
DROP TABLE IF EXISTS "month_batches";
DROP TYPE IF EXISTS "MonthSheetKunde";
