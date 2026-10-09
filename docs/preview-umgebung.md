# Backup und Preview-Umgebung: Schritt für Schritt (für Maik)

Stand: 09.10.2026 · Diese zwei Schritte passieren **in Railway**, nicht im Code. Ich kann
von hier aus nicht auf deine Produktionsdatenbank zugreifen – und soll es auch nicht.
Beides gehört vor jeden echten Bau-Sprint (Regel 0 des Ausbauplans).

## 1. Backup der Produktionsdatenbank

Ziel: eine Sicherung, mit der du im schlimmsten Fall den Stand von heute wiederherstellen kannst.

1. In Railway das Projekt öffnen → den **Postgres-Dienst** der Umgebung `production` anklicken →
   Reiter **Variables** → den Wert `DATABASE_PUBLIC_URL` kopieren (die öffentliche Adresse; die
   interne `DATABASE_URL` funktioniert nur innerhalb von Railway).
2. Auf einem Rechner mit PostgreSQL-Werkzeugen (Version mindestens so hoch wie die der Datenbank):

   ```bash
   pg_dump "<DATABASE_PUBLIC_URL>" --format=custom --no-owner --file=incub-prod-2026-10-09.dump
   ```
3. **Wiederherstellung einmal testen**, sonst ist es kein Backup:

   ```bash
   createdb incub_restore_test
   pg_restore --no-owner --dbname=incub_restore_test incub-prod-2026-10-09.dump
   psql incub_restore_test -c "select count(*) from receipts; select count(*) from time_entries;"
   ```
   Die Zahlen müssen zu denen in der App passen. Danach `dropdb incub_restore_test`.
4. Die `.dump`-Datei **nicht ins Repo** legen (enthält echte Personendaten). Ablegen wie andere
   Firmen-Backups (verschlüsselt, mit Datum).
5. Zusätzlich, nicht stattdessen: im Postgres-Dienst unter **Backups** die automatischen Sicherungen
   einschalten, falls dein Tarif sie anbietet.

Wiederholen vor jeder Veröffentlichung eines Bereichs (Phase 4).

## 2. Umgebung `preview` mit eigener Datenbank

Ziel: ein zweiter, **getrennter** Ort zum Ausprobieren – mit eigener Datenbank, Beispieldaten und
Passwort. Dort darf alles kaputtgehen.

1. In Railway oben **Environments** → **New Environment** → eine Umgebung **`preview`** anlegen
   (am einfachsten als Duplikat von `production`).
2. Im Dienst **Postgres** von `preview` prüfen: Es muss eine **eigene** Datenbank sein, nicht die
   von `production`. Eine duplizierte Umgebung bekommt normalerweise leere Daten – bitte kontrollieren
   (Variables → `DATABASE_URL` zeigt auf einen anderen Host/Datenbanknamen als in `production`).
3. Im App-Dienst von `preview` diese Variablen setzen:

   | Variable | Wert |
   | --- | --- |
   | `PREVIEW_ENABLED` | `1` |
   | `PREVIEW_PASSWORD` | ein langes, neues Passwort (nicht das der App) |
   | `AUTH_SECRET` | eine **neue** lange Zufallszeichenkette (nicht die aus `production`) |
   | `COOKIE_SECURE` | `true` |
   | `ADMIN_PASSWORD` | ein eigenes Passwort für das Test-Admin-Konto |
   | `ANTHROPIC_API_KEY` | leer lassen oder Test-Schlüssel |
   | `SMTP_URL` | **leer lassen** – Preview darf keine echten Mails verschicken |
   | `JOBS_WORKER` | `off` (keine Hintergrundjobs in der Vorschau) |

4. Den **Branch** des App-Dienstes in `preview` auf einen eigenen Zweig stellen (Vorschlag unten),
   damit nichts aus der Vorschau versehentlich nach `production` läuft.
5. Deploy abwarten, dann `https://<preview-adresse>/preview` öffnen → Passwort → Testversion.
   In der Seitenleiste der Test-App erscheint für Admins zusätzlich „Testversion“.
6. Die Adresse **nicht** weitergeben, ohne das Passwort getrennt zu schicken. Die Seite ist per
   `noindex` für Suchmaschinen gesperrt, trägt auf jeder Seite das Banner „Testversion“ und nimmt nach
   8 Passwort-Versuchen in 15 Minuten keine weiteren an.

## 3. Branch-Strategie (Vorschlag zu Punkt 18)

| Zweig | Zweck | Wohin deployt |
| --- | --- | --- |
| `claude/incub-workflow-app-tyetbl` | heute live (Auslieferung) | Railway `production` – **bleibt unangetastet** |
| `claude/magical-carson-1fmj40` | Arbeit am Ausbau (hier liegt der Prototyp) | – |
| `preview` (neu) | jeweils der nächste Bereich zum Ausprobieren | Railway `preview` |

Ablauf je Bereich: bauen auf dem Arbeitszweig → nach `preview` → du probierst → **Freigabe** →
erst dann der Bereich (hinter seinem Feature-Flag, Standard aus) in den Auslieferungszweig →
Flag an. Rückweg: Flag aus (Sekunden), notfalls Schema `v2` verwerfen, notfalls Backup einspielen.

## 4. Schalter im Überblick

| Variable | Wirkung |
| --- | --- |
| `PREVIEW_ENABLED=1` | `/preview` existiert (sonst überall 404) und die Seitenleiste zeigt „Testversion“ |
| `PREVIEW_PASSWORD` | Pflicht; ohne Passwort kommt niemand hinein (fail closed) |
| `FEATURE_<BEREICH>=1` | (ab Sprint 1) je Bereich ein Schalter, Standard aus: `STUNDENTABELLE`, `EXPORT`, `BELEGLINK`, `CREW`, `FRAGEBOGEN`, `JOBBOARD`, `UNTERWEISUNG`, `DISPO` |

## 5. Was ich von dir brauche

1. Backup gemacht und **Wiederherstellung getestet** – kurze Nachricht „Backup ok, Datum“.
2. Umgebung `preview` steht – Adresse und (getrennt) Passwort, wenn ich dort testen soll.
3. Entscheidung zum Branch (`preview` neu anlegen?).
