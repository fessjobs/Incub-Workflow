-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "isFuel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "odometerKm" INTEGER,
ADD COLUMN     "vehicleId" TEXT;

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_organizationId_idx" ON "vehicles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_name_key" ON "vehicles"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bestehende Installationen: Tank-Kategorie bekommt die Fahrzeug-Zusatzfelder
UPDATE "categories" SET "isFuel" = true WHERE "name" = 'Fahrtkosten/Tanken';
