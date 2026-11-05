-- Rückweg: entfernt nur den Haken „Stunden in zvoove“.
ALTER TABLE "assignments" DROP COLUMN "zvooveAm";
ALTER TABLE "assignments" DROP COLUMN "zvooveVon";
ALTER TABLE "assignments" DROP COLUMN "zvooveErledigt";
