-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthYear" INTEGER,
    "age" INTEGER,
    "city" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "languages" TEXT,
    "mobility" TEXT,
    "experiences" JSONB,
    "qualifications" JSONB,
    "skills" JSONB,
    "profileText" TEXT,
    "notes" TEXT,
    "photoBytes" BYTEA,
    "photoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setcards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "einsatzbereich" TEXT NOT NULL,
    "profileNo" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "pdfBytes" BYTEA,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setcards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "persons_organizationId_lastName_idx" ON "persons"("organizationId", "lastName");

-- CreateIndex
CREATE INDEX "setcards_organizationId_personId_idx" ON "setcards"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setcards" ADD CONSTRAINT "setcards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setcards" ADD CONSTRAINT "setcards_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setcards" ADD CONSTRAINT "setcards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
