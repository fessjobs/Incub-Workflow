-- Modul "Einsätze & Stundennachweise"
-- Trigram-Index für das Fuzzy-Namensmatching (pg_trgm gehört zu den Standard-
-- Contrib-Modulen von PostgreSQL; auf Railway verfügbar).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('AKTIV', 'INAKTIV');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ENTWURF', 'KONKRETISIERT', 'LAUFEND', 'ABGESCHLOSSEN', 'ABGERECHNET');

-- CreateEnum
CREATE TYPE "ShiftRole" AS ENUM ('MITARBEITER', 'ANSPRECHPARTNER', 'SPARE');

-- CreateEnum
CREATE TYPE "ShiftAssignmentStatus" AS ENUM ('GEPLANT', 'BESTAETIGT', 'ERFASST', 'FREIGEGEBEN', 'STORNIERT');

-- CreateEnum
CREATE TYPE "PkwArt" AS ENUM ('PRIVAT', 'FIRMA');

-- CreateEnum
CREATE TYPE "TimeEntryReview" AS ENUM ('ERFASST', 'GEPRUEFT', 'FREIGEGEBEN');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('MITARBEITER', 'CREW', 'DISPO');

-- CreateEnum
CREATE TYPE "WageRuleType" AS ENUM ('NORMAL', 'NACHT', 'SONNTAG', 'FEIERTAG', 'GARANTIE', 'FAHRT_PRIVAT', 'FAHRT_FIRMA', 'ZULAGE', 'SPESEN', 'ABZUG');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OFFEN', 'LAEUFT', 'ERLEDIGT', 'FEHLER');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adresse" TEXT,
    "ustid" TEXT,
    "ansprechpartner" TEXT,
    "ansprechpartnerEmail" TEXT,
    "ansprechpartnerTelefon" TEXT,
    "standardEinsatzort" TEXT,
    "bundesland" TEXT,
    "aueVertragRef" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "personalnummer" TEXT,
    "email" TEXT,
    "mobil" TEXT,
    "geburtsdatum" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'AKTIV',
    "lohnartDefaults" JSONB,
    "zvooveId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projekt" TEXT NOT NULL,
    "artist" TEXT,
    "einsatzort" TEXT NOT NULL,
    "bundesland" TEXT,
    "datumVon" DATE NOT NULL,
    "datumBis" DATE NOT NULL,
    "einsatznummer" TEXT NOT NULL,
    "einsatzbereich" TEXT,
    "aueVertragRef" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ENTWURF',
    "notizen" TEXT,
    "rawInput" TEXT,
    "parsedJson" JSONB,
    "crewToken" TEXT,
    "crewTokenExpiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_number_counters" (
    "organizationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assignment_number_counters_pkey" PRIMARY KEY ("organizationId","day")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "taetigkeit" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "planStart" TIMESTAMP(3) NOT NULL,
    "planEnde" TIMESTAMP(3) NOT NULL,
    "treffpunkt" TEXT,
    "anzahlSoll" INTEGER,
    "garantieStunden" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rolle" "ShiftRole" NOT NULL DEFAULT 'MITARBEITER',
    "planStart" TIMESTAMP(3) NOT NULL,
    "planEnde" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenUsedAt" TIMESTAMP(3),
    "status" "ShiftAssignmentStatus" NOT NULL DEFAULT 'GEPLANT',
    "linkSentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftAssignmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "aktuell" BOOLEAN NOT NULL DEFAULT true,
    "korrigiertVonId" TEXT,
    "korrekturGrund" TEXT,
    "istStart" TIMESTAMP(3) NOT NULL,
    "istEnde" TIMESTAMP(3) NOT NULL,
    "pauseMinuten" INTEGER NOT NULL DEFAULT 0,
    "stundenGesamt" DECIMAL(5,2) NOT NULL,
    "taetigkeit" TEXT,
    "notiz" TEXT,
    "pkw" BOOLEAN NOT NULL DEFAULT false,
    "pkwArt" "PkwArt",
    "spesen" BOOLEAN NOT NULL DEFAULT false,
    "spesenBetrag" DECIMAL(10,2),
    "unterschriftMitarbeiterUrl" TEXT,
    "unterschriftZeitpunkt" TIMESTAMP(3),
    "unterweisungBestaetigt" BOOLEAN NOT NULL DEFAULT false,
    "unterweisungVersion" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "geraet" TEXT,
    "quelle" "TimeEntrySource" NOT NULL DEFAULT 'MITARBEITER',
    "review" "TimeEntryReview" NOT NULL DEFAULT 'ERFASST',
    "geprueftVon" TEXT,
    "geprueftAm" TIMESTAMP(3),
    "freigegebenVon" TEXT,
    "freigegebenAm" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "von" TEXT NOT NULL,
    "nach" TEXT NOT NULL,
    "km" DECIMAL(7,1) NOT NULL,
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_confirmations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "kundeName" TEXT NOT NULL,
    "unterschriftUrl" TEXT NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "assignment_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "meta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents_link" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "employeeId" TEXT,
    "customerId" TEXT,
    "datum" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typ" "WageRuleType" NOT NULL,
    "bedingung" JSONB NOT NULL,
    "lohnart" TEXT NOT NULL,
    "faktor" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_deductions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "lohnart" TEXT NOT NULL,
    "stunden" DECIMAL(6,2),
    "betrag" DECIMAL(10,2),
    "grund" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_locks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "gesperrtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gesperrtVon" TEXT,

    CONSTRAINT "month_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'OFFEN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "result" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_organizationId_idx" ON "customers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organizationId_name_key" ON "customers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "employees_organizationId_nachname_vorname_idx" ON "employees"("organizationId", "nachname", "vorname");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_personalnummer_key" ON "employees"("organizationId", "personalnummer");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_crewToken_key" ON "assignments"("crewToken");

-- CreateIndex
CREATE INDEX "assignments_organizationId_status_datumVon_idx" ON "assignments"("organizationId", "status", "datumVon");

-- CreateIndex
CREATE INDEX "assignments_organizationId_customerId_idx" ON "assignments"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_organizationId_einsatznummer_key" ON "assignments"("organizationId", "einsatznummer");

-- CreateIndex
CREATE INDEX "shifts_organizationId_datum_idx" ON "shifts"("organizationId", "datum");

-- CreateIndex
CREATE INDEX "shifts_assignmentId_idx" ON "shifts"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_token_key" ON "shift_assignments"("token");

-- CreateIndex
CREATE INDEX "shift_assignments_organizationId_employeeId_planStart_idx" ON "shift_assignments"("organizationId", "employeeId", "planStart");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_shiftId_employeeId_key" ON "shift_assignments"("shiftId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_korrigiertVonId_key" ON "time_entries"("korrigiertVonId");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_aktuell_istStart_idx" ON "time_entries"("organizationId", "aktuell", "istStart");

-- CreateIndex
CREATE INDEX "time_entries_shiftAssignmentId_aktuell_idx" ON "time_entries"("shiftAssignmentId", "aktuell");

-- CreateIndex
CREATE INDEX "trips_timeEntryId_idx" ON "trips"("timeEntryId");

-- CreateIndex
CREATE INDEX "assignment_confirmations_assignmentId_idx" ON "assignment_confirmations"("assignmentId");

-- CreateIndex
CREATE INDEX "documents_organizationId_category_createdAt_idx" ON "documents"("organizationId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "documents_link_documentId_idx" ON "documents_link"("documentId");

-- CreateIndex
CREATE INDEX "documents_link_assignmentId_idx" ON "documents_link"("assignmentId");

-- CreateIndex
CREATE INDEX "documents_link_employeeId_idx" ON "documents_link"("employeeId");

-- CreateIndex
CREATE INDEX "documents_link_customerId_idx" ON "documents_link"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "blobs_key_key" ON "blobs"("key");

-- CreateIndex
CREATE INDEX "blobs_organizationId_idx" ON "blobs"("organizationId");

-- CreateIndex
CREATE INDEX "wage_rules_organizationId_aktiv_idx" ON "wage_rules"("organizationId", "aktiv");

-- CreateIndex
CREATE INDEX "manual_deductions_organizationId_datum_idx" ON "manual_deductions"("organizationId", "datum");

-- CreateIndex
CREATE UNIQUE INDEX "month_locks_organizationId_jahr_monat_key" ON "month_locks"("organizationId", "jahr", "monat");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupeKey_key" ON "jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shiftAssignmentId_fkey" FOREIGN KEY ("shiftAssignmentId") REFERENCES "shift_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_korrigiertVonId_fkey" FOREIGN KEY ("korrigiertVonId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_confirmations" ADD CONSTRAINT "assignment_confirmations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_confirmations" ADD CONSTRAINT "assignment_confirmations_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_link" ADD CONSTRAINT "documents_link_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_link" ADD CONSTRAINT "documents_link_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_link" ADD CONSTRAINT "documents_link_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_link" ADD CONSTRAINT "documents_link_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_rules" ADD CONSTRAINT "wage_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_deductions" ADD CONSTRAINT "manual_deductions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_deductions" ADD CONSTRAINT "manual_deductions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_locks" ADD CONSTRAINT "month_locks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Trigram-Index auf dem normalisierten Namen (Fuzzy-Matching im Parser)
CREATE INDEX "employees_name_trgm_idx" ON "employees" USING gin ((lower("vorname" || ' ' || "nachname")) gin_trgm_ops);
