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

## Stand: Sprint 2 (Kern-Flow) ✅

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
prisma/                     Schema, Migrationen, Seed
```

## Roadmap (Spec Abschnitt 12)

1. ✅ Fundament
2. ✅ Kern-Flow: Upload/Foto → Claude-Extraktion → Beiblatt-PDF → Ablage → Nummernkreis
3. ✅ Editieren, Versionierung, Dubletten-Check, Batch-Upload (mit Sprint 2 umgesetzt)
4. Kontoauszug-Abgleich
5. Dashboards, Auswertungen, Excel-Exporte
6. Polish: PWA/Kamera-Flow, Onboarding, Demo-Daten
