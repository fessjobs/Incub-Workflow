-- Eigener Gruppenlink je Schicht, damit die Dispo Links auch für einzelne
-- Schichten verschicken kann (mehrtägige Einsätze, eigene Gruppe je Tag).
ALTER TABLE "shifts" ADD COLUMN "crewToken" TEXT;
ALTER TABLE "shifts" ADD COLUMN "crewTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "shifts_crewToken_key" ON "shifts"("crewToken");

-- Bestehende Schichten bekommen sofort einen Token; Ablauf wie beim
-- Gruppenlink des Einsatzes (30 Tage nach dem letzten Einsatztag).
UPDATE "shifts" s
   SET "crewToken" = gen_random_uuid()::text,
       "crewTokenExpiresAt" = (a."datumBis" + interval '30 days 23 hours 59 minutes')
  FROM "assignments" a
 WHERE a."id" = s."assignmentId";
