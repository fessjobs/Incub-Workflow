# incub:workflow

**Belege. Erledigt.** – Auslagen- & Beleg-Tool der incub:live-Unternehmensgruppe.

Belege fotografieren → automatisch auslesen → Firma & Kategorie wählen → prüfungstaugliches
Beiblatt generieren → Beleg + Beiblatt als eine PDF sauber abgelegt. Mit Kontoauszug-Abgleich,
Auswertungen und Mehrbenutzer-Betrieb. Mandantenfähig von Tag 1 (SaaS-Vorbereitung).

## Online stellen (Railway)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/new)

Schritt-für-Schritt-Anleitung: **[SETUP.md](./SETUP.md)** – bringt die App über Railway
in ~10 Minuten online (App + PostgreSQL, automatische Migrationen und Grunddaten, echte
URL auch fürs Handy). Für den rein lokalen Betrieb siehe „Schnellstart (Docker Compose)“
weiter unten.

## Stand: Alle Sprints abgeschlossen ✅

**Sprint 4 – Kontoauszug-Abgleich:** Bankkonten gehören dem **Benutzer** (nicht
einer Firma) – jeder lädt seine eigenen (privaten) Auszüge hoch und sieht nur
diese; der Admin sieht alle. Pro Kontobewegung lässt sich wählen, **für welche
Firma** die Ausgabe war (private Verauslagung für verschiedene Firmen). CSV-/PDF-
Import mit robustem Parser, automatisches Matching (Betrag + Datum ±3 + Fuzzy),
drei Ansichten (Zahlung ohne Beleg / Beleg ohne Zahlung / Auslagen offen),
Ignorieren mit Merkregeln, Erstattungs-Automatik.

**Sprint 5 – Auswertungen:** Dashboards (Gruppe/persönlich), Charts (Kategorie-Donut,
Monatsverlauf, Verteilungen nach Firma/Einreicher), Excel-Export gefilterter Ansichten
(Summen je Kategorie), Steuerberater-Monats-ZIP (alle PDFs + Excel).

**Sprint 6 – Polish:** PWA/installierbar (Service Worker, Manifest), Onboarding-
Assistent, Demo-Daten-Schalter, Erinnerungs-Widget, Dashboard-Feinschliff.

## Modul „Einsätze & Stundennachweise“ (Arbeitnehmerüberlassung) ✅

Für die FESS recruitment GmbH & Co. KG: Dispo fügt den Rohtext eines Einsatzes ein
(WhatsApp/Mail) **oder hängt einen Screenshot, ein Foto, ein PDF oder eine Excel-Liste an** →
Claude strukturiert Schichten und Personen (Fallback: regelbasierter
Parser) → Namens-Matching gegen den Mitarbeiterstamm, Arbeitszeit-Konfliktprüfung →
**Konkretisierung nach § 1 Abs. 1 Satz 6 AÜG** als PDF → **ein Gruppenlink für alle**
(`/e/crew/<token>`, mobil, ohne Login, offlinefähig) als fertige WhatsApp-Nachricht für die
Gruppe: jede Person tippt den eigenen Namen an und unterschreibt, falsche Namen und
Nachzügler korrigiert die Crew selbst, am Ende unterschreibt der Kunde – **für den ganzen Einsatz oder je Schicht einzeln,
dann entsteht je Schicht ein eigener Stundennachweis**, auch nachträglich bei einem
schon abgeschlossenen Einsatz →
automatisches **Stundennachweis-PDF** (Kategorie `stundennachweis`, je Einsatz genau eines),
das die Crew im selben Link **ansehen, teilen und herunterladen** kann →
**zusätzlich ein eigener Gruppenlink je Schicht**, wenn ein Einsatz über mehrere Tage
läuft und jede Schicht ihre eigene Gruppe hat (der Link zeigt dann nur die Personen
dieser Schicht) →
Freigabe-Workflow, **Lohnarten-Regelwerk** (Nacht, Sonntag, Feiertag je Bundesland,
Garantiestunden, Fahrtkosten, Zulagen, Spesen, Abzüge), **Auswertung** mit SQL-Summen,
**Excel-Export** (4 Blätter) und **zvoove-CSV** für die Stundenschnellerfassung mit
konfigurierbarem Mapping und Validierung.

- Navigation: **Einsätze** (`/einsaetze`), **Freigabe** (`/einsaetze/freigabe`), **Abrechnung**
  (`/einsaetze/abrechnung`), **Stunden** (`/auswertung`), **Dokumente** (`/dokumente`)
- **Stammdaten-Import**: Excel-, CSV- **und PDF-Listen** für Mitarbeiter
  (`/einsaetze/personal/import`) und Kunden (`/einsaetze/kunden/import`) – Spalten werden
  an den Überschriften erkannt, Vorschau je Zeile vor der Übernahme, keine Dubletten.
  PDFs (auch eingescannte) liest die Claude API aus; Excel und CSV gehen ohne Schlüssel
- **Abrechnung** (`/einsaetze/abrechnung`): vier Körbe in drei Handgriffen – die
  **Buchhaltung** bestätigt die Stunden und nimmt Ergänzungen auf (Bonus, Fahrtkosten,
  Spesen, Zuschläge, Abzüge; je Einsatz oder je Person), dann ergänzt der **Admin**
  Angebotsnummer, Konditionen und Beschreibung, dann schreibt die **Buchhaltung** die
  Rechnung. Der Admin darf jeden Schritt selbst gehen. Jede Stufe ist zurücknehmbar,
  jede Rechnungsnummer gibt es nur einmal, alles steht im Protokoll. Die Einsatzliste
  zeigt den Stand im Klartext: Stunden offen / Stunden freigegeben / Rechnung offen /
  Rechnung geschrieben
- **Löschen im Backend**: Stunden, ganze Einsätze und Personen lassen sich löschen –
  mit Ansage, was mitgeht, und vollständigem Abzug im Protokoll. Freigegebene Zeiten und
  gesperrte Monate sind für alle tabu; bei Unterschriften muss ein Admin die Einsatznummer
  eintippen
- **Erfahrung und Beurteilung (nur Backend)**: hinter jeder Person die Zahl der
  geleisteten Schichten je Tätigkeit, dazu eine interne Beurteilung je Einsatz
  (negativ / neutral / positiv mit Notiz) und die Bilanz in der Personalübersicht.
  Stundenzettel lassen sich am Einsatz in einem Rutsch freigeben. Für Admin,
  Disposition und Buchhaltung – nie im Mitarbeiter-Link, auf einem PDF oder im Export
- **Kurzanleitung beim Öffnen des Links**: Wer den Link zum ersten Mal öffnet, bekommt in
  fünf Zeilen erklärt, was zu tun ist – samt Hinweis, die Sicherheitsunterweisung **vor**
  Arbeitsbeginn zu lesen. Danach über das **?** oben rechts erreichbar
- **Zeiten für alle übernehmen**: Hat die erste Person im Gruppenlink ihre Zeiten
  eingetragen, lassen sie sich für alle Übrigen derselben Schicht übernehmen – deren
  Formulare sind dann vorausgefüllt. Unterschreiben muss weiterhin jede selbst
- **Alles änderbar bis zur Kundenbestätigung**: Kopfdaten, Schichtzeiten und Besetzung lassen
  sich in der Detailansicht nachträglich bearbeiten; **Namen per Copy-Paste** je Schicht
  einfügen (eine Person je Zeile, „Nachname, Vorname“ wird gedreht, Rollenkürzel erkannt).
  **Namen bleiben immer änderbar** – auch nachdem der Kunde unterschrieben hat
- Rollen: Admin/Mitglied = Dispo, **Disponent = eigener Zugang nur fürs Einsatzmodul**,
  Buchhaltung = Freigabe/Lohnarten/Export (lesend) **und die Abrechnung** (Stunden bestätigen,
  Ergänzungen, Rechnung), Kiosk-Konten kein Zugriff
- Einzellinks je Person (`/e/<token>`) bleiben für den automatischen Versand und Nachzügler
- Umgebungsvariablen: `APP_BASE_URL` (Links; ohne sie wird die öffentliche Adresse automatisch
  ermittelt), `ANTHROPIC_API_KEY` (Parser **und Screenshot-Auswertung**), optional `SMTP_URL`/`MAIL_FROM`,
  `JOBS_SECRET` (externer Cron für `POST /api/jobs/run`), S3-Variablen für Unterschriften
- zvoove: echte Beispieldatei unter `docs/zvoove-sample.csv` ablegen → Mapping wird automatisch
  abgeleitet (`npm run zvoove:detect`), Konfiguration in `config/zvoove-mapping.json`
- Tests: `npm test` (Unit + Integration), `npm run build && npm run test:e2e` (Playwright)
- Ausführliche Doku mit Ablaufdiagramm, Datenmodell, Annahmen und offenen Punkten:
  **[docs/einsatzmodul.md](./docs/einsatzmodul.md)**

## Sprint 2 (Kern-Flow) ✅

- **Belege erfassen** – Foto, Handy-Kamera/Scanner, Datei-Upload und Drag&Drop,
  auch **mehrere Belege als Batch** (werden als Warteschlange abgearbeitet)
- **Automatisches Auslesen** per Claude Vision (Datum, Aussteller, Brutto/Netto,
  USt-Sätze inkl. gemischter Sätze, Zahlungsart, Kategorie- und Zweck-Vorschlag) –
  optional; ohne API-Schlüssel greift die manuelle Erfassung
- **Schnelle Zuordnung** – Firma per Ein-Tap-Chip, Kategorie, Art, geprüft-Kreuz
- **Beiblatt-PDF** im incub:workflow-Design mit Firmenlogo/Rechtsträger, inkl.
  Sonderfälle **Bewirtung** (gesetzliche Zusatzfelder) und **Eigenbeleg**
- **Eine PDF** aus Beiblatt (Seite 1) + Beleg (Seite 2), Original bleibt separat
- **Belegnummernkreis** `{Kürzel}-{Jahr}-{lfd. Nr.}` pro Firma und Jahr
- **Belegliste** mit Volltextsuche und Filtern (Firma, Kategorie, Art, Erstattung,
  Einreicher, Zeitraum), Status-Badges, PDF-/Original-Download
- **Nachbearbeitung** jederzeit → PDF wird neu erzeugt, alte Version bleibt in der
  **Versionshistorie**; **Dubletten-Check** (Betrag + Datum + Aussteller)
- **Erstattungsstatus** (offen / eingereicht / erstattet) pro Auslage
- Dateien liegen verlässlich in der Datenbank (hosting-tauglich) und werden im
  lokalen Betrieb zusätzlich in die Ordnerstruktur (Abschnitt 7) gespiegelt

## Stand: Sprint 1 (Fundament) ✅

- Login (E-Mail/Passwort) mit Rollen **Admin** (sieht alles) / **Mitglied** (sieht nur eigene Belege)
- Vollständiges Datenmodell nach Spec Abschnitt 10 – inkl. der Tabellen für spätere Sprints
  (Belege, Versionen, Nummernkreise, Bankkonten, Transaktionen, Merkregeln, Audit-Log)
- Firmenverwaltung mit Trennung **Marke ≠ Rechtsträger**, Vorbefüllung der Gruppenstruktur
- Kategorienverwaltung (vorbefüllt, Bewirtungs-Flag für die gesetzlichen Zusatzfelder)
- Nutzerverwaltung inkl. optionaler Firmen-Einschränkung pro Nutzer
- Organisations-/Branding-Einstellungen (Mandanten-Ebene)
- Audit-Log für alle Verwaltungsaktionen
- Helles Business-Design-System im incub:live-Stil (Midnight-Navy `#0B1220`, Editorial-Labels),
  Dark Mode, responsive

**Noch nicht enthalten** (kommt ab Sprint 2): Beleg-Upload/Foto, Claude-Extraktion, Beiblatt-PDF,
Bank-Abgleich, Auswertungen.

## Schnellstart (Docker Compose)

```bash
cp .env.example .env        # Werte anpassen (v. a. AUTH_SECRET, ADMIN_PASSWORD)
docker compose up -d --build
```

App: <http://localhost:3000> – im lokalen Netz (Handy!): `http://<Rechner-IP>:3000`

**Erster Login:** `admin@incub.live` / `incub2026!` (bzw. die Werte aus `.env`).
Passwort nach dem ersten Login unter *Einstellungen → Nutzer* ändern.

**Rollen** (Anleitung in der App unter *Einstellungen → Rollen*):
- **Admin / Gesellschafter** – sieht und verwaltet alles; **Schnell-Upload**
  von überall (Beleg → Firma → Zahlungsart inkl. eigener **Amex-Firmenkarte** →
  bezahlt/offen) mit sofortigem **Zahlungs-Check** gegen die Kontoauszüge
  (auch nachträglich auf der Beleg-Detailseite).
- **Buchhaltung** – liest alle Belege und zieht den **DATEV-Monatsexport**:
  Buchungsstapel-CSV (EXTF) je Firma + Beleg-PDFs sortiert nach
  Firma/Zahlungsart (Firmenkarten einzeln, Mitarbeiter-Auslagen gesammelt).
- **Mitglied** – eigene Belege + eigener Kontoauszug-Abgleich.
- **Mitarbeiter-Link** – kein Konto nötig: Link `/mitarbeiter` ans Team
  schicken → animiertes Erklär-Intro → Passwort `123` (änderbar) → Name,
  Einsatz, Grund, Beleg, Zahlungsart, Status → senden. Landet im Adminbereich
  im Ordner **„Auslagen Mitarbeiter“**, sortiert nach Name und Datum; der
  Mitarbeiter sieht seinen Erstattungsstatus jederzeit selbst.

**Selbst-Registrierung:** neue Nutzer legen unter „Konto erstellen" ein Konto
an und werden vom Admin unter *Einstellungen → Accounts* **freigeschaltet**
(dort auch Rollen und Passwörter verwalten).

Die Beleg-Ablage landet auf dem Host unter `./incubWorkflow-Ablage/` (ab Sprint 2 befüllt).

## Entwicklung ohne Docker

Voraussetzungen: Node 22+, PostgreSQL 16.

```bash
cp .env.example .env        # DATABASE_URL auf lokale DB zeigen lassen
npm install
npx prisma migrate dev      # Schema anlegen
npx prisma db seed          # Admin, Firmen, Kategorien vorbefüllen
npm run dev                 # http://localhost:3000
```

Nützliche Skripte: `npm run typecheck`, `npm run build`, `npm run db:seed`.

## Architektur

- **Next.js 15 (App Router) + TypeScript** – Frontend und Server Actions in einem
- **PostgreSQL + Prisma** – jede Query nach `organization_id` gescoped (Mandantentrennung),
  für Mitglieder zusätzlich nach `user_id`
- **Auth:** bcrypt-Passwort-Hashes, signierte JWT-Session-Cookies (httpOnly), Middleware-Schutz
- **Seed:** legt Mandant, Admin-Konto sowie Firmen (fess.jobs, Eventcrue, europersonal, eques,
  FESS recruitment, 3S, incub:live GmbH, Janke Solutions GmbH, Privat) und die
  Standard-Kategorien an – idempotent, überschreibt nichts

```
src/
  app/
    login/                  Anmeldung
    (app)/dashboard/        Kennzahlen-Übersicht (rollenabhängig)
    (app)/belege/           Platzhalter – Kern-Flow folgt in Sprint 2
    (app)/einstellungen/    Firmen · Kategorien · Nutzer · Organisation (nur Admin)
  components/               Design-System-Bausteine
  lib/                      db, auth, session, audit
  lib/einsatz/              Einsatzmodul: Parser, Lohnarten, PDFs, Jobs, Services
  app/e/                    Mitarbeiter-/Crew-Link (ohne Login)
  app/(app)/einsaetze/      Dispo-Bereich, /auswertung, /dokumente
prisma/                     Schema, Migrationen, Seed
config/                     zvoove-Mapping
docs/                       einsatzmodul.md, zvoove-sample.csv (Beispiel ablegen)
```

## Roadmap (Spec Abschnitt 12)

1. ✅ Fundament
2. ✅ Kern-Flow: Upload/Foto → Claude-Extraktion → Beiblatt-PDF → Ablage → Nummernkreis
3. ✅ Editieren, Versionierung, Dubletten-Check, Batch-Upload (mit Sprint 2 umgesetzt)
4. Kontoauszug-Abgleich
5. Dashboards, Auswertungen, Excel-Exporte
6. Polish: PWA/Kamera-Flow, Onboarding, Demo-Daten
