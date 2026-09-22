-- Rollback: Zeitvorgabe je Schicht entfernen
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "vorgabeStart";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "vorgabeEnde";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "vorgabePause";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "vorgabeVon";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "vorgabeAm";
