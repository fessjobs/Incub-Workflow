-- CreateEnum
CREATE TYPE "PaidStatus" AS ENUM ('BEZAHLT', 'ZU_ZAHLEN');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'BUCHHALTUNG';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "employeeLinkPassword" TEXT NOT NULL DEFAULT '123';

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "corporateCardId" TEXT,
ADD COLUMN     "paidStatus" "PaidStatus" NOT NULL DEFAULT 'BEZAHLT',
ADD COLUMN     "viaEmployeeLink" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "corporate_cards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "holderUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corporate_cards_organizationId_idx" ON "corporate_cards"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_cards_organizationId_label_key" ON "corporate_cards"("organizationId", "label");

-- AddForeignKey
ALTER TABLE "corporate_cards" ADD CONSTRAINT "corporate_cards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_cards" ADD CONSTRAINT "corporate_cards_holderUserId_fkey" FOREIGN KEY ("holderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_corporateCardId_fkey" FOREIGN KEY ("corporateCardId") REFERENCES "corporate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
