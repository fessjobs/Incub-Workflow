# Bestandsaufnahme (Phase 1 des Ausbauplans)

Stand: 09.10.2026 · Commit `56e0433` · erstellt für Phase 1 aus `docs/ausbauplan.md`

**Am laufenden System wurde für dieses Dokument nichts geändert.** Es ist reine
Lektüre von Code, Schema und Migrationen. Detailtiefe zum Einsatzmodul:
`docs/einsatzmodul.md` (gepflegt, aktuell).

---

## 1. Kurzfassung für die Entscheidung

Das Repo ist **deutlich weiter als die Annahmen in Abschnitt 2 des Ausbauplans**.
Drei Dinge, die den Plan unmittelbar berühren:

1. **Es gibt kein BullMQ und kein Redis.** Die Job-Queue läuft in Postgres
   (Tabelle `jobs`, `FOR UPDATE SKIP LOCKED`) – mit verzögerten Jobs,
   Wiederholung mit Backoff und Dedupe. Module A und B sind damit baubar, ohne
   neue Infrastruktur.
2. **Der zvoove-CSV-Export existiert bereits**, inklusive konfigurierbarem
   Spalten-Mapping (`config/zvoove-mapping.json`), Validierung und Archivierung.
   Modul E („Export") ist in weiten Teilen vorhanden; die Frage ist, ob die neue
   Stundentabelle darauf aufsetzt oder daneben entsteht.
3. **Die Stunden werden nicht per KI aus Zetteln gelesen.** Die Crew erfasst sie
   selbst im Link und unterschreibt digital; der Stundennachweis entsteht als PDF
   **aus** diesen Daten. Claude liest Rohtext/Screenshots beim *Anlegen* von
   Einsätzen und beim Stammdaten-Import – nicht Stundenzettel.

Dazu eine Beobachtung, die vor Phase 2 eine Entscheidung braucht: Das geplante
Schema `v2` enthält mit `employees`, `customers`, `jobs`, `time_entries`,
`documents`, `ratings`, `audit_log`, `settings` **acht Tabellen, die es im
Bestand schon gibt** (teils unter anderem Namen). Ein zweiter, paralleler
Personal- und Stundenbestand würde bedeuten, dass dieselbe Person zweimal
gepflegt wird und Stunden an zwei Orten liegen. Das widerspricht dem eigenen
Leitprinzip „Mitarbeiter tippen nie zweimal". Siehe Abschnitt 9.

---

## 2. Stack und Betrieb

| | Ist |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript strict |
| Datenbank | PostgreSQL über Prisma, 23 Migrationen. `down.sql` (Rollback) haben nur die 10 des Einsatzmoduls; die 13 älteren der Belegwelt haben keins |
| Queue | **Postgres-Tabelle `jobs`** (`src/lib/einsatz/jobs/`), kein Redis, kein BullMQ |
| KI | `@anthropic-ai/sdk` – Parser für Einsätze, Beleg-OCR, PDF-Stammdatenimport |
| PDF | `@react-pdf/renderer` (erzeugen), `pdf-lib` (zusammenfügen) |
| Excel/ZIP | `exceljs`, `jszip` |
| Auth | eigenes Session-Cookie über `jose`, Passwörter mit `bcryptjs` |
| Mail | `nodemailer`, nur wenn `SMTP_URL` gesetzt ist |
| Abhängigkeiten gesamt | 12 Laufzeitpakete – bewusst schlank |
| Tests | 181 Unit-Tests (vitest), 74 E2E-Tests (Playwright gegen den Standalone-Build) |

**Keine** Abhängigkeit auf: Redis, BullMQ, ORM-Alternativen, UI-Bibliotheken,
Karten-/Geocoding-Dienste, Zahlungsanbieter.

---

## 3. Tabellen

23 Migrationen, zwei thematische Hälften im selben Schema `public`. Jede Tabelle
trägt `organizationId` (das ist die `entity_id` des Plans) und `createdAt`.

### 3.1 Organisation, Zugang, Stammdaten

| Tabelle | Zweck |
| --- | --- |
| `organizations` | Mandant |
| `users` | Konten, Rolle als Enum (siehe 5.) |
| `user_company_access` | Zugriff je Firma |
| `companies` | Gesellschaften (Belegwelt) |
| `categories` | Buchungskategorien |
| `audit_log` | **existiert bereits**: Aktion, Entitätstyp, Entitäts-Id, JSON-Daten, Nutzer, Zeitpunkt |
| `persons`, `setcards` | Setcard-Bereich |

### 3.2 Belege (ältere Hälfte, unverändert in Betrieb)

`receipts` (51 Felder), `receipt_versions`, `receipt_files`, `vehicles`,
`receipt_number_counters`, `corporate_cards`, `bank_accounts`,
`bank_transactions`, `transaction_receipt_links`, `match_rules`.

### 3.3 Einsatzmodul (neuere Hälfte)

| Tabelle | Entspricht im Plan | Wichtige Felder |
| --- | --- | --- |
| `customers` | `customers` | name, adresse, ustid, ansprechpartner (+E-Mail/Telefon), standardEinsatzort, bundesland, aueVertragRef, aktiv |
| `employees` | `employees` | vorname, nachname, personalnummer (unique je Mandant), email, mobil, geburtsdatum, status (AKTIV/INAKTIV), lohnartDefaults (JSON), zvooveId |
| `projects` | – (neu, aus der Sammelrechnung) | name, customerId, angebotsnummer, konditionen, rechnungsnummer … |
| `assignments` | `jobs` | einsatznummer (JJJJ-MMTT-lfd), customerId, projectId, projekt, artist, einsatzort, bundesland, datumVon/Bis, einsatzbereich, aueVertragRef, status, abrechnung, crewToken, rawInput, parsedJson |
| `assignment_number_counters` | – | fortlaufende Nummer je Tag |
| `assignment_adjustments` | – | Ergänzungen: Bonus, Fahrtkosten, Spesen, Zuschlag, Abzug |
| `shifts` | `jobs.schichten` (JSON) | bezeichnung, taetigkeit, datum, planStart/Ende, treffpunkt, anzahlSoll, garantieStunden, Zeitvorgabe, crewToken |
| `shift_assignments` | ≈ `applications` (bestätigter Teil) | shiftId, employeeId, rolle, planStart/Ende, token, tokenExpiresAt, status |
| `shift_ratings` | `ratings` | wert (NEGATIV/NEUTRAL/POSITIV), notiz – **eine** Bewertung je Einteilung, nicht drei Achsen |
| `time_entries` | `time_entries` | version, aktuell, korrigiertVonId, korrekturGrund, istStart/Ende, pauseMinuten, stundenGesamt, taetigkeit, notiz, pkw/pkwArt, spesen/spesenBetrag, Unterschrift, Unterweisung, ip/userAgent/geraet, quelle, review, geprueft/freigegeben + Von/Am |
| `trips` | – | Fahrten je Zeiteintrag: von, nach, km |
| `assignment_confirmations` | – | Unterschrift des Kunden, optional je Schicht |
| `documents`, `documents_link` | `documents` | unveränderliche Ablage mit SHA-256; Verknüpfung zu Einsatz, Schicht, Person, Kunde, Datum |
| `blobs` | – | Binärdaten (Unterschriften) in DB oder S3 |
| `wage_rules` | – | Lohnarten-Regelwerk (Nacht, Sonntag, Feiertag, Garantie, Fahrt, Zulage, Spesen, Abzug) |
| `manual_deductions` | – | manuelle Abzüge je Person |
| `month_locks` | – | Monatssperre |
| `jobs` | – | **Job-Queue**, nicht Aufträge. Namenskollision mit dem Plan beachten |

**Auffällig für den Plan:** `contracts`, `applications`, `profile_answers`,
`trainings`, `training_acks`, `settings` gibt es **nicht**. Das sind die echten
Lücken – alles andere ist in irgendeiner Form da.

### 3.4 Rollback der Migrationen

Die 13 Migrationen der Belegwelt (`init` bis `transaction_receipt_links`, Juli
2026) haben **kein** `down.sql`; ab dem Einsatzmodul hat jede eins. Für den
Plan heißt das: Ein Zurückrollen des *Bestands* ist über Migrationen nicht
möglich – die Absicherung aus Regel 0 ist allein das Backup. Neue Migrationen
in `v2` bekommen wie bisher ein `down.sql`; das macht den Rückweg des **Neuen**
möglich, ersetzt aber nicht das Backup.

---

## 4. Routen

### 4.1 Angemeldeter Bereich `(app)`

| Pfad | Inhalt |
| --- | --- |
| `/dashboard` | Startseite Belegwelt |
| `/belege`, `/belege/[id]`, `/belege/neu` | Belege |
| `/schnell` | Schnell-Upload |
| `/abgleich`, `/abgleich/buchungen|konten|regeln` | Bankabgleich |
| `/auswertungen` (+ `/datev`, `/excel`, `/zip`) | Auswertungen Belegwelt |
| `/einsaetze` | Einsatzliste mit Filtern |
| `/einsaetze/neu` | Anlegen aus Rohtext, Screenshot, PDF, Excel |
| `/einsaetze/[id]` | Einsatz: Kopf, Schichten, Besetzung, Links, Aushang, Dokumente, Abrechnung |
| `/einsaetze/freigabe` | Zeiteinträge prüfen und freigeben |
| `/einsaetze/abrechnung` | vier Körbe von „Stunden offen" bis „Rechnung geschrieben" |
| `/einsaetze/projekte`, `/einsaetze/projekte/[id]` | Sammelrechnung über mehrere Einsätze |
| `/einsaetze/kunden` (+ `/import`) | Kundenstamm |
| `/einsaetze/personal` (+ `/[id]`, `/import`) | Personalstamm, Profil, Import |
| `/einsaetze/lohnarten` | Lohnartenregeln, manuelle Abzüge, Monatssperre |
| `/auswertung` (+ `/export`) | Stunden-Auswertung, Excel- und zvoove-Export |
| `/dokumente` | Dokumentenarchiv mit Filtern |
| `/einstellungen/...` | Organisation, Nutzer, Firmen, Kategorien, Karten, Rollen, Speicher |
| `/setcards` (+ `/neu`, `/[id]/pdf`) | Setcards |

### 4.2 Ohne Login

| Pfad | Inhalt |
| --- | --- |
| `/login`, `/registrieren` | Anmeldung |
| `/mitarbeiter` | Beleg-Kiosk (Upload ohne Login) |
| `/e/[token]` | Mitarbeiter-Link: eigene Zeiten erfassen und unterschreiben |
| `/e/crew/[token]` | Gruppenlink je Einsatz **oder je Schicht** |

### 4.3 API

| Pfad | Inhalt |
| --- | --- |
| `GET/POST /api/e/[token]` | Zeiterfassung Einzellink |
| `GET /api/e/[token]/pdf` | Stundennachweis zum Einzellink |
| `GET/POST /api/e/crew/[token]` | Gruppenlink: Sicht, Erfassung, Namen, Zeiten für alle, Kundenunterschrift |
| `GET /api/e/crew/[token]/pdf` | Nachweis, optional `?shift=` |
| `POST /api/assignments/parse` | Rohtext/Anhänge auswerten |
| `GET /api/documents/[id]`, `/api/blobs/[id]` | Dateien |
| `POST /api/jobs/run` | Queue abarbeiten (Bearer `JOBS_SECRET` oder angemeldet) |
| `GET /api/health` | Health-Check |

**Frei von `/preview` und `/admin`** – die Pfade des Plans sind unbelegt.
`/b/[token]` ebenfalls frei.

---

## 5. Rollen und Sichtbarkeit

Enum `UserRole`: `ADMIN`, `BUCHHALTUNG`, `MEMBER`, `EINREICHER`, `DISPONENT`.

| Recht (`src/lib/einsatz/access.ts`) | Wer |
| --- | --- |
| `canViewModule` | Admin, Mitglied, Buchhaltung, Disponent |
| `canDispo` | Admin, Mitglied, Disponent |
| `canReview` (Zeiten prüfen/freigeben) | Admin, Buchhaltung, Disponent |
| `canRate` (interne Beurteilung) | Admin, Buchhaltung, Disponent |
| `canInvoice` / `canSeeMoney` | **nur Admin und Buchhaltung** |
| `canManageRules` | Admin, Buchhaltung |

Die Middleware (`src/middleware.ts`) hält Disponenten über `DISPONENT_PATHS` aus
der Belegwelt heraus. Seit dem letzten Stand gilt zusätzlich: **die Disposition
sieht keine Zahlen** – keine Lohnarten-Beträge, Konditionen, Angebots- und
Rechnungsnummern, keine Exporte (serverseitig, nicht nur ausgeblendet).

Für den Plan relevant: **eine Crew-Rolle gibt es nicht.** Die Crew hat heute
überhaupt kein Konto – sie arbeitet ausschließlich über Token-Links. Modul C
(Job-Board „nur für registrierte Crew") braucht also einen neuen Zugangsweg.

---

## 6. Datenflüsse

### 6.1 Einsatz → Unterschrift → Nachweis → Abrechnung

```
Rohtext/Screenshot/PDF
   └─ Claude-Parser (Heuristik als Fallback)
        └─ Vorschau, Namens-Matching, Konfliktprüfung
             └─ assignments + shifts + shift_assignments (+ Tokens)
                  ├─ Konkretisierung (PDF, § 1 Abs. 1 S. 6 AÜG)
                  └─ Links: 1 je Einsatz, 1 je Schicht, 1 je Person
                       └─ Crew erfasst Zeiten, unterschreibt (time_entries + trips)
                            │  änderbar, bis der Kunde zeichnet
                            └─ Kunde bestätigt (assignment_confirmations)
                                 └─ Stundennachweis-PDF (je Einsatz oder je Schicht)
                                      └─ Freigabe (review: ERFASST → GEPRUEFT → FREIGEGEBEN)
                                           └─ Abrechnung: Stunden → Angaben → Rechnung
                                                └─ Export Excel / zvoove-CSV
```

### 6.2 Belegwelt (getrennt, unverändert)

```
/mitarbeiter oder /schnell → Upload → Claude-OCR → receipts (+ Versionen, Dateien)
   └─ Abgleich mit bank_transactions → DATEV-/Excel-Export, ZIP
```

Die beiden Hälften teilen sich `organizations`, `users`, `audit_log` und den
Dokumentenspeicher, sonst nichts.

### 6.3 Hintergrundjobs

Vier Typen in `src/lib/einsatz/jobs/handlers.ts`: `link.versand`,
`link.erinnerung`, `stundennachweis.pdf`, `einsatz.abschluss-check`.
Der Worker läuft im Prozess (`JOBS_WORKER`, Intervall `JOBS_INTERVAL_MS`) und
zusätzlich per `POST /api/jobs/run` – so werden sie in Tests und per Cron
angestoßen.

---

## 7. Speicherorte

| Was | Wo |
| --- | --- |
| Erzeugte PDFs, Exporte | Tabelle `documents` (Bytes **in der DB**), Verknüpfung über `documents_link`, SHA-256 im Audit-Log |
| Unterschriften (PNG) | Tabelle `blobs` – **oder** S3-kompatibel, wenn `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` gesetzt sind (eigene SigV4-Implementierung, keine Zusatzabhängigkeit). Abruf immer über `/api/blobs/[id]` |
| Belegdateien | `receipt_files` in der DB, zusätzlich Best-effort-Spiegelung ins Dateisystem (`STORAGE_PATH`) – auf Railway flüchtig, unkritisch |
| Mapping zvoove | `config/zvoove-mapping.json` im Repo |
| Unterweisungstext | `src/lib/einsatz/safety.ts` (versioniert, im Code) |

**Hinweis:** Der S3-Adapter kann derzeit **nicht löschen**. Beim Löschen von
Stunden bleibt die Datei im Bucket liegen, nur die Referenz verschwindet.

---

## 8. Konfiguration

| Variable | Wirkung |
| --- | --- |
| `ANTHROPIC_API_KEY` | ohne Key: Heuristik statt Claude |
| `ANTHROPIC_MODEL`, `ANTHROPIC_PARSER_MODEL` | Modellwahl |
| `APP_BASE_URL` (sonst `NEXT_PUBLIC_APP_URL`, `RAILWAY_PUBLIC_DOMAIN`, Host des Aufrufs) | Adresse in den Links |
| `AUTH_SECRET`, `COOKIE_SECURE` | Session |
| `SMTP_URL`, `MAIL_FROM` | Linkversand per Mail |
| `JOBS_WORKER`, `JOBS_INTERVAL_MS`, `JOBS_SECRET` | Queue |
| `S3_*` | Blob-Speicher |
| `STORAGE_PATH` | Dateispiegelung Belegwelt |

Alles über Umgebungsvariablen; eine Tabelle `settings` existiert nicht. Was der
Plan dort erwartet (Minijob-Grenze, km-Satz, XP-Regeln, Score-Gewichte), liegt
heute teils in `wage_rules` (km-Satz, Garantie, Spesenpauschale), teils nirgends.

---

## 9. Abgleich mit dem Ausbauplan

### 9.1 Annahmen aus Abschnitt 2 des Plans

| Annahme im Plan | Tatsächlich | Folge |
| --- | --- | --- |
| „BullMQ/Redis" | Postgres-Queue, kein Redis | Module A/B ohne neue Infrastruktur baubar; „Verarbeitung über BullMQ" meint hier die vorhandene Queue |
| „Routen: /login, /schnell, /mitarbeiter" | zusätzlich das komplette Einsatzmodul (siehe 4.) | `/jobs`, `/profil`, `/unterweisung`, `/b/[token]`, `/admin/*`, `/preview/*` sind frei |
| „Stunden per KI aus Zetteln" | Crew erfasst selbst und unterschreibt; KI nur beim Anlegen und Import | Modul E hat eine **bessere** Quelle als gedacht: strukturierte, signierte Daten |
| „Lohn: CSV in Stundenschnellerfassung" | zvoove-Export **existiert** inkl. Mapping, Validierung, Archivierung | Modul E/Export ist teilweise erledigt – Entscheidung nötig (9.3) |
| „Vertragsstunden als Feld" | kein Vertragsfeld am `employees`-Datensatz | `contracts` ist eine echte Lücke |
| „Dispo heute Google-Tabelle" | Einsätze entstehen aus WhatsApp-Rohtext/Screenshot über den Parser | „Planung Regios"-Import wäre ein **zweiter** Weg neben dem bestehenden |

### 9.2 Was es schon gibt (Module ganz oder teilweise erledigt)

| Plan | Bestand |
| --- | --- |
| A: Beleg-Link pro Auftrag | Upload-Strecke und Claude-OCR aus der Belegwelt vorhanden; **auftragsbezogener Token-Link fehlt**. Die Token-Mechanik (signiert, Ablauf, Rate-Limit, Einmal-/Mehrfachnutzung) existiert im Einsatzmodul und ist übertragbar |
| B: Unterlagen-Archiv | `/dokumente` mit Filtern, SHA-256, Kategorien; **ZIP je Auftrag, Lücken-Check und Kundenpaket fehlen**. ZIP-Erzeugung gibt es in der Belegwelt (`/auswertungen/zip`) |
| E: Stundentabelle | Zeiten, Pausen, Garantiestunden, Spesen, Fahrten in km, Bonus/Abzug (als `assignment_adjustments`), Status-Workflow, Monatssperre, Audit – **vorhanden**. Es fehlt die **Tabellenoberfläche** (Excel-artig, Copy/Paste, Massenbearbeitung) und ein Teil der Plausibilitätsprüfungen (Ruhezeit, 10 h, Doppeleinsatz) |
| E: zvoove-Export | **vorhanden**, inkl. Mapping, Pflichtfeldprüfung, Fehlerliste, Archivierung |
| F: Crew-Übersicht | Personalliste mit Erfahrung je Tätigkeit, Schichtzahl, Stufe (neu/eingearbeitet/geübt/erfahren) und Beurteilungsbilanz – **vorhanden**. Es fehlen Verträge, Grenzen (70 Tage, Minijob), XP/Level als eigenes Konzept |
| G: Disposition | Einsätze anlegen, Besetzung, Konfliktprüfung (Doppelbuchung), Links, Briefing-Text (Aushang) – **teilweise vorhanden**. Es fehlen Bewerberfluss, Passungs-Score, Drag and Drop, Wochenplan |
| C, D | **nichts vorhanden** – Job-Board, Bewerbung, Unterweisungs-Quiz, Fragebogen, Scoring, Geocoding, Crew-Login sind komplett neu |
| audit_log | **vorhanden** und durchgängig genutzt |

### 9.3 Zwei Punkte, die vor Phase 2 eine Entscheidung brauchen

**(1) Doppelte Tabellen.** Der Plan sieht `employees`, `customers`, `jobs`,
`time_entries`, `documents`, `ratings`, `audit_log`, `settings` in `v2` vor –
alle acht existieren bereits. Bei strikter Trennung („v2 liest den Bestand
höchstens") entstünden zwei Personalstämme, zwei Kundenlisten und zwei
Stundenbestände. Praktische Folgen: Eine neu angelegte Person wäre für das
Einsatzmodul unsichtbar; eine Rechnung zöge Stunden aus der einen, der zvoove-
Export aus der anderen Tabelle.

Drei gangbare Wege:

| Weg | Was passiert | Risiko |
| --- | --- | --- |
| **a) Additiv ergänzen** (Empfehlung) | `v2` enthält **nur** das Neue: `contracts`, `applications`, `profile_answers`, `trainings`, `training_acks`, `settings`, `job_postings`. Diese zeigen per Fremdschlüssel auf die bestehenden `employees`/`assignments` | gering: Bestand wird nur gelesen und referenziert, nichts umbenannt oder migriert |
| b) Strikt parallel wie im Plan | zweiter vollständiger Satz, Abgleich per Referenzfeld | hoch: zwei Wahrheiten, Abgleich dauerhaft zu pflegen |
| c) Umbau des Bestands | ein Modell, Felder ergänzt | widerspricht Regel 0 |

Weg (a) hält Regel 0 wörtlich ein – kein Löschen, kein Umbenennen, keine
Migration – und vermeidet trotzdem den zweiten Datenbestand.

**(2) Namenskollision `jobs`.** Im Bestand ist `jobs` die Job-Queue, im Plan sind
es die Aufträge. Vorschlag: Aufträge bleiben `assignments` (so heißen sie heute,
inklusive `einsatznummer`), die Ausschreibung fürs Job-Board wird `job_postings`.

---

## 10. Was Phase 2 technisch mitbringt

Für den Klick-Prototyp unter `/preview/...` ist nichts zu beschaffen:

- Routen frei, Design-Grundlage (`card`, `btn-accent`, `badge`, Dark Mode) vorhanden.
- Die fess.jobs-Farben und -Schriften aus dem Plan sind **noch nicht** im Projekt;
  heute gilt Midnight-Navy mit Akzent `#E3682E`. Für `/preview` lässt sich die
  fess.jobs-Palette lokal setzen, ohne den Bestand anzufassen.
- Beispieldaten ohne DB: der Prototyp arbeitet mit Konstanten im Code, damit
  Regel 0 („speichert nichts dauerhaft") eingehalten ist.
- Ein Feature-Flag-Mechanismus existiert nicht (im Code nichts dergleichen
  gefunden); einfachste Form wäre eine Umgebungsvariable je Bereich, geprüft
  serverseitig.
- Playwright und vitest laufen; der Prototyp bekommt eigene Tests, die den
  Bestand nicht berühren.

---

## 11. Offene Fragen aus dieser Bestandsaufnahme

1. **Weg (a), (b) oder (c)** beim Datenmodell (Abschnitt 9.3)?
2. **Crew-Zugang:** Die Crew hat heute kein Konto. Soll das Job-Board auf den
   bestehenden Token-Links aufsetzen oder echte Crew-Konten bekommen?
3. **Stundentabelle:** Soll `/admin/stunden` die vorhandenen `time_entries`
   bearbeiten (eine Wahrheit, Signaturen und Freigaben bleiben gültig) oder
   einen eigenen Bestand führen?
4. **Backup:** Das in Regel 0 geforderte `pg_dump` der Produktionsdatenbank kann
   ich von hier aus nicht ausführen – dafür fehlt der Zugang zur
   Produktionsumgebung. Das muss in Railway passieren, bevor irgendetwas gebaut
   wird.
5. **Preview-Umgebung:** Anlegen der Railway-Umgebung `preview` samt eigener
   Datenbank ist ebenfalls ein Schritt außerhalb des Repos.
6. **Punkt 18 des Plans** (Repo und Push-Rechte): Gearbeitet wird derzeit auf
   `claude/magical-carson-1fmj40`, ausgeliefert über
   `claude/incub-workflow-app-tyetbl`. Für `preview`/`production` nach Regel 0
   braucht es eine klare Branch-Strategie.
