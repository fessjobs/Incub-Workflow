# Testversion: der Klick-Prototyp (Phase 2)

> Das **echte** neue System (mit Datenbank, Einladungslinks, Beleg-Upload) steht in
> `docs/neu-system.md`. Diese Seite beschreibt den reinen Klick-Prototyp mit Beispieldaten.

Stand: 09.10.2026 · Zweck: durchklicken, wie es werden könnte – **bevor** irgendetwas
Echtes gebaut wird. Das laufende System ist dafür nicht angefasst (Regel 0 des
Ausbauplans).

## Was das ist

Eine eigene Oberfläche im fess.jobs-Design (Orange `#FF5A00`, Weiß, Dark Navy;
Big Shoulders, Work Sans, Geist Mono, Bitter) mit **erfundenen** Personen,
Aufträgen und Stunden. Zwei Sichten:

- **Dashboard** (Admin/Dispo am Rechner): Übersicht, Disposition, Bewerber,
  Stundentabelle, Unterlagen, Crew, Unterweisungen, Einstellungen.
- **Mitarbeiterlink** (Crew am Handy): Anmeldung, Fragebogen, Jobs, Bewerben mit
  Unterweisung und Quiz, Profil, dazu der **Beleg-Link** `/b/…`.

Oben auf jeder Seite steht das Banner „Testversion“. Nichts wird gespeichert,
verschickt oder in eine Datenbank geschrieben. Was du änderst, bleibt nur im
geöffneten Browser-Tab; „Zurücksetzen“ im Banner stellt alles wieder her.

## Drei Wege, sie anzusehen

**1. Als Einzeldatei (am einfachsten).** `testversion.html` ist eine einzige
Datei ohne Server. Einfach öffnen (Handy oder Rechner).
Neu erzeugen: `node scripts/preview-standalone.mjs` → `dist-preview/testversion.html`.

**2. In der App unter `/preview` – nur mit Schalter.**
Die Seite existiert nur, wenn in der Umgebung `PREVIEW_ENABLED=1` **und**
`PREVIEW_PASSWORD=<Passwort>` gesetzt sind. Ohne Schalter antwortet jede
Adresse mit 404; ohne Passwort kommt niemand hinein. Dann erscheint für Admins in
der Seitenleiste „Testversion“. Gedacht für eine **eigene Railway-Umgebung
`preview`** mit eigener Datenbank – nicht für Produktion (Anleitung:
`docs/preview-umgebung.md`).

**3. Lokal zum Entwickeln.**
`PREVIEW_ENABLED=1 PREVIEW_PASSWORD=test AUTH_SECRET=irgendwas npm run dev` →
`http://localhost:3000/preview`.

## Rundgang in acht Stationen

| # | Bereich | Wo | Was du probieren kannst |
| --- | --- | --- | --- |
| 1 | C Bewerbung | Mitarbeiterlink | Anmelden (Code ist vorausgefüllt) → Fragebogen → Job → Bewerben; ohne gültige Unterweisung geht es nicht weiter |
| 2 | D Fragebogen | Mitarbeiterlink | 6 Etappen + Kurz-Check, Zwischenspeichern, Deutsch/Englisch; danach erscheint Mara im Dashboard unter *Bewerber* mit Score |
| 3 | G Disposition | Dashboard | Auftrag öffnen, Bewerber auf eine Schicht ziehen, Konflikt mit Pflicht-Begründung, „Automatisch füllen“, WhatsApp-Aushang, Beleg-Link, Briefing |
| 4 | E Stundentabelle | Dashboard | ~1.200 Beispielzeilen: Zellen bearbeiten (Tab/Enter), aus Excel einfügen, filtern, gruppieren, Status ändern, Massenbearbeitung, Änderungsprotokoll, Export mit Prüfbericht |
| 5 | F Crew | Dashboard | Ampeln für Auslastung, Vertrag, 70 Tage, Minijob; Karte mit Pools; Profil mit Score-Aufschlüsselung |
| 6 | B Unterlagen | Dashboard | alle Dokumente je Person und Auftrag, Suche und Filter |
| 7 | A Beleg-Link | Handy-Link | Beleg „fotografieren“, Betrag eintragen, Beiblatt prüfen; gelbe Abweichungen sehen („Beispiel mit Abweichung“) |
| 8 | C Unterweisung | beide | Module lesen, Quiz (ab 80 %), bei falscher Antwort erscheint die Karte erneut, Nachweis |

Im Banner gibt es **Notizen**: Stichpunkte beim Durchklicken, am Ende kopieren.

## Echt oder simuliert?

| Echt (so würde es sich anfühlen) | Simuliert |
| --- | --- |
| Rechenlogik: Zeiten, Pausen, Mitternacht, Plausibilität, Ruhezeit, Grenzen | WhatsApp-Login (Code vorausgefüllt) |
| Scoring (40/20/20/20, A ab 70, B ab 45) und Passung | Auslesen des Belegs (Betrag/Datum/Händler aus dem Dateinamen abgeleitet) |
| Unterweisungs-Gültigkeit (12 Monate, Erinnerung 14 Tage), Quiz ab 80 % | Fahrzeiten (grobe Tabelle: Luftlinie × 1,25, kein Kartendienst) |
| zvoove-CSV mit Lohnart-Zuordnung, Prüfbericht | Versand von Briefings, Aushängen, Erinnerungen |
| Excel-Einfügen, Audit-Protokoll, Sperre exportierter Zeilen | Dateien: Foto-Upload, PDF-Nachweis (Textdatei) |

Der rechnende Teil liegt in `src/preview/logic/` und hat knapp 150 Unit-Tests –
er ist der Teil, der später in die echte Umsetzung übernommen wird.

## Annahmen, die du bestätigen oder ändern sollst

Wo der Plan etwas offen lässt, steht im Prototyp ein gelbes **⚑ offen**.
Die Liste mit Begründung und Fragen je Bereich: `docs/prototyp-status.md`.

## Grenzen des Prototyps

- Schriften kommen von Google Fonts (im Browser). Für Produktion selbst hosten
  (DSGVO). Ohne Verbindung greifen Ersatzschriften.
- Unterweisungstexte sind **Entwürfe** und nicht von einer Fachkraft für
  Arbeitssicherheit freigegeben. Sie ersetzen weder die Unterweisung vor Ort noch
  beim Stapler Fahrausweis und schriftliche Beauftragung.
- Die Minijob-Grenze (603 €) ist ein einstellbarer Annahmewert – vor Einsatz prüfen.
- Die Lohnarten für Bonus und Abzug sind bewusst „nicht abgestimmt“ (mit Daniel
  klären); dadurch zeigt der Export-Prüfbericht eine Warnung.
