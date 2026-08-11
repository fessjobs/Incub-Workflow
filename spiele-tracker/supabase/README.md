# Supabase

## Migrationen einspielen

Die Dateien in `migrations/` sind nummeriert und **müssen in dieser
Reihenfolge** laufen – spätere Migrationen setzen Tabellen und Funktionen der
früheren voraus.

### Variante A: Supabase CLI

```bash
npx supabase link --project-ref <dein-project-ref>
npx supabase db push
```

### Variante B: SQL-Editor im Dashboard

Dateien der Reihe nach öffnen, Inhalt einfügen, ausführen:

```
0001_extensions.sql            Extensions, updated_at-Trigger
0002_profiles.sql              Profile + Trigger auf auth.users
0003_groups.sql                Gruppen und Mitgliedschaften
0004_helpers.sql               SECURITY-DEFINER-Helfer, create_group, join_group_by_code
0005_sessions_events.sql       Sessions, Tags, das Event-Log, die aufgelöste View
0006_progression.sql           XP, Coins, Achievements, Shop
0007_notifications.sql         Benachrichtigungen, Spielaufrufe, Realtime
0008_rls_policies.sql          Row Level Security für alles
0009_storage.sql               Buckets avatars und session-audio
0010_seed_reference_data.sql   Achievement-Regeln und Shop-Sortiment
```

Alle Migrationen sind idempotent – ein zweiter Lauf schadet nicht.

## Danach im Dashboard einstellen

**Authentication → URL Configuration**
Site URL und Redirect URL auf `<deine-app-url>/auth/callback` setzen.
Für die lokale Entwicklung zusätzlich `http://localhost:5173/auth/callback`.

**Authentication → Providers**
- *Email*: Magic Link aktivieren
- *Google*: aktivieren, Client-ID und Secret aus der Google Cloud Console

**Storage**
Die Buckets legt `0009_storage.sql` an. Nichts weiter zu tun.

## Tests

`test/` prüft die Migrationen und – wichtiger – ob die RLS-Policies wirklich
das tun, was sie sollen. Läuft gegen ein **lokales Postgres 16**, nicht gegen
dein Supabase-Projekt.

```bash
PGHOST=/var/run/postgresql PGUSER=postgres supabase/test/run.sh
```

Der Lauf:

1. legt eine Wegwerf-Datenbank an
2. baut mit `00_supabase_stub.sql` die Supabase-Plattformobjekte nach
   (`auth.users`, `auth.uid()`, `storage.*`, die Rollen `anon`/`authenticated`/
   `service_role`) – das ist reiner Testcode und läuft nie gegen ein echtes Projekt
3. spielt alle Migrationen **zweimal** ein, um Idempotenz zu prüfen
4. fährt `01_rls_test.sql`: drei Nutzer, zwei davon in einer Gruppe, und prüft
   unter anderem, dass der Dritte nichts sieht, dass `update`/`delete` auf
   `game_events` ins Leere greifen und dass ein Kauf ohne Deckung scheitert

Jede fehlgeschlagene Zusicherung bricht den Lauf mit `FAIL: <Beschreibung>` ab.

## Hinweise

- Der `service_role`-Key umgeht RLS vollständig. Er gehört auf keinen Fall in
  den Browser und nicht in dieses Repository.
- `game_events` ist für Clients append-only, weil es dort schlicht keine
  `update`- und `delete`-Policy gibt. Der `service_role`-Key kann trotzdem
  eingreifen – gewollt, damit sich ein kaputter Datensatz notfalls reparieren
  lässt.
