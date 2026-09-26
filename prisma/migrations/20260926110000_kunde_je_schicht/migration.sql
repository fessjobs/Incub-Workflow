-- Der Kunde kann je Schicht bestätigen; dann entsteht je Schicht ein
-- Stundennachweis. Ohne shiftId gilt beides weiter für den ganzen Einsatz.
ALTER TABLE "assignment_confirmations" ADD COLUMN "shiftId" TEXT;
CREATE INDEX "assignment_confirmations_shiftId_idx" ON "assignment_confirmations"("shiftId");
ALTER TABLE "assignment_confirmations" ADD CONSTRAINT "assignment_confirmations_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents_link" ADD COLUMN "shiftId" TEXT;
CREATE INDEX "documents_link_shiftId_idx" ON "documents_link"("shiftId");
ALTER TABLE "documents_link" ADD CONSTRAINT "documents_link_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
