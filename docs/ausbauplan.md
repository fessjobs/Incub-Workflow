# incub workflow: Ausbauplan Crew, Bewerbung, Stunden

Stand: 09.10.2026. Ablage im Repo: `docs/ausbauplan.md`

> Hinweis zur Fassung im Repo: Dies ist der Plan, wie er von Maik übergeben
> wurde, unverändert. Wo seine Annahmen vom tatsächlichen Stand abweichen,
> steht das in `docs/ist-stand.md` (Abschnitt „Abgleich mit dem Ausbauplan“) –
> der Plan selbst wird nicht stillschweigend korrigiert.

## 0. Oberste Regel: Bestand schützen

Am laufenden System wird NICHTS geändert, bis Maik einen Bereich ausdrücklich freigibt.

- Bestehende Tabellen, Routen, Funktionen und Daten bleiben unverändert. Kein Löschen, kein Umbenennen, keine Datenmigration.
- Vor dem ersten Schritt: vollständiges Backup der Produktionsdatenbank (pg_dump), Wiederherstellung einmal testen.
- Neue Tabellen nur additiv in eigenem Schema `v2`, das den Bestand höchstens liest.
- Testversion läuft in eigener Railway-Umgebung `preview` mit eigener Datenbank und Beispieldaten, nie gegen Produktionsdaten.
- Testversion ist nicht öffentlich: Passwortschutz, `noindex`, nirgends verlinkt, Banner "Testversion" auf jeder Seite.
- Jeder neue Bereich hängt an einem Feature-Flag, Standard aus. Flag aus = alter Zustand.
- Kein Deploy nach `production` ohne Freigabe pro Bereich.

### Phasen

1. **Bestandsaufnahme:** Code und DB-Schema lesen, `docs/ist-stand.md` schreiben (Tabellen, Routen, Datenflüsse, Speicherorte). Nichts ändern. Auf Bestätigung warten.
2. **Klick-Prototyp:** Alle neuen Seiten unter `/preview/...` als echte Oberflächen im fess.jobs Design mit Beispieldaten. Buttons und Formulare reagieren sichtbar, speichern aber nichts dauerhaft.
3. **Feedbackrunden:** Nur der Prototyp wird angepasst, beliebig oft.
4. **Freigabe pro Bereich:** Erst dann wird dieser Bereich echt gebaut, auf `preview` mit anonymisierter Datenkopie getestet, dann per Feature-Flag live.
5. **Rückweg:** Bei Problemen Flag aus, Bestand läuft weiter.

### Bereiche für die Freigabe

| Bereich | Status |
| --- | --- |
| A: Beleg-Link pro Auftrag | Prototyp offen |
| B: Unterlagen-Archiv | Prototyp offen |
| C: Job-Board und Bewerbung | Prototyp offen |
| C: Unterweisungen und Quiz | Prototyp offen |
| D: Crew-Fragebogen und Scoring | Prototyp offen |
| E: Stundentabelle | Prototyp offen |
| E: zvoove-Export | Prototyp offen |
| F: Crew-Übersicht und Grenzen | Prototyp offen |
| G: Disposition | Prototyp offen |

## 1. Ziel und Leitprinzipien

incub workflow wird das zentrale FESS-System: Bewerbung, Onboarding, Unterweisung, Belege, Stunden, Lohnvorbereitung, Disposition. Am Monatsende entsteht per Knopfdruck eine geprüfte Stundendatei für zvoove One.

- Ein Auftrag ist der rote Faden: Stundenzettel, Belege, Bewerbungen, Unterweisungen hängen an einer Auftrags-ID.
- Mitarbeiter tippen nie zweimal: Profil, Fragebogen, Unterweisungen einmal erfassen, wiederverwenden.
- Admin korrigiert statt neu zu erfassen: alles direkt editierbar, jede Änderung im audit_log (GoBD).
- Grenzen warnen vor Überschreitung: Vertragsstunden, Vertragsende, Minijob-Grenze, 70-Tage-Grenze, fehlende Unterweisung.
- `entity_id` auf jedem Datensatz (Mandantentrennung bleibt).
- Mobile first für Crew, Laptop für Admin.

## 2. Ist-Stand und Annahmen

| Bereich | Stand | Annahme |
| --- | --- | --- |
| Stack | Next.js, TypeScript, PostgreSQL, BullMQ/Redis, Claude API | bleibt, ORM wie im Repo vorhanden |
| Hosting | Railway (incub-workflow-production) | neue Umgebung `preview`, Dateien in S3-kompatiblem Storage |
| Routen | /login, /schnell, /mitarbeiter | bleiben unverändert; neu: /b/[token], /jobs, /profil, /unterweisung, /admin/... |
| Stundenzettel | werden erfasst, Stunden per KI ausgelesen | Stundentabelle liest diese Daten nur |
| Lohn | zvoove One, CSV in Stundenschnellerfassung | Export als CSV mit einstellbarem Mapping |
| Dispo heute | Google-Tabelle "Planung Regios", WhatsApp | Aufträge werden aus "Planung Regios" übernommen |
| Verträge | DocuSign, Vertragsstunden als Feld | Vertragsdaten im Mitarbeiterstamm |
| Größe | ca. 250 bis 320 aktive MA, ca. 6.000 h/Monat, ca. 20 Kunden | Tabelle muss 1.000+ Zeilen/Monat flüssig können |

## 3. Datenmodell (Schema v2, additiv)

Jede Tabelle: `id`, `entity_id`, `created_at`, `updated_at`, `created_by`.

| Tabelle | Wichtige Felder |
| --- | --- |
| `employees` | personalnummer, vorname, nachname, telefon, email, wohnort, plz, lat, lng, pool, status (Bewerber, aktiv, gesperrt, ausgeschieden), xp, level, kategorie (A/B/C). Verknüpfung zum bestehenden Mitarbeiterdatensatz nur per Referenz |
| `contracts` | employee_id, vertragsart (Minijob, kurzfristig, Werkstudent, TZ, VZ), wochenstunden, monatsgrenze_std, monatsgrenze_eur, stundenlohn, gueltig_von, gueltig_bis, docusign_id |
| `customers` | name, ansprechpartner, notizen |
| `jobs` | auftrag_id (z. B. FESS-2026-0142), customer_id, titel, ort, lat, lng, datum_von, datum_bis, schichten (JSON), taetigkeiten[], bedarf_anzahl, beschreibung, dresscode, psa_pflicht[], status (Entwurf, offen, voll, laufend, abgerechnet), quelle (Planung Regios, manuell) |
| `applications` | job_id, employee_id, schichten[], eigene_anreise, abfahrtsort, fahrgemeinschaft_plaetze, unterweisungen_ok[], status (neu, passt, Warteliste, abgelehnt, bestätigt), notiz_intern, score |
| `profile_answers` | employee_id, version, antworten (JSON), score_details (JSON), abgeschlossen_am |
| `trainings` | modul, version, sprache, inhalt (JSON), quiz (JSON), gueltig_monate |
| `training_acks` | employee_id, modul, version, quiz_score, bestaetigt_am, ip, user_agent, nachweis_pdf_url |
| `time_entries` | siehe Modul E, plus quelle (Zettel, App, manuell), status (offen, geprüft, freigegeben, exportiert), source_ref (Verweis auf bestehenden Stundenzettel) |
| `documents` | job_id, employee_id, typ (Stundenzettel, Beleg, Unterweisung, Vertrag, Sonstiges), datei_url, beiblatt_pdf_url, betrag, belegart, beschreibung |
| `ratings` | job_id, employee_id, von (Teamleiter, Dispo), puenktlich (1 bis 5), einsatz (1 bis 5), teamwork (1 bis 5), kommentar |
| `audit_log` | tabelle, datensatz_id, feld, alt, neu, user, zeitpunkt |
| `settings` | Minijob-Grenze, km-Satz privat, XP-Regeln, Score-Gewichte |

## 4. Modul A: Beleg-Link pro Auftrag

Jeder Auftrag bekommt einen Upload-Link, der Auftrags-ID, Kunde, Ort, Datum und Beiblatt-Text mitbringt.

1. Admin klickt im Auftrag "Beleg-Link erzeugen": `/b/[token]`, signierter Token (Auftrag, optional Mitarbeiter, Ablauf = Auftragsende + 14 Tage), Rate-Limit.
2. Link per WhatsApp und als QR-Code auf dem Briefing.
3. Mitarbeiter wird über Geräteprofil erkannt, sonst Personalnummer oder Name.
4. Kopf fest: Auftrags-ID, Kunde, Ort, Datum. Darunter: Belegart (Tanken, Parken, Bahn, Hotel, Verpflegung, Material, Sonstiges), Betrag, Foto oder PDF, Kommentar.
5. Beiblatt automatisch aus Vorlage je Belegart mit Platzhaltern `{auftrag_id} {kunde} {ort} {datum} {mitarbeiter} {zweck}`.
6. Claude API liest Betrag, Datum, Händler; Abweichung zur Eingabe gelb markieren.
7. Admin kann Beleg mit einem Klick als Spesen in die Stundenzeile übernehmen.

Technik: bestehende Upload-Komponente aus `/mitarbeiter` wiederverwenden (kopieren, nicht ändern). Verarbeitung über BullMQ.

## 5. Modul B: Unterlagen-Archiv `/admin/unterlagen`

- Links: Aufträge mit Suche, Filter Monat, Kunde, Status, Gesellschaft; Zähler pro Auftrag (Zettel, Belege, fehlend).
- Rechts: Dokumente in Tabs (Stundenzettel, Belege, Unterweisungen, Verträge, Sonstiges), Vorschau, Checkbox pro Datei.
- Download der Auswahl als ZIP, Struktur `Kunde/Auftrag/Typ/Datum_Name.pdf`. Zusätzlich "Ganzer Auftrag als ein PDF".
- Lücken-Check: eingeplant, aber kein Stundenzettel. Button "Erinnerungstext kopieren".
- Kundenpaket: Stundenübersicht ohne Lohndaten plus unterschriebene Zettel.
- ZIP als BullMQ-Job, Download-Link 24 h gültig.

## 6. Modul C: Job-Board, Bewerbung, Unterweisung

Job-Board `/jobs` nur für registrierte Crew (Login nötig).

**Design:** fess.jobs: Orange #FF5A00, Weiß, Dark Navy; Big Shoulders (Headlines), Work Sans (Text), Geist Mono (Zahlen-Chips); Wortmarke in Bitter. Mobile first, als PWA installierbar.

**Job-Karten:** Titel, Kunde, Ort mit Entfernung zum Wohnort, Datum und Schichten, Tätigkeiten als Icons, offene Plätze als Balken, PSA-Badges. Filter: Umkreis, Datum, Tätigkeit, Anreise unter 60 min. Detailseite mit Ablauf, Treffpunkt, Dresscode, Verpflegung, Parken; Ansprechpartner vor Ort erst nach Bestätigung.

**Bewerbung pro Auftrag:**
1. Schichten wählen (Mehrfachauswahl).
2. Vorbefüllt aus Profil: Name, Wohnort, Erfahrung, PSA. Nur bestätigen oder ändern.
3. Vertragsstatus: "Ich habe bereits einen Vertrag bei FESS" ja/nein.
4. Auftragsbezogen: eigene Anreise ja/nein, Abfahrtsort falls abweichend, Fahrgemeinschaft anbieten (Plätze), Kommentar.
5. Pflicht-Unterweisungen der Tätigkeiten dieses Auftrags: fehlt eine oder ist älter als 12 Monate, öffnet sich das Modul. Button "Bewerben" erst nach bestandenem Quiz aktiv.
6. Checkbox "Ich habe die Sicherheitsunterweisung gelesen und verstanden" mit Zeitstempel, Version, Gerät. Nachweis-PDF ins Archiv.
7. Bestätigungsseite mit Status-Tracker.

**Login und Gerätespeicher:** Profil im localStorage (verschlüsselt) und auf dem Server. Login auf neuem Gerät per WhatsApp-Code über Superchat (im Prototyp simuliert). DSGVO-Einwilligung einmalig, Löschen über "Mein Profil".

**Unterweisungs-Bibliothek (DE und EN):**

| Modul | Inhalte | Pflicht für |
| --- | --- | --- |
| Grundunterweisung Event | Verhalten auf dem Gelände, Notausgänge, Sammelplatz, Erste Hilfe und Meldekette, Alkohol und Drogen, Wetter und Gewitter, Lärm, Hitze, Hygiene, Arbeitszeit und Pausen | alle |
| Stagehand, Auf- und Abbau | Heben und Tragen, Teamheben, Cases, Rampen, LKW-Entladung, Absturzkanten, schwebende Last, Kabel, Helm, S3-Schuhe | Stagehand, Ladehelfer |
| Catering und Gastro | Lebensmittelhygiene, Allergene, heiße Flüssigkeiten und Fett, Schnitte, rutschige Böden, Gasflaschen, Spülküche | Catering, Bar, Spüle |
| Flurförderzeuge | Sichtprüfung, Lastdiagramm, Fahren mit Last, Fußgänger, Rampen, Abstellen, Akku/Gas | Staplerfahrer, plus Upload Fahrausweis |
| Höhe und Leitern | Leitern, Podeste, Rollgerüste | wenn im Auftrag hinterlegt |
| Elektrik und Kabel | Sichtprüfung, keine Eingriffe, Kabelbrücken, Nässe | Stagehand, Technik-Helfer |
| Einlass | Einlass, Deeskalation, Rettungswege | Einlass (nicht §34a) |
| Brandschutz | Feuerlöscher, Alarmierung, Evakuierung | alle, jährlich |

- Lektion max. 3 Minuten, Kurzvideo plus max. 6 Grafikkarten, danach Quiz.
- Quiz gemischt, Bestehen ab 80 %, falsche Antwort zeigt die passende Karte erneut.
- Gültigkeit 12 Monate, Erinnerung 14 Tage vorher.
- Inhalte als JSON in `trainings`, damit Texte ohne Code-Änderung gepflegt werden. Texte entwirft Claude aus dem bestehenden VBG-Paket, Freigabe durch Fachkraft für Arbeitssicherheit.
- Hinweis im Nachweis-PDF: ersetzt nicht die Unterweisung vor Ort durch den Entleiher und beim Stapler nicht Fahrausweis und schriftliche Beauftragung.
- Videos später mit Remotion im Repo (eigener Sprint), im Prototyp Platzhalter.

## 7. Modul D: Crew-Fragebogen und Kategorisierung

Beim ersten Öffnen einmalig ca. 35 Fragen in 6 Etappen, Fortschrittsbalken, Zwischenspeicherung.

| Etappe | Inhalte | Zweck |
| --- | --- | --- |
| 1. Basis | Vorname, Nachname, Handy, E-Mail, PLZ, Wohnort, Sprachen mit Niveau, volljährig ja/nein | Kontakt, Geocoding |
| 2. Mobilität | Führerschein B, eigenes Auto, max. Anfahrt in Minuten, Übernachtung ok, Fahrgemeinschaft | Radius, Dispo |
| 3. Erfahrung | Jahre und Einsätze je Tätigkeit (Stagehand, Catering, Bar, Einlass, Stapler, Messebau, Promotion, Logistik), größte Veranstaltung, frühere Firmen | Tätigkeitsprofil |
| 4. Nachweise | Staplerschein, Ersthelfer, Hygienebelehrung IfSG, §34a, Uploads | Spezialtätigkeiten |
| 5. Ausrüstung | S3-Schuhe, Handschuhe, Helm, Warnweste, schwarze Kleidung, Werkzeug, Shirtgröße | PSA-Check |
| 6. Verfügbarkeit | Wunsch-Vertragsart, Wochentage, Nacht ok, Wunschstunden/Monat, aktueller Status, andere Arbeitgeber | Vertrag, Grenzen |

Plus 4 Situationsfragen mit Auswahlantworten (z. B. "Dein Zug fällt um 6:30 aus, was tust du?").

**Scoring (intern, Gewichte in `settings`):** Erfahrung 0 bis 40, Mobilität 0 bis 20, Qualifikation 0 bis 20 (geprüft voll, nur angegeben halb), Situationsfragen 0 bis 20. Kategorie A ab 70, B ab 45, sonst C. Echte Einsatzleistung (XP, Bewertungen) überschreibt den Fragebogen schrittweise.

**Wohnort und Pools:** PLZ geocodieren, Fahrzeit zu Stuttgart, Mannheim, Frankfurt, Idar-Oberstein, NRW einmal berechnen und speichern, nächster Pool wird zugeordnet. Kartenansicht für Dispo.

**Grenzen:** Keine Fragen zu Alter (nur volljährig), Herkunft, Religion, Gesundheit, Schwangerschaft (AGG). Arbeitserlaubnis im Vertragsprozess. Crew sieht nur Level und XP, nicht Kategorie und Score.

## 8. Modul E: Stundentabelle `/admin/stunden`

| # | Spalte | Typ | Logik |
| --- | --- | --- | --- |
| 1 | Datum | Datum | Einsatztag (Schichtbeginn) |
| 2 | Personalnummer | Text | Autocomplete aus Stamm |
| 3 | Vorname | Text | automatisch |
| 4 | Nachname | Text | automatisch |
| 5 | Startzeit | Uhrzeit | |
| 6 | Pause von | Uhrzeit | mehrere Pausen möglich |
| 7 | Pause bis | Uhrzeit | |
| 8 | Endzeit | Uhrzeit | über Mitternacht erkennen |
| 9 | Gesamtzeit | Dezimal | Ende minus Start minus Pausen, berechnet, gesperrt |
| 10 | Pauschale | Stunden | Garantiestunden je Schicht |
| 11 | Kunde | Auswahl | aus Auftrag |
| 12 | Auftrag | Auswahl | Auftrags-ID |
| 13 | Spesen | Euro | |
| 14 | Reisekosten privat | km | Euro = km x Satz aus `settings` (steuerfreier Satz Privat-PKW) |
| 15 | Reisekosten geschäftlich | Euro | Firmenfahrzeug, versteuert |
| 16 | Bonus | Euro | |
| 17 | Abzug | Euro | z. B. Abmahnung |
| 18 | Bemerkung | Text | |

**Bedienung:** Zellen direkt editierbar, Tab/Enter wie Excel, Copy/Paste aus Excel und Google Sheets. Filter und Gruppierung nach Monat, Kunde, Auftrag, Mitarbeiter, Summenzeile. Status mit Farbe (offen grau, geprüft blau, freigegeben grün, exportiert gesperrt, Änderung nur mit Begründung). Massenbearbeitung. Original-Zettel per Klick daneben. Jede Änderung ins audit_log.

**Plausibilität live:** Schicht über 10 h, Ruhezeit unter 11 h, Pause fehlt über 6 h, Doppeleinsatz, kein gültiger Vertrag, Monatsgrenze überschritten.

**Zuschläge:** Nacht, Sonntag, Feiertag rechnet zvoove über den Tarifvertrag. incub exportiert nur die Arbeitszeiten.

**Export:**
- zvoove-CSV für die Stundenschnellerfassung, Spalten-Mapping in den Einstellungen (Lohnarten mit Daniel abstimmen).
- Excel mit den 18 Spalten.
- Kundenübersicht pro Auftrag als PDF.
- Vorher Prüfbericht mit allen Warnungen.

Grid: TanStack Table oder AG Grid Community, virtualisiert.

## 9. Modul F: Crew-Übersicht `/admin/crew`

- Spalten: Name, Personalnummer, Wohnort, Pool, Kategorie, Level, XP; Einsätze und Stunden (Monat, Vormonat, Jahr); Vertrag (Art, Wochenstunden, Monatsgrenze, gültig bis).
- Ampel Auslastung: Stunden gegen Vertragsgrenze (grün unter 80 %, gelb 80 bis 100 %, rot drüber).
- Ampel Vertrag: Ablauf in 30 Tagen gelb, abgelaufen rot.
- Kurzfristig Beschäftigte: Arbeitstage im Jahr gegen 70-Tage-Grenze.
- Minijob: Verdienst gegen Minijob-Grenze (Wert in `settings`, nicht hart codieren).
- Unterweisungen gültig/fehlend.
- Detailseite: Kalender, Stunden pro Monat als Balken, Dokumente, Fragebogen, Notizen, Bewertungen.
- XP pro Einsatz: +10 Basis, +5 pünktlich und Zettel vollständig, +5 gute Bewertung, -20 No-Show, -10 Zettel fehlt. Level: Rookie, Crew, Senior Crew, Teamleiter-fähig. Werte in `settings`.
- Bewertung nach Einsatz durch Teamleiter vor Ort und Dispo: pünktlich, Einsatz, Teamwork (je 1 bis 5).
- Export Excel, wöchentliche Mail "Wer läuft in die Grenze".

## 10. Modul G: Disposition

- Aufträge werden aus der Google-Tabelle "Planung Regios" übernommen (Import/Sync), manuelles Anlegen zusätzlich möglich.
- Pro Auftrag: links Bewerber, rechts offene Plätze je Schicht, Drag and Drop.
- Bewerber sortiert nach Passung (Kategorie, Tätigkeitserfahrung, Fahrzeit, Unterweisung gültig, Vertragsgrenze frei, XP), Gründe als Chips ("38 min", "Stapler ok", "noch 22 h frei").
- Status: passt, Warteliste, abgelehnt, bestätigt. Bestätigte bekommen WhatsApp-Text zum Kopieren mit Briefing- und Beleg-Link (später Superchat-API).
- Konfliktwarnungen: doppelt gebucht, Ruhezeit, Vertrag läuft ab, Unterweisung fehlt, Grenze. Einplanen trotzdem möglich mit Pflichtbegründung.
- "Schicht automatisch füllen" schlägt die besten N vor, Dispo bestätigt.
- Fahrgemeinschafts-Vorschläge nach Wohnort.
- Briefing-Seite pro Auftrag: Ablauf, Treffpunkt mit Karte, Ansprechpartner, Dresscode, Upload-Link. Danach automatisch Stundenzettel-Vorlage mit allen Eingeplanten.
- Wochenplan: alle Aufträge der Woche mit Füllgrad.

## 11. Sprint-Plan

Vorher: Phase 1 Bestandsaufnahme und Phase 2 Klick-Prototyp (siehe Abschnitt 0). Jeder Sprint startet erst nach Freigabe seines Bereichs.

1. **Fundament:** Backup, Schema `v2` additiv, Seed, audit_log, Rollen (Admin, Dispo, Buchhaltung, Crew), Feature-Flags.
2. **Stundentabelle:** Grid, Berechnung, Plausibilität, Status; Lesezugriff auf bestehende Stundenzettel (nichts überschreiben).
3. **Export:** zvoove-CSV mit Mapping, Excel, Prüfbericht.
4. **Belege und Archiv:** `/b/[token]`, Beiblatt-Vorlagen, `/admin/unterlagen`, ZIP-Job.
5. **Crew-Übersicht:** Verträge, Ampeln, 70-Tage- und Minijob-Zähler, XP, Bewertungen.
6. **Profil und Fragebogen:** PWA, Gerätespeicher, WhatsApp-Login, Fragebogen, Scoring, Geocoding, Pools.
7. **Job-Board und Unterweisung:** `/jobs`, Bewerbung, Module mit Quiz, Nachweis-PDF.
8. **Disposition:** Import "Planung Regios", Passungs-Score, Drag and Drop, Konflikte, Briefing, Wochenplan.

Pro Sprint: `docs/sprint-0X.md` mit User Stories, Akzeptanzkriterien, Testfällen. Erst Plan-Modus, dann Umsetzung, dann Tests mit anonymisierten Daten. Deploy immer zuerst `preview`, `production` nur mit Freigabe und Feature-Flag.

## 12. Entscheidungen

| # | Thema | Entscheidung |
| --- | --- | --- |
| 1 | Zweites "Datum" in Spaltenliste | gestrichen |
| 2 | Pauschale | Garantiestunden |
| 3 | Zuschläge Nacht/Sonntag/Feiertag | zvoove über Tarif |
| 4 | Reisekosten privat | in km |
| 5 | Aufträge anlegen | aus "Planung Regios" |
| 6 | Job-Board | nur registrierte Crew |
| 7 | Vertrag in Bewerbung | Status "habe schon Vertrag bei FESS" |
| 8 | Login neues Gerät | WhatsApp-Code über Superchat |
| 9 | Unterweisungstexte | Claude entwirft, Fachkraft gibt frei |
| 10 | Sprachen | DE und EN |
| 11 | Sichtbarkeit Kategorie | Crew sieht nur Level und XP |
| 13 | Marken | nur FESS, Datenmodell mandantenfähig |
| 15 | Bewertung nach Einsatz | Teamleiter und Dispo |

**Noch offen (im Prototyp mit Annahme bauen, als offen markieren):**
- 12: Rolle von Merle (Annahme: schickt Link zum Fragebogen)
- 14: Erfassung vor Ort (Annahme: Papierzettel plus Foto, digitaler Check-in als spätere Option)
- 16: Kundenfreigabe der Stunden (Annahme: Phase 2)
- 17: Löschfrist Bewerber (Annahme: 6 Monate)
- 18: Repo und Push-Rechte
