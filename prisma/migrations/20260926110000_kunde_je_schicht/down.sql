ALTER TABLE "documents_link" DROP CONSTRAINT IF EXISTS "documents_link_shiftId_fkey";
DROP INDEX IF EXISTS "documents_link_shiftId_idx";
ALTER TABLE "documents_link" DROP COLUMN IF EXISTS "shiftId";

-- Bestätigungen einzelner Schichten zählen danach wieder für den ganzen Einsatz.
ALTER TABLE "assignment_confirmations" DROP CONSTRAINT IF EXISTS "assignment_confirmations_shiftId_fkey";
DROP INDEX IF EXISTS "assignment_confirmations_shiftId_idx";
ALTER TABLE "assignment_confirmations" DROP COLUMN IF EXISTS "shiftId";
