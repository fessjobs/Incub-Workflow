-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EINREICHER';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "submittedByName" TEXT;
