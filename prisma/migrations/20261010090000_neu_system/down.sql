-- Rückweg des neuen Systems: entfernt NUR die vier neuen Tabellen.
-- Der Bestand (Belege, Einsätze, Stunden, Dokumente) ist davon nicht berührt.
DROP TABLE IF EXISTS "v2_files";
DROP TABLE IF EXISTS "v2_access";
DROP TABLE IF EXISTS "v2_audit";
DROP TABLE IF EXISTS "v2_records";
