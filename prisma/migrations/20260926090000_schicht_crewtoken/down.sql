DROP INDEX IF EXISTS "shifts_crewToken_key";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "crewToken";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "crewTokenExpiresAt";
