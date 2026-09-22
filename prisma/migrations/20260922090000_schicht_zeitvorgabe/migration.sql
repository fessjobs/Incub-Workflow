-- Zeitvorgabe je Schicht: die erste erfasste Person kann ihre Ist-Zeiten für
-- alle auf derselben Schicht übernehmen. Die Vorgabe füllt nur die Formulare
-- vor; die Unterschrift bleibt bei jeder Person selbst.
ALTER TABLE "shifts" ADD COLUMN "vorgabeStart" TIMESTAMP(3);
ALTER TABLE "shifts" ADD COLUMN "vorgabeEnde" TIMESTAMP(3);
ALTER TABLE "shifts" ADD COLUMN "vorgabePause" INTEGER;
ALTER TABLE "shifts" ADD COLUMN "vorgabeVon" TEXT;
ALTER TABLE "shifts" ADD COLUMN "vorgabeAm" TIMESTAMP(3);
