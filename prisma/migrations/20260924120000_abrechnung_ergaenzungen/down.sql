DROP TABLE IF EXISTS "assignment_adjustments";
DROP TYPE IF EXISTS "ErgaenzungArt";

-- Einen Enum-Wert entfernt Postgres nur über einen neuen Typ.
UPDATE "assignments" SET "abrechnung" = 'FREIGEGEBEN' WHERE "abrechnung" = 'BEREIT';
ALTER TYPE "AbrechnungStatus" RENAME TO "AbrechnungStatus_old";
CREATE TYPE "AbrechnungStatus" AS ENUM ('OFFEN', 'FREIGEGEBEN', 'BERECHNET');
ALTER TABLE "assignments" ALTER COLUMN "abrechnung" DROP DEFAULT;
ALTER TABLE "assignments" ALTER COLUMN "abrechnung" TYPE "AbrechnungStatus" USING ("abrechnung"::text::"AbrechnungStatus");
ALTER TABLE "assignments" ALTER COLUMN "abrechnung" SET DEFAULT 'OFFEN';
DROP TYPE "AbrechnungStatus_old";
