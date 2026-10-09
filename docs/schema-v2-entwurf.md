# Schema `v2`: Entwurf (nicht umgesetzt)

Stand: 09.10.2026 · **Entwurf zur Besprechung. In `prisma/schema.prisma` und in der
Datenbank ist dazu nichts angelegt.** Grundlage: `docs/ausbauplan.md` Abschnitt 3,
`docs/ist-stand.md` Abschnitt 9.3, die Datenformen des Prototyps in `src/preview/logic/types.ts`.

## 1. Grundsatz: Weg (a), additiv

`v2` enthält **nur das, was es im Bestand nicht gibt**, und zeigt per Fremdschlüssel auf
bestehende Tabellen. Es wird nichts umbenannt, verschoben oder gelöscht (Regel 0).

| Plan | Bestand | Folge |
| --- | --- | --- |
| `employees` | `employees` | bleibt; `v2.crew_profiles` hängt daran |
| `customers` | `customers` | bleibt |
| `jobs` (Aufträge) | `assignments` (+ `shifts`) | bleibt; Ausschreibung wird `v2.job_postings` (Name `jobs` ist die Queue) |
| `time_entries` | `time_entries` | bleibt; Stundentabelle bearbeitet **diese** Tabelle |
| `documents` | `documents`, `documents_link` | bleibt |
| `ratings` | `shift_ratings` (eine Bewertung) | bleibt; Plan-Achsen als `v2.rating_details` |
| `audit_log` | `audit_log` | bleibt, wird weiter genutzt |
| `settings` | – (nur Umgebungsvariablen und `wage_rules`) | neu: `v2.settings` |
| `contracts`, `applications`, `profile_answers`, `trainings`, `training_acks` | – | neu |

## 2. Wo die Tabellen liegen: zwei Möglichkeiten

**Option 1 – echtes Postgres-Schema `v2` (Empfehlung).** In Prisma 6 (hier 6.19) ist `multiSchema`
allgemein verfügbar. Voraussetzung: `datasource db { schemas = ["public", "v2"] }` und an **jedem
bestehenden Modell** ein `@@schema("public")`. Das ist eine reine Prisma-Annotation (keine
Änderung an Tabellen), betrifft aber die Datei mit allen Modellen. Vorteil: `DROP SCHEMA v2 CASCADE`
entfernt **alles Neue** mit einem Befehl – der sauberste Rückweg. Absicherung: `prisma migrate diff`
darf für `public` keine Änderung zeigen.

**Option 2 – gleiches Schema, Präfix `v2_`.** Kein Anfassen der alten Modelle; Rückweg über die
`down.sql` je Migration statt über einen Befehl.

Beides ist ohne Datenverlust umkehrbar. Entscheidung gehört zu Sprint 1.

## 3. Tabellen

Alle mit `id` (cuid wie im Bestand), `organization_id` (Mandant, **immer aus der Sitzung**, nie
aus der Anfrage), `created_at`, `updated_at`. Zeiten in UTC, Anzeige in Europe/Berlin.

### 3.1 `v2.settings`

| Feld | Typ | Hinweis |
| --- | --- | --- |
| `key` | text | eindeutig je Mandant |
| `value` | jsonb | |
| `updated_by_id` | text → `users` | |

Schlüssel (Werte aus dem Prototyp): `score.gewichte` (40/20/20/20), `score.schwellen` (A 70, B 45),
`score.leistung` (max 0,7 nach 20 Einsätzen), `xp.regeln` (+10/+5/+5/−20/−10), `xp.level` (0/100/300/600),
`grenzen.minijob_eur` (603, **prüfen**), `grenzen.kurzfristig_tage` (70), `export.km_satz` (0,30),
`export.lohnarten` (Zuordnung je Position, inkl. „abgestimmt“-Kennzeichen), `fragebogen.nachricht`,
`passung.gewichte`, `unterweisung.gueltig_monate` (12), `bewerber.loeschfrist_monate` (6).

### 3.2 `v2.crew_profiles` (Erweiterung der Person, auch für Bewerber)

| Feld | Typ | Hinweis |
| --- | --- | --- |
| `employee_id` | text → `employees`, **null erlaubt**, eindeutig | erst mit Aufnahme gesetzt |
| `vorname`, `nachname`, `mobil`, `email` | text | solange `employee_id` leer ist, hier |
| `status` | enum | `BEWERBER`, `AKTIV`, `GESPERRT`, `AUSGESCHIEDEN` |
| `plz`, `wohnort`, `lat`, `lng` | text/numeric | Geocoding einmalig |
| `pool`, `pool_zeiten` | enum / jsonb | nächster Pool und Fahrzeit zu allen fünf |
| `sprache` | enum `DE`/`EN` | |
| `xp`, `level` | int / text | zwischengespeichert aus `xp_events` |
| `einwilligung_am`, `einwilligung_version` | timestamptz / text | DSGVO |
| `letzte_aktivitaet_am`, `loeschen_ab` | timestamptz | Löschfrist (⚑ 6 Monate, offen 17) |
| `telefon_bestaetigt_am` | timestamptz | |

Warum eigenes Profil statt Felder an `employees`: Bewerber haben noch keinen Personalstamm-Eintrag
und keine Personalnummer; die Aufnahme legt `employees` über den bestehenden Weg an und setzt `employee_id`.

### 3.3 `v2.profile_answers` (Fragebogen, versioniert)

`profile_id`, `version` (int, nur anfügen), `antworten` (jsonb, Form wie `ProfileAnswers`),
`score_blocks` (jsonb), `score` (numeric), `kategorie` (`A`/`B`/`C`), `etappe` (int),
`abgeschickt_am` (null = Zwischenstand). Kategorie und Score sind **nur intern** sichtbar.

### 3.4 `v2.contracts`

`employee_id` → `employees`, `vertragsart` (`MINIJOB`, `KURZFRISTIG`, `WERKSTUDENT`, `TZ`, `VZ`),
`wochenstunden`, `monatsgrenze_std`, `monatsgrenze_eur`, `stundenlohn`, `gueltig_von`, `gueltig_bis` (null = unbefristet),
`docusign_id`, `dokument_id` → `documents`. Sperre gegen Überlappung je Person (Exclusion Constraint, `btree_gist`).

### 3.5 `v2.job_postings`

`assignment_id` → `assignments` (eindeutig), `status` (`ENTWURF`, `OFFEN`, `VOLL`, `ABGESCHLOSSEN`),
`beschreibung`, `dresscode`, `psa` (text[]), `verpflegung`, `parken`, `treffpunkt`, `ablauf` (jsonb),
`hoehe` (bool), `plz`, `lat`, `lng`, `quelle` (`REGIOS`/`MANUELL`), `regios_ref`, `veroeffentlicht_am`.
Schichten bleiben in `shifts` (bestehend).

### 3.6 `v2.applications` und `v2.application_shifts`

`applications`: `posting_id`, `profile_id` (eindeutig zusammen), `status` (`NEU`, `PASST`, `WARTELISTE`,
`ABGELEHNT`, `BESTAETIGT`), `eigene_anreise`, `abfahrtsort`, `fahrgemeinschaft_plaetze`, `hat_vertrag`
(„habe schon Vertrag bei FESS“, Entscheidung 7), `kommentar`, `notiz_intern`, `passung_score`, `passung_details` (jsonb),
`entschieden_von_id`, `entschieden_am`.
`application_shifts`: `application_id`, `shift_id`, `shift_assignment_id` (→ bestehende `shift_assignments`,
gesetzt bei Bestätigung), `begruendung` (Pflicht bei übergangenem Konflikt).

Bestätigen legt die Einteilung über den **bestehenden** Weg (`shift_assignments`) an – kein zweiter Besetzungsbestand.

### 3.7 `v2.trainings` und `v2.training_acks`

`trainings`: `modul` (z. B. `grund`, `stagehand`, …), `version`, `sprache`, `titel`, `inhalt` (jsonb: Karten, Quiz),
`status` (`ENTWURF`, `FREIGEGEBEN`), `freigegeben_von`, `freigegeben_am` (**Fachkraft für Arbeitssicherheit**, Entscheidung 9).
Nur freigegebene Versionen werden Crew angezeigt.
`training_acks`: `profile_id`, `training_id`, `quiz_score`, `bestaetigt_am`, `gueltig_bis`, `dokument_id` (Nachweis-PDF,
mit SHA-256 wie alle `documents`), `ip`, `user_agent`.

### 3.8 Crew-Zugang

`crew_login_codes` (`profile_id`, `code_hash`, `laeuft_ab_am`, `versuche`) und `crew_sessions` (`profile_id`,
`token_hash`, `geraet`, `laeuft_ab_am`). Versand über Superchat (Entscheidung 8); bis dahin zum Kopieren.
Alternative ohne Konten: auf den bestehenden Token-Links aufsetzen (offene Frage 2 der Bestandsaufnahme).

### 3.9 `v2.xp_events` und `v2.rating_details`

`xp_events`: `profile_id`, `shift_assignment_id`, `art` (`BASIS`, `PUENKTLICH_ZETTEL`, `GUTE_BEWERTUNG`, `NO_SHOW`,
`ZETTEL_FEHLT`), `delta`, `begruendung`. XP = Summe, Level aus `settings`.
`rating_details`: `shift_rating_id` → `shift_ratings`, `von_rolle` (`TEAMLEITER`/`DISPO`), `puenktlich`, `einsatz`,
`teamwork` (je 1–5), `kommentar`. (Entscheidung 15.)

### 3.10 Beleg-Link

`receipt_links`: `assignment_id`, `token_hash`, `laeuft_ab_am`, `erstellt_von_id`, `max_nutzungen` (optional).
Die Belege selbst: **offene Entscheidung** – neue Tabelle `v2.crew_receipts` oder die Einreichung legt
direkt Einträge in der bestehenden Belegwelt (`receipts`) an. Empfehlung: bestehende Belegwelt nutzen,
damit Erstattung und DATEV nicht doppelt laufen.

### 3.11 Stundentabelle: keine neue Haupttabelle

Die Tabelle bearbeitet `time_entries`. Zuordnung der 18 Spalten und Lücken:

| Spalte | Quelle im Bestand | Lücke |
| --- | --- | --- |
| Datum | `shifts.datum` | – |
| Personalnummer, Vor-/Nachname | `employees` | – |
| Start, Ende | `time_entries.istStart/istEnde` | – |
| Pause von/bis | nur `pauseMinuten` (Summe) | **mehrere Pausen mit Uhrzeiten** → `v2.time_entry_pauses` (`time_entry_id`, `von`, `bis`) |
| Gesamt | `stundenGesamt` | berechnet |
| Pauschale | `shifts.garantieStunden` | – |
| Kunde, Auftrag | `assignments` | – |
| Spesen | `spesen`/`spesenBetrag` | – |
| Reise privat (km) | `trips.km` | – |
| Reise geschäftlich (€) | – | Feld oder `assignment_adjustments`-Art ergänzen |
| Bonus, Abzug | `assignment_adjustments` | je Person, nicht je Zeile – Zuordnung klären |
| Bemerkung | `time_entries.notiz` | – |
| Status offen/geprüft/freigegeben/exportiert | `review`, `freigegeben*`, `month_locks` | „exportiert“ als eigener Stand klären |
| Plausibilität | – | rechnet im Code, nicht gespeichert |

Jede Änderung geht in `audit_log` (bestehend). Exportierte Zeilen: Änderung nur mit Begründung.

## 4. Migration und Rückweg

- Jede Migration mit `down.sql` (wie beim Einsatzmodul), zusätzlich vor dem ersten Lauf das `pg_dump`
  der Produktionsdatenbank (Anleitung `docs/preview-umgebung.md`).
- Reihenfolge: (1) `settings`, (2) `crew_profiles`, `contracts`, `profile_answers`, (3) `job_postings`,
  `applications`, `application_shifts`, (4) `trainings`, `training_acks`, (5) `xp_events`, `rating_details`,
  (6) Crew-Zugang, (7) `receipt_links`, `time_entry_pauses`. Jede Gruppe hängt an **einem** Sprint
  (siehe `docs/sprint-plan.md`) und an **einem** Feature-Flag.
- Seed nur in `preview`: Beispielpersonen aus `src/preview/data/demo.ts` (erfunden, deterministisch).

## 5. Offene Fragen

1. Option 1 (Schema `v2`) oder Option 2 (Präfix)? 2. Beleg-Link-Belege in die Belegwelt?
3. Bonus/Abzug je Zeile oder je Person? 4. „exportiert“ als Stand an `time_entries`?
5. Crew-Konten oder Token-Links? 6. Mehrmandantenfähigkeit (Entscheidung 13): alles trägt
`organization_id`, nichts wird fest auf „FESS“ verdrahtet.
