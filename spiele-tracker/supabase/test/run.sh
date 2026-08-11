#!/usr/bin/env bash
# Spielt alle Migrationen in eine frische Wegwerf-Datenbank und prüft die
# RLS-Policies. Braucht ein lokales Postgres 16 – kein Supabase-Projekt.
#
#   supabase/test/run.sh                 # nutzt PGHOST/PGPORT/PGUSER aus der Umgebung
#   PGPORT=55432 supabase/test/run.sh
#
# Läuft die Migrationen zweimal durch, damit Idempotenz mitgeprüft wird.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
DB="${TEST_DB:-spiele_tracker_test}"

psql_admin() { psql -v ON_ERROR_STOP=1 -q -d postgres "$@"; }
psql_test()  { psql -v ON_ERROR_STOP=1 -q -d "$DB" "$@"; }

echo "==> Datenbank $DB neu anlegen"
psql_admin -c "drop database if exists $DB;" -c "create database $DB;"

echo "==> Supabase-Stub"
psql_test -f "$HERE/00_supabase_stub.sql"

for pass in 1 2; do
  echo "==> Migrationen, Durchlauf $pass"
  for f in "$ROOT"/migrations/*.sql; do
    printf '    %s\n' "$(basename "$f")"
    psql_test -f "$f" 2>&1 | grep -v '^NOTICE:.*does not exist, skipping$' || true
  done
done

echo "==> RLS-Tests"
# Nur die NOTICEs interessieren; die leeren Ergebniszeilen der Assert-Aufrufe
# filtern wir raus. ON_ERROR_STOP sorgt dafür, dass ein FAIL den Lauf beendet.
psql_test -t -f "$HERE/01_rls_test.sql" 2>&1 \
  | grep -E '^(NOTICE|ERROR|psql:)' \
  | sed -E 's/^NOTICE:  /    /; s#^psql:[^:]*:[0-9]+: ##'

echo "==> Bestanden"
