-- Rollback: Rolle DISPONENT entfernen (betroffene Nutzer werden zu MEMBER)
UPDATE "users" SET "role" = 'MEMBER' WHERE "role" = 'DISPONENT';
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUCHHALTUNG', 'MEMBER', 'EINREICHER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "UserRole_old";
