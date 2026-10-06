-- Projekt als Sammelmappe über mehrere Einsätze: eine Rechnung statt fünf.
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "angebotsnummer" TEXT,
    "konditionen" TEXT,
    "abrechnungHinweis" TEXT,
    "angabenVon" TEXT,
    "angabenAm" TIMESTAMP(3),
    "rechnungsnummer" TEXT,
    "rechnungVon" TEXT,
    "rechnungAm" TIMESTAMP(3),
    "notizen" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_organizationId_createdAt_idx" ON "projects"("organizationId", "createdAt");

ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assignments" ADD COLUMN "projectId" TEXT;
CREATE INDEX "assignments_projectId_idx" ON "assignments"("projectId");
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
