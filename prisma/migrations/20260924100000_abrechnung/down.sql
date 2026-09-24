-- Rollback: Abrechnungsfelder entfernen
DROP INDEX IF EXISTS "assignments_organizationId_abrechnung_datumVon_idx";
ALTER TABLE "assignments"
  DROP COLUMN IF EXISTS "abrechnung",
  DROP COLUMN IF EXISTS "angebotsnummer",
  DROP COLUMN IF EXISTS "konditionen",
  DROP COLUMN IF EXISTS "abrechnungHinweis",
  DROP COLUMN IF EXISTS "freigabeVon",
  DROP COLUMN IF EXISTS "freigabeAm",
  DROP COLUMN IF EXISTS "rechnungsnummer",
  DROP COLUMN IF EXISTS "rechnungVon",
  DROP COLUMN IF EXISTS "rechnungAm";
DROP TYPE IF EXISTS "AbrechnungStatus";
