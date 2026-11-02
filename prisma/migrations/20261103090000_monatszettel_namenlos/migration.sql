-- Monatszettel: Links ohne vorab gewählte Person. Die Person trägt ihren Namen selbst im Link ein.
-- Nur die Monatszettel-Tabelle ist betroffen; alle anderen Tabellen bleiben unverändert.
ALTER TABLE "month_sheets" ALTER COLUMN "employeeId" DROP NOT NULL;
ALTER TABLE "month_sheets" ADD COLUMN "nameOffen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "month_sheets" ADD COLUMN "vorname" TEXT;
ALTER TABLE "month_sheets" ADD COLUMN "nachname" TEXT;
