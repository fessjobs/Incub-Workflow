# Prototyp: Stand, Annahmen und Fragen je Bereich

Stand: 09.10.2026 · gehört zu `docs/testversion.md` (wie man ihn öffnet) und
`docs/ausbauplan.md` (Plan). Grundlage für das Gespräch „Was bleibt, was anders?“
(Phase 3). **Nichts hier ist freigegeben oder produktiv.**

Legende: ✅ im Prototyp durchklickbar · ◐ teilweise · ○ nicht gezeigt.
⚑ = Annahme von mir, die du bestätigen oder ändern sollst.

---

## Bereich A: Beleg-Link `/b/[token]`

| Plan | Prototyp |
| --- | --- |
| Link je Auftrag, ohne Anmeldung | ✅ Dispo erzeugt den Link je Auftrag (Auftragsseite → „Beleg-Link erzeugen“) |
| Foto, Betrag, Datum, Belegart | ✅ 7 Belegarten, Foto/PDF-Auswahl, Betrag, Datum, Händler, Zweck |
| Beiblatt-Vorlagen | ✅ je Belegart ein Text mit Platzhaltern (Auftrag, Kunde, Ort, Datum, Person, Zweck) |
| Auslesen und Abgleich | ◐ simuliert; Abweichungen werden **gelb** markiert (Hinweis, keine Ablehnung) |
| Ablage | ✅ erscheint im Unterlagen-Archiv |

⚑ Die Person weist sich mit der **Personalnummer** aus (kein Login). ⚑ Der Link läuft zum Jahresende ab.
**Fragen:** Reicht die Personalnummer, oder soll der Link personalisiert sein? Soll der Beleg in
die bestehende Belegwelt (Erstattung, DATEV) fließen oder getrennt bleiben? Fehlt eine Belegart?
Wer bekommt die gelben Abweichungen?

## Bereich B: Unterlagen-Archiv `/admin/unterlagen`

✅ Alle Dokumente je Person und Auftrag (Verträge, Unterweisungsnachweise, Stundennachweise,
Belege), Suche, Filter nach Typ und Auftrag. ○ ZIP je Auftrag, Lücken-Check („Was fehlt noch?“)
und Kundenpaket sind noch nicht gezeigt.
⚑ Aufbewahrung 10 Jahre für Belege und Nachweise (Annahme, mit Steuerberater klären).
**Fragen:** Welche Pakete brauchst du wirklich (Kunde, Prüfer, Steuerberater)? Soll das Archiv
Dokumente auch **hochladen** können?

## Bereich C: Job-Board, Bewerbung, Unterweisung

| Plan | Prototyp |
| --- | --- |
| Job-Board nur für registrierte Crew (6) | ✅ ohne Anmeldung nichts sichtbar |
| Login auf neuem Gerät per WhatsApp-Code (8) | ◐ Code ist vorausgefüllt; Zustimmung zur Datenspeicherung Pflicht |
| Bewerbung mit Schichten, Anreise, Fahrgemeinschaft | ✅ vier Schritte |
| „Habe schon Vertrag bei FESS“ (7) | ✅ Frage in Schritt 2 |
| Unterweisung mit Quiz, DE/EN (9, 10) | ✅ 8 Module, Karten, Quiz ab 80 %, bei falscher Antwort erscheint die Karte erneut |
| Nachweis-PDF | ◐ als Text; Hinweis „ersetzt nicht die Unterweisung vor Ort / den Fahrausweis“ |
| Gültigkeit | ✅ 12 Monate, Erinnerung 14 Tage vorher |

⚑ Bewerben setzt den **abgeschickten Fragebogen** voraus. ⚑ Die Unterweisung ist ein **Gate**:
ohne gültige Pflichtmodule der gewählten Schichten geht die Bewerbung nicht raus.
⚑ Pflichtmodule je Tätigkeit: Grund + Brandschutz für alle; Stagehand/Messebau: Stagehand + Elektrik;
Catering/Bar: Catering; Einlass: Einlass; Stapler: Stapler; Logistik: Stagehand; Höhe nur wenn im
Auftrag hinterlegt.
⚑ **Texte sind Entwürfe** und müssen vor jeder echten Nutzung von einer Fachkraft für
Arbeitssicherheit freigegeben werden (Entscheidung 9).
**Fragen:** Stimmt die Zuordnung Tätigkeit → Pflichtmodul? Fehlt ein Modul? Soll das Quiz bei
Nichtbestehen sofort wiederholbar sein (so im Prototyp)? Wer sieht den Nachweis (Kunde)?

## Bereich D: Crew-Fragebogen und Scoring

✅ 6 Etappen mit 33 Fragen und ein Kurz-Check mit 4 Situationsfragen (zusammen 37), Zwischenspeichern,
Fortschrittsbalken, DE/EN. Nach dem Absenden erscheint die Person im Dashboard unter *Bewerber*
mit Score je Block und Kategorie.
✅ Scoring wie im Plan: Erfahrung 40, Mobilität 20, Qualifikation 20 (geprüft voll, angegeben halb),
Situation 20; A ab 70, B ab 45. Echte Einsatzleistung ersetzt den Fragebogen schrittweise (⚑ bis zu
70 % nach 20 Einsätzen). Gewichte und Schwellen sind in den Einstellungen live änderbar, die
Verteilung der Crew aktualisiert sich sofort.
✅ **AGG:** keine Fragen zu Alter (nur „volljährig“), Herkunft, Religion, Gesundheit,
Schwangerschaft – ein Test prüft das automatisch. Die Crew sieht nur Level und XP (11).
◐ Geocoding: PLZ → grobe Orte-Tabelle statt Dienst; Fahrzeit = Luftlinie × 1,25 bei 85 km/h.
⚑ Punkte der Situationsfragen (0–5 je Antwort) sind von mir festgelegt.
**Fragen:** Fehlt eine Frage? Sind die vier Situationsfragen und ihre Antworten so brauchbar?
Welchen Geocoding-Dienst (Kosten, DSGVO) soll es am Ende geben?
⚑ offen **12:** Merle verschickt den Link zum Fragebogen (Annahme; Text in den Einstellungen).
⚑ offen **17:** Löschhinweis für Bewerber ohne Einsatz nach 6 Monaten (nicht automatisch).

## Bereich E: Stundentabelle `/admin/stunden` und Export

✅ 18 Spalten wie im Plan (Datum … Bemerkung), Gesamtzeit berechnet und gesperrt, Schicht über
Mitternacht erkannt, mehrere Pausen (erste in der Tabelle, weitere im Detail).
✅ Bedienung: Zellen direkt bearbeiten, Tab/Enter/Pfeile, Einfügen aus Excel/Google Sheets
(auch ein ganzer 18-Spalten-Block), Filter (Monat, Kunde, Auftrag, Person, Status, Quelle,
„nur Fehler“), Gruppierung (Auftrag, Kunde, Mitarbeiter, Tag, Monat), Summenzeile, Status mit
Farbe, Massenbearbeitung, Original-Zettel daneben (als Beispieldarstellung), Änderungsprotokoll.
✅ Plausibilität live: Schicht über 10 h, Ruhezeit unter 11 h, Pause fehlt über 6 h (⚑ 30 min ab 6 h,
45 min ab 9 h), Doppeleinsatz, kein gültiger Vertrag, unbekannte Personalnummer, Monatsgrenze.
✅ Export: Prüfbericht → zvoove-CSV (Mapping aus den Einstellungen) → Excel → Kundenübersicht.
Exportierte Zeilen sind gesperrt, Änderung nur mit Begründung.
⚑ Eine freigegebene Zeile, die sich inhaltlich ändert, fällt auf „geprüft“ zurück.
⚑ Reisekosten privat = km × 0,30 €; Garantiestunden gehen als eigene Position raus.
⚑ **Lohnart-Nummern im Prototyp sind Platzhalter** (100, 700, 701, 800, 900) und nicht aus
`config/zvoove-mapping.json`. Bonus und Abzug sind absichtlich „nicht abgestimmt“ (mit Daniel
klären) – dadurch zeigt der Prüfbericht seine Warnung.
**Fragen:** Spaltenreihenfolge ok? Was fehlt in der Tabelle? Soll `/admin/stunden` die
bestehenden `time_entries` bearbeiten (eine Wahrheit, empfohlen) oder einen eigenen Bestand
führen? Wer darf exportierte Zeilen öffnen?
⚑ offen **14:** Papierzettel plus Foto (Quelle „Zettel“, von der Dispo übertragen).
⚑ offen **16:** Kundenfreigabe der Stunden ist Phase 2 und nicht gebaut.

## Bereich F: Crew-Übersicht und Grenzen `/admin/crew`

✅ Liste mit Pool, Vertrag, Stunden im Monat gegen Grenze, Vertragsende, 70 Tage bzw. Minijob-Verdienst,
Unterweisung, Level/XP, Gesamt-Ampel; Filter; Karte mit Pools; Detailseite mit Score-Aufschlüsselung,
Unterweisungen, Stunden, Bewertungen.
✅ Ampeln wie im Plan: Auslastung grün < 80 %, gelb 80–100 %, rot darüber; Vertrag 30 Tage gelb,
abgelaufen rot; 70 Tage für kurzfristig Beschäftigte.
⚑ **Minijob-Grenze 603 €** ist ein einstellbarer Annahmewert – bitte gegen den aktuellen Mindestlohn prüfen.
⚑ **Level-Schwellen** Rookie 0 / Crew 100 / Senior Crew 300 / Teamleiter-fähig 600 XP (im Plan nicht festgelegt).
XP-Werte wie im Plan (+10, +5, +5, −20, −10).
○ Kalender, Balken je Monat, Excel-Export und die wöchentliche Mail „Wer läuft in die Grenze“.
**Fragen:** Passen die Level-Schwellen? Welche Spalten brauchst du auf einen Blick?

## Bereich G: Disposition `/admin/dispo`

✅ Auftragsliste und Wochenplan mit Füllgrad. Auftragsseite: links Bewerber nach Passung (0–100) mit
Gründen als Chips („51 min“, „noch 29 h frei“, „Unterweisung gültig“), rechts Schichten mit Plätzen,
Drag & Drop oder „Einplanen“. Konflikte (doppelt gebucht, Ruhezeit, Vertrag, Unterweisung, Monatsgrenze,
Überbesetzung) lassen sich nur mit **Pflichtbegründung** übergehen. „Automatisch füllen“ nimmt nur
Personen ohne Konflikt. WhatsApp-Aushang, Beleg-Link, Briefing mit Fahrgemeinschafts-Vorschlägen und
Stundenzettel-Vorlage.
⚑ **Passungs-Gewichte** (Kategorie 25, Erfahrung 25, Fahrzeit 20, Unterweisung 10, Vertragsgrenze 10,
XP 10) sind meine Annahme und nach deiner Durchsicht einstellbar zu machen.
○ Import aus „Planung Regios“ (nur als Quelle-Chip gezeigt), Karte beim Treffpunkt, Superchat-Versand.
**Fragen:** Stimmt die Gewichtung der Passung? Welche Konflikte sollen **nie** übergehbar sein?
In welchem Format kommt „Planung Regios“ (Spalten, Rhythmus)?

---

## Offene Punkte aus dem Plan

| # | Thema | Annahme im Prototyp |
| --- | --- | --- |
| 12 | Rolle von Merle | verschickt den Link zum Fragebogen |
| 14 | Erfassung vor Ort | Papierzettel plus Foto, Dispo überträgt; digitaler Check-in später |
| 16 | Kundenfreigabe der Stunden | Phase 2 – nicht gebaut |
| 17 | Löschfrist Bewerber | 6 Monate, Löschhinweis an den Admin |
| 18 | Repo und Push-Rechte | Arbeit nur auf dem Arbeitszweig `claude/magical-carson-1fmj40`; nichts auf den Auslieferungszweig |

## Entscheidungen, die ich vor dem Bauen von dir brauche

1. **Datenmodell:** Weg (a) additiv (`v2` enthält nur das Neue und zeigt per Fremdschlüssel auf
   `employees`/`assignments`) – meine Empfehlung – oder (b) strikt parallel wie im Plan. Siehe
   `docs/ist-stand.md` 9.3 und `docs/schema-v2-entwurf.md`.
2. **Stundentabelle** auf den bestehenden `time_entries` (empfohlen) oder eigener Bestand.
3. **Crew-Zugang:** auf den bestehenden Token-Links aufsetzen oder echte Crew-Konten
   (WhatsApp-Code, Entscheidung 8). Der Prototyp zeigt Konten.
4. **Backup und `preview`-Umgebung** (Schritte außerhalb des Repos): `docs/preview-umgebung.md`.
5. **Branch-Strategie** für `preview` und `production` (Punkt 18).

## Was der Prototyp bewusst nicht kann

Keine Datenbank, kein Versand (WhatsApp, Mail), keine echte Anmeldung, kein Kartendienst, kein
Dateispeicher, kein Zugriff auf deine echten Personen, Aufträge oder Zahlen. Alles ist erfunden und
deterministisch erzeugt: wer morgen und übermorgen reinschaut, sieht dasselbe.
