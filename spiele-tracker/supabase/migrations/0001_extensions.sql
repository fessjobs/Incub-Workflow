-- 0001_extensions.sql
-- Basis: Extensions und geteilte Trigger-Funktionen.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- Freitextsuche im Logbuch

-- Hält updated_at aktuell. Wird von mehreren Tabellen per Trigger genutzt.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
