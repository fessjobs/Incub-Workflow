-- CreateTable
CREATE TABLE "transaction_receipt_links" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_receipt_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_receipt_links_receiptId_idx" ON "transaction_receipt_links"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_receipt_links_transactionId_receiptId_key" ON "transaction_receipt_links"("transactionId", "receiptId");

-- AddForeignKey
ALTER TABLE "transaction_receipt_links" ADD CONSTRAINT "transaction_receipt_links_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_receipt_links" ADD CONSTRAINT "transaction_receipt_links_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
