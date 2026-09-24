-- Weg eines Einsatzes zur Rechnung: die Dispo gibt frei, die Buchhaltung
-- schreibt die Rechnung und trägt die Rechnungsnummer ein.
CREATE TYPE "AbrechnungStatus" AS ENUM ('OFFEN', 'FREIGEGEBEN', 'BERECHNET');

ALTER TABLE "assignments" ADD COLUMN "abrechnung" "AbrechnungStatus" NOT NULL DEFAULT 'OFFEN';
ALTER TABLE "assignments" ADD COLUMN "angebotsnummer" TEXT;
ALTER TABLE "assignments" ADD COLUMN "konditionen" TEXT;
ALTER TABLE "assignments" ADD COLUMN "abrechnungHinweis" TEXT;
ALTER TABLE "assignments" ADD COLUMN "freigabeVon" TEXT;
ALTER TABLE "assignments" ADD COLUMN "freigabeAm" TIMESTAMP(3);
ALTER TABLE "assignments" ADD COLUMN "rechnungsnummer" TEXT;
ALTER TABLE "assignments" ADD COLUMN "rechnungVon" TEXT;
ALTER TABLE "assignments" ADD COLUMN "rechnungAm" TIMESTAMP(3);

CREATE INDEX "assignments_organizationId_abrechnung_datumVon_idx" ON "assignments"("organizationId", "abrechnung", "datumVon");

-- Bereits abgerechnete Einsätze gelten als berechnet
UPDATE "assignments" SET "abrechnung" = 'BERECHNET' WHERE "status" = 'ABGERECHNET';
