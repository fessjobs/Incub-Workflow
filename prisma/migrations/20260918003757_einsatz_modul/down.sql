-- Rollback für 20260918003757_einsatz_modul
-- Ausführen mit: psql "$DATABASE_URL" -f prisma/migrations/20260918003757_einsatz_modul/down.sql
-- und anschließend: DELETE FROM "_prisma_migrations" WHERE migration_name = '20260918003757_einsatz_modul';
DROP INDEX IF EXISTS "employees_name_trgm_idx";
DROP TABLE IF EXISTS "jobs";
DROP TABLE IF EXISTS "month_locks";
DROP TABLE IF EXISTS "manual_deductions";
DROP TABLE IF EXISTS "wage_rules";
DROP TABLE IF EXISTS "blobs";
DROP TABLE IF EXISTS "documents_link";
DROP TABLE IF EXISTS "documents";
DROP TABLE IF EXISTS "assignment_confirmations";
DROP TABLE IF EXISTS "trips";
DROP TABLE IF EXISTS "time_entries";
DROP TABLE IF EXISTS "shift_assignments";
DROP TABLE IF EXISTS "shifts";
DROP TABLE IF EXISTS "assignment_number_counters";
DROP TABLE IF EXISTS "assignments";
DROP TABLE IF EXISTS "employees";
DROP TABLE IF EXISTS "customers";
DROP TYPE IF EXISTS "JobStatus";
DROP TYPE IF EXISTS "WageRuleType";
DROP TYPE IF EXISTS "TimeEntrySource";
DROP TYPE IF EXISTS "TimeEntryReview";
DROP TYPE IF EXISTS "PkwArt";
DROP TYPE IF EXISTS "ShiftAssignmentStatus";
DROP TYPE IF EXISTS "ShiftRole";
DROP TYPE IF EXISTS "AssignmentStatus";
DROP TYPE IF EXISTS "EmployeeStatus";
