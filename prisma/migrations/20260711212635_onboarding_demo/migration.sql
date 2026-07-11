-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
