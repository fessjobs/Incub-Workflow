-- Rückweg: Links ohne Person gibt es danach nicht mehr. Zettel ohne Person (noch nicht unterschrieben) werden gelöscht,
-- alle übrigen bleiben unverändert.
DELETE FROM "month_sheets" WHERE "employeeId" IS NULL;
ALTER TABLE "month_sheets" ALTER COLUMN "employeeId" SET NOT NULL;
ALTER TABLE "month_sheets" DROP COLUMN "nachname";
ALTER TABLE "month_sheets" DROP COLUMN "vorname";
ALTER TABLE "month_sheets" DROP COLUMN "nameOffen";
