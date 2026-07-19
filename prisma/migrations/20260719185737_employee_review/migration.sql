-- CreateEnum
CREATE TYPE "EmployeeReviewStatus" AS ENUM ('AUSSTEHEND', 'FREIGEGEBEN', 'ABGELEHNT');

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "employeeReview" "EmployeeReviewStatus",
ADD COLUMN     "employeeReviewComment" TEXT;

-- Bestehende Mitarbeiter-Link-Belege in den Freigabe-Workflow aufnehmen
UPDATE "receipts" SET "employeeReview" = 'AUSSTEHEND' WHERE "viaEmployeeLink" = true;
