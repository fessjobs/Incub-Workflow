-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('AUSLAGE', 'FIRMENZAHLUNG', 'PRIVAT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BAR', 'PRIVATE_KARTE', 'FIRMENKARTE', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ENTWURF', 'ABGELEGT');

-- CreateEnum
CREATE TYPE "ReimbursementStatus" AS ENUM ('OFFEN', 'EINGEREICHT', 'ERSTATTET');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'incub:workflow',
    "tagline" TEXT NOT NULL DEFAULT 'Belege. Erledigt.',
    "primaryColor" TEXT NOT NULL DEFAULT '#0B1220',
    "logoUrl" TEXT,
    "storagePath" TEXT NOT NULL DEFAULT './incubWorkflow-Ablage',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_access" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "color" TEXT,
    "location" TEXT,
    "legalName" TEXT,
    "address" TEXT,
    "shortCode" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isHospitality" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "numberYear" INTEGER NOT NULL,
    "numberSeq" INTEGER NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2),
    "vatLines" JSONB,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UNBEKANNT',
    "kind" "ReceiptKind" NOT NULL,
    "purpose" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "hospitalityGuests" TEXT,
    "hospitalityOccasion" TEXT,
    "hospitalityLocation" TEXT,
    "isSelfReceipt" BOOLEAN NOT NULL DEFAULT false,
    "selfReceiptReason" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ENTWURF',
    "reimbursementStatus" "ReimbursementStatus" NOT NULL DEFAULT 'OFFEN',
    "reimbursedAt" TIMESTAMP(3),
    "originalPath" TEXT,
    "pdfPath" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_versions" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "pdfPath" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_number_counters" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_number_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "counterparty" TEXT,
    "purpose" TEXT,
    "raw" JSONB,
    "matchedReceiptId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "matchRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'IGNORE',
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "companies_organizationId_idx" ON "companies"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_organizationId_shortCode_key" ON "companies"("organizationId", "shortCode");

-- CreateIndex
CREATE INDEX "categories_organizationId_idx" ON "categories"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organizationId_name_key" ON "categories"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_organizationId_idx" ON "receipts"("organizationId");

-- CreateIndex
CREATE INDEX "receipts_organizationId_userId_idx" ON "receipts"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "receipts_organizationId_companyId_idx" ON "receipts"("organizationId", "companyId");

-- CreateIndex
CREATE INDEX "receipts_organizationId_receiptDate_idx" ON "receipts"("organizationId", "receiptDate");

-- CreateIndex
CREATE INDEX "receipts_organizationId_grossAmount_receiptDate_vendor_idx" ON "receipts"("organizationId", "grossAmount", "receiptDate", "vendor");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_versions_receiptId_versionNo_key" ON "receipt_versions"("receiptId", "versionNo");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_idx" ON "bank_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "bank_transactions_organizationId_idx" ON "bank_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_bookingDate_idx" ON "bank_transactions"("bankAccountId", "bookingDate");

-- CreateIndex
CREATE INDEX "match_rules_organizationId_idx" ON "match_rules"("organizationId");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_createdAt_idx" ON "audit_log"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_versions" ADD CONSTRAINT "receipt_versions_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_versions" ADD CONSTRAINT "receipt_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_number_counters" ADD CONSTRAINT "receipt_number_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchedReceiptId_fkey" FOREIGN KEY ("matchedReceiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchRuleId_fkey" FOREIGN KEY ("matchRuleId") REFERENCES "match_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_rules" ADD CONSTRAINT "match_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
