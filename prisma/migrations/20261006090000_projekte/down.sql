ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_projectId_fkey";
DROP INDEX IF EXISTS "assignments_projectId_idx";
ALTER TABLE "assignments" DROP COLUMN IF EXISTS "projectId";
DROP TABLE IF EXISTS "projects";
