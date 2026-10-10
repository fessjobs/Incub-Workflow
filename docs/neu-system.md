# Das neue System („Neu · Crew & Stunden“), parallel zum bisherigen

Stand: 10.10.2026 · Gebaut auf Grundlage der Testversion (`docs/testversion.md`).
Läuft **neben** dem bisherigen System, mit **eigenen Daten**. Das bisherige System
(Belege, Auslagen, Einsätze, Stunden, Dokumente, Unterschriften) wird weder gelesen
noch verändert.

> Erweiterung vom 10.10.2026 (Kleidung/Schuhgröße, Importe, Nachrichten, Freigabe, Schulungs-Pflicht
> und Videos, Benutzer/Rollen, vorbereitete Schnittstelle): siehe **`docs/neu-erweiterung.md`**.
> Die Aussagen unten zu „nur Administratoren“, „kein Import“ und „keine Verbindung zum bisherigen
> System“ sind dort fortgeschrieben (Importe und Rollen gibt es jetzt; die Schnittstelle ist
> vorbereitet, aber aus).

## Wo finde ich es?

In der linken Navigation steht für Administratoren ein neuer Eintrag
**„Neu · Crew & Stunden“** (Nummer „NEU“). Ein Klick öffnet das neue Dashboard unter
`/admin`. Oben dort steht „Parallel zum bisherigen System“; **„← Bisheriges
Dashboard“** führt zurück. Andere Rollen (Buchhaltung, Dispo, Mitglied) sehen den
Eintrag nicht und bekommen bei direktem Aufruf einen Fehler.

Öffentlich (ohne Anmeldung, nur mit persönlichem Link) sind nur:
`/crew/…` (Mitarbeiterseiten) und `/b/<Token>` (Beleg-Link).

## Was am bisherigen System angefasst wurde

Nur drei Stellen, alle **rein additiv** (nichts entfernt, nichts umgeschrieben):

| Datei | Änderung |
| --- | --- |
| `prisma/schema.prisma` | vier neue Modelle **angehängt** (`V2Record`, `V2Audit`, `V2Access`, `V2File`); kein bestehendes Modell geändert, keine Beziehung zu bestehenden Tabellen |
| `src/app/(app)/layout.tsx` | ein zusätzlicher Navigationseintrag, nur für Administratoren |
| `src/middleware.ts` | eine Zeile: `/crew`, `/b/…` und die zugehörigen Schnittstellen sind ohne Anmeldung erreichbar (Schutz über Token) |

Dazu die neue Migration `20261010090000_neu_system` (nur `CREATE TABLE`/`CREATE INDEX`
für die vier Tabellen) mit `down.sql`. Alle 85 bisherigen und die neuen Browser-Tests
laufen grün.

## Datenbank und Rückweg

Vier neue Tabellen mit Präfix `v2_`:

| Tabelle | Inhalt |
| --- | --- |
| `v2_records` | Personen, Aufträge, Bewerbungen, Stundenzeilen, Einteilungen, Belege, Einstellungen (je Art als JSON, mit Versionszähler gegen veraltete Bildschirme) |
| `v2_audit` | Änderungsprotokoll des neuen Systems |
| `v2_access` | Einladungen, Crew-Sitzungen, Beleg-Links (nur Hashes, keine Klartext-Tokens) |
| `v2_files` | hochgeladene Belege (Bytes in der Datenbank, SHA-256) |

**Rückweg:** `prisma/migrations/20261010090000_neu_system/down.sql` entfernt genau diese
vier Tabellen und sonst nichts (auf einer Testdatenbank geprüft: 42 → 38 Tabellen, alle
bisherigen bleiben). Die Migration läuft beim Start der App automatisch; sie legt nur
neue, leere Tabellen an. Ein Backup der Produktionsdatenbank bleibt trotzdem sinnvoll
(`docs/preview-umgebung.md`, Abschnitt 1).

## Ausprobieren in zehn Schritten

1. **Neu · Crew & Stunden** anklicken. Es ist leer – oder oben „Mit Beispieldaten
   ausprobieren“ (erfundene Personen/Aufträge/Stunden, jederzeit unter *Einstellungen*
   wieder entfernbar; eigene Daten bleiben dabei unberührt).
2. **Crew → + Person anlegen** (mit Vertrag: Grenzen und Ampeln rechnen daraus).
3. **Disposition → + Auftrag anlegen** (Schichten, Bedarf, „sofort im Job-Board
   veröffentlichen“).
4. **Bewerber → Neue Person einladen** → Link erzeugen → per WhatsApp schicken
   (Nachricht ist vorformuliert und einstellbar).
5. Die Person öffnet den Link **am Handy**: Fragebogen, Jobs, Bewerben mit
   Unterweisung und Quiz.
6. Im Dashboard erscheinen Fragebogen mit Score, Kategorie und Fahrzeit und die
   Bewerbung (aktualisiert sich alle 20 Sekunden und beim Zurückkehren in den Tab).
7. **Disposition → Auftrag**: Bewerber nach Passung, Drag & Drop, Konflikte mit
   Begründung, automatisch füllen, WhatsApp-Aushang, Briefing.
8. **Stundentabelle**: Zeilen anlegen, aus Excel einfügen, prüfen, freigeben,
   exportieren (zvoove-CSV mit Prüfbericht, Excel-CSV). Jede Änderung steht im Protokoll
   mit dem angemeldeten Benutzer.
9. **Beleg-Link** am Auftrag erzeugen → Crew reicht Foto, Betrag, Datum ein →
   erscheint unter **Unterlagen** (Datei ansehbar).
10. **Einstellungen**: Score-Gewichte, XP, Minijob-Grenze, km-Satz, Lohnarten.

## Sicherheit

- Dashboard und alle `/api/neu/*`-Schnittstellen nur für angemeldete **Administratoren**;
  Mandant (`organizationId`) immer aus der Sitzung, nie aus der Anfrage.
- Alle Eingaben werden mit **Zod** geprüft (Form je Art, Größen, Aufzählungen).
- Einladungslink: zufällig, 14 Tage gültig, höchstens 10 Mal einlösbar, nur der Hash
  liegt in der Datenbank; danach eine Crew-Sitzung (90 Tage, Cookie `neu_crew`, httpOnly).
- Die Crew sieht **nur sich selbst**, veröffentlichte Aufträge und die eigenen
  Bewerbungen – nie Kategorie, Score, interne Notizen, Bewertungen oder andere Personen.
  Treffpunkt und Ansprechpartner erst nach der Bestätigung.
- Die Crew kann nur vier Dinge tun (Entwurf speichern, Fragebogen abschicken,
  Unterweisung bestätigen, bewerben); jede Aktion wird **auf dem Server geprüft**
  (Pflichtfragen, Quiz ab 80 %, Pflicht-Unterweisung vor der Bewerbung, keine
  Doppelbewerbung).
- Beleg-Link: Token mit Ablauf (90 Tage), Rate-Limit, Dateien werden am **Inhalt**
  erkannt (JPG, PNG, WEBP, HEIC, PDF; höchstens 10 MB), Personalnummer muss bekannt sein.
- Zwei Bildschirme überschreiben sich nicht: jeder Datensatz trägt einen Versionszähler;
  ein veralteter Bildschirm lädt neu, statt Neueres zu überschreiben.
- Crew-Seiten und Beleg-Seite sind `noindex`.

## Was noch nicht geht (bewusst, siehe auch `docs/prototyp-status.md`)

- **Kein Versand**: Einladungen, Aushänge, Briefings und Erinnerungen werden als Text
  zum Kopieren erzeugt; WhatsApp/Superchat ist nicht angebunden.
- **Keine Verbindung zum bisherigen System**: weder Import noch Abgleich. Das Neue
  startet leer. (Die Migration der Altdaten ist der nächste Schritt, wenn das Neue sich
  bewährt.)
- Original-Zettel zur Stundenzeile (liegt im bisherigen System), PDF-Übersicht je
  Auftrag, echte `.xlsx`-Datei (derzeit CSV) fehlen.
- Aufträge lassen sich anlegen und im Status ändern, aber noch nicht in allen Feldern
  nachträglich bearbeiten.
- Beleg-Auslesen (Betrag/Datum/Händler) nur mit gesetztem `ANTHROPIC_API_KEY`; ohne
  Schlüssel gilt die Eingabe, es gibt keine gelben Abweichungen.
- Rollen: nur Administratoren; Buchhaltung und Dispo bekommen später eigene Sichten
  (ohne Beträge für die Dispo, wie im bisherigen System).
- **Unterweisungstexte sind Entwürfe**, nicht von einer Fachkraft für Arbeitssicherheit
  freigegeben (die Seiten sagen das auch der Crew). Vor dem echten Einsatz freigeben
  lassen.
- Minijob-Grenze 603 € und Lohnart-Nummern sind Annahmen/Platzhalter (einstellbar).
- Schriften von Google Fonts (für Produktion selbst hosten, DSGVO).
- Links nach außen verwenden `APP_BASE_URL` (falls gesetzt), sonst die Adresse, unter der
  das Dashboard geöffnet wurde.

## Technik in Kürze

- Dieselbe Oberfläche wie die Testversion (`src/preview/…`), im echten System mit Daten
  vom Server (`src/neu/…`): jede Änderung wird als Unterschied zum letzten gespeicherten
  Stand erkannt und gespeichert (`/api/neu/sync`); Beispiel-Daten und Einladungen über
  `/api/neu/seed` und `/api/neu/crew/invite`.
- Server: `src/lib/neu/` (Speicher, Schemas, Tokens, Crew-Logik, Beleg-Prüfung).
- Das Ein-Tabellen-Modell ist ein Zwischenstand; vor der Migration der Altdaten wird es
  in eigene Tabellen überführt (`docs/schema-v2-entwurf.md`).
- Tests: `tests/unit/neu-system.test.ts`, `tests/e2e/neu.spec.ts`.
