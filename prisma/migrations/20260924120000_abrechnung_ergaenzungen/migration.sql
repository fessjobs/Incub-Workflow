-- Neue Station zwischen Freigabe und Rechnung: der Admin ergänzt die Angaben
-- zur Abrechnung, erst danach schreibt die Buchhaltung die Rechnung.
ALTER TYPE "AbrechnungStatus" ADD VALUE IF NOT EXISTS 'BEREIT' BEFORE 'BERECHNET';

-- Ergänzungen, die die Buchhaltung zusätzlich zu den Stunden aufnimmt
CREATE TYPE "ErgaenzungArt" AS ENUM ('BONUS', 'FAHRTKOSTEN', 'SPESEN', 'ZUSCHLAG', 'ABZUG', 'SONSTIGES');

CREATE TABLE "assignment_adjustments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "employeeId" TEXT,
    "art" "ErgaenzungArt" NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "bemerkung" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assignment_adjustments_organizationId_assignmentId_idx" ON "assignment_adjustments"("organizationId", "assignmentId");

ALTER TABLE "assignment_adjustments" ADD CONSTRAINT "assignment_adjustments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_adjustments" ADD CONSTRAINT "assignment_adjustments_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_adjustments" ADD CONSTRAINT "assignment_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
