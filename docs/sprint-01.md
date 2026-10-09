# Sprint 1: Fundament (Entwurf)

Status: **Entwurf, nicht freigegeben** · startet erst nach Freigabe durch Maik und nach Backup (`docs/preview-umgebung.md`).
Bereich: – · Flag: alle Bereichs-Flags (Standard aus) · Tabellen: `v2.settings`

## Ziel
Die Voraussetzungen schaffen, damit jeder spätere Sprint hinter einem Schalter bauen und sich
zurückziehen lässt – ohne dass für Nutzer des laufenden Systems irgendetwas anders aussieht.

## Voraussetzungen
Backup gemacht und Wiederherstellung getestet · Umgebung `preview` mit eigener Datenbank ·
Entscheidung Schema `v2` vs. Präfix (`docs/schema-v2-entwurf.md` Abschnitt 2) · Branch-Strategie.

## User Stories
1. Als **Admin** möchte ich Bereiche einzeln ein- und ausschalten, damit ein Fehler nie das ganze System trifft.
2. Als **Admin** möchte ich Zahlen wie Minijob-Grenze, km-Satz, Score-Gewichte und XP-Werte selbst ändern, ohne dass jemand programmieren muss.
3. Als **Buchhaltung** möchte ich, dass jede Änderung nachvollziehbar im Protokoll steht.
4. Als **Maik** möchte ich nach einem Fehlschlag mit einem Schritt zum alten Stand zurück.

## Umfang
- Feature-Flag-Helfer (serverseitig, aus Umgebungsvariablen `FEATURE_<BEREICH>`), Standard aus.
- Schema `v2` (oder Präfix) anlegen, **leer**; erste Tabelle `settings` mit Werten aus dem Prototyp.
- Rollen: Admin, Dispo, Buchhaltung bestehen; Rolle **Crew** als eigener Zugang vorbereiten (ohne Funktion).
- `audit_log` um die neuen Entitätstypen erweitern (nur Konstanten, keine Strukturänderung).
- Seite „Einstellungen → Werte“ für `settings`.
- Seed für `preview` mit den erfundenen Beispieldaten des Prototyps (nie in `production`).

## Akzeptanzkriterien
- [ ] Mit allen Flags aus ist die App für Nutzer **unverändert** (Seiten, Menü, Antworten gleich).
- [ ] `prisma migrate diff` zeigt für bestehende Tabellen **keine** Änderung.
- [ ] `down.sql` entfernt alles Neue; danach läuft die bestehende Testsuite grün.
- [ ] Einstellungen speichern, lesen und protokollieren Werte; ungültige Werte werden abgelehnt (Zod).
- [ ] `organization_id` kommt nie aus der Anfrage, immer aus der Sitzung.

## Testfälle
Unit: Flag-Auflösung (an/aus/fehlt), Einstellungs-Validierung. Integration: Migration hoch und
runter gegen eine leere Datenbank; bestehende Tabellen unverändert (Spalten-Snapshot).
E2E: bestehende 74 Tests unverändert grün; neuer Test „Flag aus ⇒ Seite 404“.

## Aus dem Prototyp übernehmen
`src/preview/logic/scoring.ts`, `xp.ts`, `grenzen.ts` (Standardwerte als Startdaten für `settings`).

## Risiken und offene Fragen
Prisma `multiSchema` verlangt `@@schema("public")` an allen Modellen (Option 1) – Review der
Schema-Datei nötig. Wer pflegt die Werte (nur Admin)?
