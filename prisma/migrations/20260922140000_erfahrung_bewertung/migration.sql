-- Interne Beurteilung der Dispo nach einem Einsatz: je Person und Schicht
-- genau eine Bewertung (negativ / neutral / positiv) mit optionaler Notiz.
-- Nur im Backend sichtbar, nie im Mitarbeiter-Link und nie auf einem PDF.
CREATE TYPE "RatingWert" AS ENUM ('NEGATIV', 'NEUTRAL', 'POSITIV');

CREATE TABLE "shift_ratings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftAssignmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "wert" "RatingWert" NOT NULL,
    "notiz" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_ratings_shiftAssignmentId_key" ON "shift_ratings"("shiftAssignmentId");
CREATE INDEX "shift_ratings_organizationId_employeeId_createdAt_idx" ON "shift_ratings"("organizationId", "employeeId", "createdAt");

ALTER TABLE "shift_ratings" ADD CONSTRAINT "shift_ratings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_ratings" ADD CONSTRAINT "shift_ratings_shiftAssignmentId_fkey" FOREIGN KEY ("shiftAssignmentId") REFERENCES "shift_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_ratings" ADD CONSTRAINT "shift_ratings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
