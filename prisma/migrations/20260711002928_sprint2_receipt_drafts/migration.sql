-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_companyId_fkey";

-- AlterTable
ALTER TABLE "receipts" ALTER COLUMN "companyId" DROP NOT NULL,
ALTER COLUMN "receiptNumber" DROP NOT NULL,
ALTER COLUMN "numberYear" DROP NOT NULL,
ALTER COLUMN "numberSeq" DROP NOT NULL,
ALTER COLUMN "vendor" SET DEFAULT '',
ALTER COLUMN "grossAmount" SET DEFAULT 0,
ALTER COLUMN "kind" SET DEFAULT 'AUSLAGE';

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
