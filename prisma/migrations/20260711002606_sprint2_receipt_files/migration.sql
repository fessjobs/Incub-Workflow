-- CreateEnum
CREATE TYPE "ReceiptFileKind" AS ENUM ('ORIGINAL', 'PDF');

-- CreateTable
CREATE TABLE "receipt_files" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "kind" "ReceiptFileKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_files_receiptId_kind_idx" ON "receipt_files"("receiptId", "kind");

-- AddForeignKey
ALTER TABLE "receipt_files" ADD CONSTRAINT "receipt_files_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
