-- Wer hat die Angaben zur Abrechnung an die Buchhaltung gemeldet, und wann
ALTER TABLE "assignments" ADD COLUMN "angabenVon" TEXT;
ALTER TABLE "assignments" ADD COLUMN "angabenAm" TIMESTAMP(3);
