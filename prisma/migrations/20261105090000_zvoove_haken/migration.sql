-- Einsatzliste: Haken „Stunden in zvoove“. Drei neue Spalten mit Standardwert, bestehende Daten bleiben unverändert.
ALTER TABLE "assignments" ADD COLUMN "zvooveErledigt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assignments" ADD COLUMN "zvooveVon" TEXT;
ALTER TABLE "assignments" ADD COLUMN "zvooveAm" TIMESTAMP(3);
