-- CreateEnum
CREATE TYPE "MonthSheetKunde" AS ENUM ('OFFEN', 'ZURUECK', 'BESTAETIGT');

-- CreateTable
CREATE TABLE "month_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "monat" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "kontakt" TEXT,
    "assignmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "month_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_sheets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tage" JSONB NOT NULL DEFAULT '[]',
    "linkSentAt" TIMESTAMP(3),
    "personSignedAt" TIMESTAMP(3),
    "personSignatureUrl" TEXT,
    "personIp" TEXT,
    "personUserAgent" TEXT,
    "kundeStatus" "MonthSheetKunde" NOT NULL DEFAULT 'OFFEN',
    "kundeHinweis" TEXT,
    "kundeAm" TIMESTAMP(3),
    "kundeName" TEXT,
    "kundeSignatureUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "month_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "month_batches_token_key" ON "month_batches"("token");

-- CreateIndex
CREATE UNIQUE INDEX "month_batches_assignmentId_key" ON "month_batches"("assignmentId");

-- CreateIndex
CREATE INDEX "month_batches_organizationId_monat_idx" ON "month_batches"("organizationId", "monat");

-- CreateIndex
CREATE UNIQUE INDEX "month_batches_organizationId_customerId_monat_key" ON "month_batches"("organizationId", "customerId", "monat");

-- CreateIndex
CREATE UNIQUE INDEX "month_sheets_token_key" ON "month_sheets"("token");

-- CreateIndex
CREATE INDEX "month_sheets_organizationId_employeeId_idx" ON "month_sheets"("organizationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "month_sheets_batchId_employeeId_key" ON "month_sheets"("batchId", "employeeId");

-- AddForeignKey
ALTER TABLE "month_batches" ADD CONSTRAINT "month_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_batches" ADD CONSTRAINT "month_batches_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_batches" ADD CONSTRAINT "month_batches_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_sheets" ADD CONSTRAINT "month_sheets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_sheets" ADD CONSTRAINT "month_sheets_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "month_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_sheets" ADD CONSTRAINT "month_sheets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
