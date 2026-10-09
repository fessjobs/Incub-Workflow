-- Neues System, parallel zum Bestand: nur neue Tabellen, kein Eingriff in bestehende.
-- Rückweg: down.sql in diesem Ordner.

-- CreateTable
CREATE TABLE "v2_records" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "v2_records_pkey" PRIMARY KEY ("organizationId","kind","id")
);

-- CreateTable
CREATE TABLE "v2_audit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL,
    "tabelle" TEXT NOT NULL,
    "datensatz" TEXT NOT NULL,
    "feld" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "neu" TEXT NOT NULL DEFAULT '',
    "grund" TEXT,

    CONSTRAINT "v2_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_access" (
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "v2_access_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "v2_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v2_records_organizationId_kind_idx" ON "v2_records"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "v2_audit_organizationId_zeitpunkt_idx" ON "v2_audit"("organizationId", "zeitpunkt");

-- CreateIndex
CREATE INDEX "v2_access_organizationId_kind_idx" ON "v2_access"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "v2_access_kind_refId_idx" ON "v2_access"("kind", "refId");

-- CreateIndex
CREATE INDEX "v2_files_organizationId_kind_idx" ON "v2_files"("organizationId", "kind");
