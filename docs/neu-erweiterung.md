# Erweiterung des neuen Systems (Stand 10.10.2026)

Alles hier gilt für das neue Dashboard (`/admin`) und die Mitarbeiterseiten (`/crew`).
Das **bisherige System bleibt unberührt** (Belege, Auslagen, Einsätze, Stunden, Dokumente,
Unterschriften). Es gibt **keine neue Migration**: die neuen Daten liegen in den
vorhandenen `v2_`-Tabellen (neue Datensatz-Arten und zusätzliche Felder).

## Überblick

| Wunsch | Wo im neuen Dashboard |
| --- | --- |
| Schuhgröße und Arbeitskleidung gegen Pfand abfragen | Fragebogen (Etappe „Ausrüstung“), Verwaltung unter **Arbeitskleidung** |
| Auftrags-Import aus der Regio-Tabelle | **Import → Aufträge** |
| Personal-Import aus zvoove (mit Vertrag und Befristung) | **Import → Personal** |
| Vorgefertigte Nachricht je Person mit Link | **Nachrichten** |
| Aufträge erst nach deiner Bestätigung sichtbar | **Freigaben** |
| Welche Schulung für was nötig ist, Videos | **Unterweisungen → Pflicht & Videos** |
| Video muss abgespielt werden, Unterschrift am Ende | Unterweisung am Handy, Nachweis in **Crew → Person → Unterweisungen** |
| Unterschiedliche Benutzer | **Benutzer** |
| Anbindung ans bisherige System (vorbereitet, **aus**) | **Schnittstelle** |
| Monats-Sicherung der Dokumente auf den eigenen Rechner | **Sicherung** |

## Schuhgröße und Arbeitskleidung gegen Pfand

- Im Fragebogen (Etappe 5) steht jetzt die **Schuhgröße (EU 35–50)** und die Frage
  **„Arbeitskleidung von FESS (gegen Pfand)“**: Ja/Nein, dann die gewünschten Artikel
  (T-Shirt, Hoodie, Softshell-Jacke, Arbeitshose, Sicherheitsschuhe S3, Warnweste,
  Arbeitshandschuhe). Die nötigen Größen (Shirt, Hose, Schuh) werden mitverlangt; der Server
  prüft das beim Abschicken noch einmal.
- Unter **Arbeitskleidung** siehst du den Bedarf **nach Größe gezählt** (mit Personenliste),
  kannst eine **Bestellliste** und eine **Personenliste als CSV** laden und am Profil einer
  Person (Tab **Kleidung**) **Ausgabe, Pfandbetrag und Rückgabe** eintragen. Das offene Pfand
  wird summiert.
- Artikel, Größenart und **Pfandbeträge** stellst du unter *Arbeitskleidung → Artikel und Pfand*
  ein (nur Administration). Die Pfandbeträge sind leer, bis du sie einträgst; der Hinweistext im
  Fragebogen („…gegen Pfand… Rückgabe…“) ist ein Vorschlag und dort änderbar.
- Die Frage lässt sich komplett abschalten (Haken *Frage nach Arbeitskleidung im Fragebogen zeigen*).

## Freigabe: Aufträge sehen erst nach Bestätigung

- Wer den Fragebogen abgeschickt und die **Grund-Unterweisung und den Brandschutz** erledigt hat,
  steht unter **Freigaben → Warten auf Bestätigung**. Erst nach „Freigeben“ (einzeln, ausgewählte
  oder alle) sieht die Person die Aufträge und kann sich bewerben.
- Die Person sieht bis dahin: *„Das Team prüft deine Angaben und schaltet die Aufträge frei“*,
  mit Knopf „Status prüfen“ (und automatischer Prüfung alle 30 Sekunden bzw. beim Zurückkehren in
  den Tab). **Der Server liefert ohne Freigabe keine Aufträge aus und lehnt Bewerbungen mit 403 ab** –
  es ist nicht nur die Oberfläche.
- „Nicht freigeben“ ist möglich (neutraler Hinweis für die Person), „Zurücknehmen“ stellt den
  Stand wieder her, der sich aus Fragebogen und Unterweisung ergibt. Jede Entscheidung steht im
  Änderungsprotokoll. „Trotzdem freigeben“ geht auch für Personen, die noch nicht fertig sind.
- Die Voraussetzungen (welche Module vor der Freigabe gültig sein müssen) stellst du unter
  *Unterweisungen → Pflicht & Videos* ein (Zeile „Vor der Freigabe“).
- Beim Personal-Import kannst du **alle Importierten gleich freigeben** (Haken). Standard: aus.

## Import

Beides unter **Import**. Ablauf: Datei hochladen (**.xlsx** oder **.csv**, bis 8 MB) **oder** die Zellen
aus Excel / der Online-Tabelle kopieren und einfügen → Spalten werden anhand der Überschriften
erkannt (änderbar) → **Vorschau** mit „neu / wird aktualisiert / unverändert / Fehler“ → erst dann
**Jetzt übernehmen**. **Es wird nie etwas gelöscht.** Ein erneuter Import derselben Tabelle ist
gefahrlos: es ändert sich nur, was sich in der Tabelle geändert hat.

Die Überschriftenzeile wird gesucht (Titelzeilen darüber sind okay), Trennzeichen und Zeichensatz
(UTF-8 oder Windows-1252) werden erkannt, Datumsformate (`31.12.2026`, `1.3.26`, ISO, Excel-Zahlen),
Uhrzeiten (`8`, `8:30`, `0830`, `08:00-16:30`) und Zahlen (`13,90 €`) werden tolerant gelesen.

### Personal (zvoove)

- Erwartet wird ein Export des **Personalstamms**. Erkannt werden u. a. Personalnummer, Name
  (getrennt oder zusammen, „Nachname, Vorname“), Handy/Telefon, E-Mail, PLZ, Ort,
  **Beschäftigungs-/Vertragsart, Eintritt, Befristet bis / Vertragsende, Austritt,
  Wochenstunden, Stundenlohn**, Status.
- Vertragsarten: *geringfügig/Minijob → Minijob*, *kurzfristig*, *Werkstudent*, *Teilzeit*,
  *Vollzeit*. **Unbekannte Texte** (z. B. „Aushilfe“) werden aufgelistet; du ordnest sie einmal zu.
- **Befristung** → „gültig bis“ des Vertrags (Ampel „Vertrag läuft aus“ in der Crew-Liste). Ohne
  Enddatum gilt der Vertrag als unbefristet. Steht der Austritt in der Vergangenheit, wird die
  Person als „ausgeschieden“ geführt (abschaltbar: dann wird sie übersprungen).
- Mehrere Zeilen derselben Personalnummer (ein Vertrag je Zeile) werden zusammengefasst: der
  **aktuelle** Vertrag gilt.
- **Abgleich mit vorhandenen Personen**: erst über die **Personalnummer**, dann über die **E-Mail**,
  dann über den **Namen bei vorläufiger Nummer** (Bewerber `B0001` bekommt so seine echte Nummer).
  Aktualisiert werden Name, Handy, E-Mail, PLZ/Ort (und Pool), Vertrag und Status. Fragebogen,
  Unterweisungen, Bewertungen, Notizen, XP und Freigabe bleiben unberührt.
- **Datensparsamkeit**: Spalten wie Geburtsdatum, IBAN/Bank, Sozialversicherungs-/Steuernummer,
  Krankenkasse, Konfession, Staatsangehörigkeit, Straße werden erkannt, in der Vorschau
  **namentlich als „nicht gelesen“** aufgeführt und **nirgends gespeichert**. (Wenn du etwas davon
  brauchst, sag Bescheid – dann gezielt und mit Begründung.)
- Dieses Dashboard-System ersetzt zvoove nicht: Vertrag und Lohn laufen weiter dort; der Import hält
  nur Vertragsart, Laufzeit und Lohn für Ampeln und Grenzen aktuell.

### Aufträge (Regio-Tabelle)

- **Eine Zeile = eine Schicht.** Zeilen mit derselben Auftragsnummer – oder mit gleichem
  Kunde/Veranstaltung/Ort an zusammenhängenden Tagen (Lücke größer als 3 Tage = neuer Auftrag) –
  werden zu **einem Auftrag mit mehreren Schichten**.
- Erkannt werden Datum, Kunde, Veranstaltung, Ort, PLZ, Beginn/Ende **oder** Zeitraum
  (`08:00-16:00`), Anzahl Personen, Tätigkeit (aus Freitext: *Aufbau/Abbau → Stagehand,
  Service → Catering, Theke → Bar, Einlass/Ticket, Gabelstapler, Messebau, Promotion, Logistik*),
  Schichtbezeichnung, Treffpunkt, Ansprechpartner, Bemerkung, Dresscode, Mitbringen,
  Verpflegung, Parken, Arbeiten in der Höhe.
- Neue Aufträge kommen als **Entwurf** (für die Crew unsichtbar), außer du wählst „sofort
  veröffentlichen“. Fehlt eine Uhrzeit, wird 08:00–16:00 eingesetzt **und gemeldet**; solche Aufträge
  bleiben Entwurf.
- **Erneuter Import**: Aufträge werden über die Auftragsnummer (sonst über einen stabilen Schlüssel aus
  Kunde/Veranstaltung/Ort/erstem Tag) wiedererkannt; Schichten über Datum, Tätigkeit, Beginn (und
  Bezeichnung). Geänderte Endzeiten/Anzahlen werden aktualisiert, **Besetzung und Status bleiben**,
  Schichten, die in der Tabelle fehlen, **bleiben bestehen** (Hinweis in der Vorschau).
- Tipp: Eine **Auftragsnummer-Spalte** macht den Abgleich am sichersten.

## Nachrichten

- Pro Person eine **vorgefertigte Nachricht** aus einer Vorlage (Einladung, Erinnerung Fragebogen,
  „Aufträge freigeschaltet“, „Schulung offen“ – eigene Vorlagen möglich). Platzhalter:
  `{vorname} {nachname} {pnr} {link}`.
- Empfänger wählen (Fragebogen offen / wartet auf Freigabe / freigegeben / alle), **„Links erzeugen“**:
  jede Person bekommt ihren **eigenen Link** (7–60 Tage gültig, höchstens 10 Mal nutzbar, im
  System nur als Hash gespeichert). Dann je Person **Kopieren**, **In WhatsApp öffnen** (Chat mit
  vorgeschriebenem Text – gesendet wird erst, wenn du in WhatsApp auf Senden tippst), **Als gesendet
  markieren** (steht danach in der Liste); außerdem „Alle kopieren“ und CSV.
- **Es wird nichts automatisch verschickt.**
- Der Fragebogen ist mit Name, Handy und E-Mail aus dem Import **vorbelegt**.

## Schulungen: Pflicht und Videos

- *Unterweisungen → Pflicht & Videos*: Matrix **„Welche Schulung für was?“**: Zeilen *Jeden Auftrag*,
  *je Tätigkeit*, *Arbeiten in der Höhe*, *Vor der Freigabe*; Spalten die acht Module. Zusätzlich
  **Kundenregeln** (z. B. „Messe Stuttgart verlangt Höhe“) und – beim Anlegen eines Auftrags –
  **Zusatz-Schulungen nur für diesen Auftrag**. Alles addiert sich. Der Server nutzt dieselben Regeln
  vor jeder Bewerbung; die Disposition zeigt fehlende Schulungen entsprechend. „Auf Standard“ stellt
  die bisherigen Regeln wieder her.
- **Videos**: Die acht mitgelieferten Videos (Deutsch) sind schon eingetragen (siehe nächster Abschnitt). Pro Modul
  lässt sich eine andere Adresse eintragen (YouTube, Vimeo oder eine Videodatei; nur `https`), optional eine
  **englische Fassung**, oder das Video **entfernen** (dann beginnt die Unterweisung gleich mit den Lernkarten).
  „Standard wiederherstellen“ trägt das mitgelieferte Video wieder ein. YouTube wird ohne Cookies
  (`youtube-nocookie.com`) eingebunden; wer jede Verbindung zu Google vermeiden will, nimmt die mitgelieferten Dateien.
- Zu jedem Modul gibt es einen **Drehbuch-Entwurf** (Szenen, Sprechertext, Bildidee, Einblendung) auf
  Deutsch und Englisch zum Kopieren – abgeleitet aus den Lernkarten, **nicht** von einer Fachkraft für
  Arbeitssicherheit freigegeben. Alle acht Entwürfe auch als Dokument: `docs/video-drehbuecher.md`.

## Unterweisung mit Video und Unterschrift

**Ablauf am Handy:** 1. Video → 2. Lernkarten → 3. Quiz (ab 80 %) → 4. Bestätigung („gelesen und verstanden“) →
5. **Unterschrift** mit dem Finger → fertig. Erst mit der Unterschrift gilt die Unterweisung als abgeschlossen
(12 Monate gültig, wie bisher). Die Testversion (`/preview`) zeigt denselben Ablauf mit Unterschrift, aber ohne
Videodatei.

### Die Videos
- **Dateien:** `public/videos/<modul>.de.mp4` und `<modul>.de.jpg` (Vorschaubild) für `grund`, `stagehand`, `catering`,
  `stapler`, `hoehe`, `elektrik`, `einlass`, `brandschutz` (hochkant 9:16, ca. 65–75 s, Untertitel eingebrannt, zusammen
  ca. 29 MB). Das Dockerfile kopiert `public` mit, ein Deployment genügt.
- **Nicht öffentlich:** Die Videos werden nicht als freie Dateien unter `/videos/…` ausgeliefert (die Anmeldung der App
  gilt dafür), sondern über `GET /api/neu/crew/video/<datei>`. Das geht nur mit Mitarbeiter-Sitzung oder angemeldeter
  Administration, kennt Teilabrufe (`Range`, wichtig für Handys und iPhone) und akzeptiert nur Dateinamen aus dem Ordner
  (`a–z`, Ziffern, `.`, `-`; `.mp4`/`.jpg`).
- **Eintragen:** Der Standard ist `/api/neu/crew/video/<modul>.de.mp4`. Die englische Fassung
  (`<modul>.en.mp4`) ist vorbereitet (Feld „Adresse der englischen Fassung“), die Dateien liegen aber noch nicht bei.
- **Video tauschen:** neuen Dateinamen vergeben (z. B. `grund.de.v2.mp4`) und im Dashboard eintragen, sonst zeigen Handys
  unter Umständen noch die alte Fassung aus dem Zwischenspeicher.

### Das Video muss abgespielt werden
- Eigener Player **ohne Bedienelemente zum Vorspulen**: Abspielen/Pause und ein Fortschrittsbalken. Vorspulen wird auf die
  bisher gesehene Stelle zurückgesetzt, **Zurückspulen** ist erlaubt. Beim Verlassen des Tabs pausiert das Video.
- „Weiter zu den Lernkarten“ wird erst frei, wenn das Video **zu Ende gelaufen** ist.
- **Prüfung auf dem Server:** Beim ersten Abspielen merkt sich der Server die Startzeit (`unterweisung-start`). Beim
  Abschluss muss seit dem Start mindestens **85 % der Videolänge** vergangen sein (Länge aus der MP4-Datei gelesen;
  Einstellung `NEU_VIDEO_MINDESTANTEIL`, `0` schaltet das ab). Ohne Start oder zu früh antwortet der Server mit 409.
  Das ist eine **Plausibilitätsprüfung**, kein Beweis, dass jemand wirklich hingeschaut hat.
- **Wenn das Video nicht abspielbar ist** (alter Browser, Netzproblem): Der Player zeigt einen Hinweis und einen Link zum
  Öffnen in neuem Tab; die Person kann dann bestätigen, es auf anderem Weg vollständig gesehen zu haben. Das wird im
  Nachweis als „von der Person bestätigt“ vermerkt (im Dashboard: *bestätigt* statt *abgespielt*).
- Bei **YouTube/Vimeo/Link** kann der Player nichts prüfen; dort bestätigt die Person („Ich habe das Video angesehen“).
- Das Video ist Pflicht, solange beim Modul „Pflicht“ angehakt ist (Standard: ja) und eine Adresse eingetragen ist.

### Unterschrift und Nachweis
- Die Unterschrift wird auf dem Gerät gezeichnet (PNG) und **nur zum Erzeugen des Nachweises** an den Server geschickt. Dort
  wird sie geprüft (echtes PNG, Größe, nicht leer) und in ein **Nachweis-PDF** gesetzt: Person, Personalnummer, Modul,
  Datum und Uhrzeit (Berlin), Gültigkeit, Version der Inhalte, Quiz-Ergebnis, Video (abgespielt/bestätigt), Erklärung und
  Hinweis „Entwurf, nicht von einer Fachkraft für Arbeitssicherheit freigegeben“.
- Das PDF liegt unveränderlich in `v2_files` (Art `unterweisung-nachweis`, mit SHA-256). Im Profil der Person stehen nur
  Zeitpunkt der Unterschrift und die Nachweis-Nummer – **das Unterschriftsbild steht nie in den Personendaten** (das
  Schema lehnt es ab, ein Test prüft es).
- Die Person öffnet ihr PDF am Ende der Unterweisung (`/api/neu/crew/nachweis/<modul>`, nur das eigene). Die
  Administration sieht je Modul **Video**, **Unterschrift** und **Nachweis (PDF)** unter *Crew → Person → Unterweisungen*.
  Ältere Bestätigungen ohne Unterschrift bleiben gültig und zeigen „ohne“.
- Je **Modul eine Unterschrift** und ein eigenes PDF (jedes Modul gilt 12 Monate für sich). Wiederholt die Person das
  Modul, entsteht ein neues PDF; das bisherige bleibt gespeichert.
- **Sicherung:** Bereich „Unterweisungsnachweise“ legt die PDFs des Monats unter
  `Neues-System/Unterweisungsnachweise/` ab, dazu `Neues-System/Unterweisungen_<Monat>.csv`.
- **Löschen durch die Person (DSGVO):** Entfernt die Person ihr Profil, werden die Personendaten gelöscht; die
  Nachweis-PDFs bleiben als Dokumentation der erfolgten Unterweisung zunächst bestehen (wie die Beleg-Dateien). Ob und wie
  lange das nötig ist (Aufbewahrung), ist mit dem Datenschutz und der Fachkraft für Arbeitssicherheit zu klären.

### Offene Punkte
- **KI-Stimme:** Der Sprecher der Videos ist eine KI-Stimme. Bitte prüfen, ob sie gekennzeichnet werden soll/muss.
- **Fachliche Freigabe:** Die Texte sind Entwürfe nach dem Drehbuch (`docs/video-drehbuecher.md`) und noch nicht von einer
  Fachkraft für Arbeitssicherheit geprüft; die Hinweise zu Flurförderzeugen (Fahrausweis) und Einlass (§ 34a GewO)
  stehen am Ende des jeweiligen Videos im Bild.
- **Englische Videos** liegen noch nicht im Projekt (bisher nur die deutschen Dateien geliefert).

## Benutzer und Rollen

Administratoren des bisherigen Systems haben immer vollen Zugang. Weitere Konten (bisherige
Rolle *Mitglied* oder *Buchhaltung*) bekommen unter **Benutzer** eine Rolle im neuen Dashboard.
Die Konten und Passwörter bleiben im bisherigen System (gleiche Anmeldung).

| Rolle | Darf |
| --- | --- |
| Administration | alles (Einstellungen, Importe, Benutzer, Schnittstelle, Beispieldaten) |
| Disposition | Aufträge, Bewerber, Crew, Disposition, Freigaben, Nachrichten, Kleidung, **Auftragsimport**; **keine** Verträge/Löhne ändern, keine Stunden/Belege |
| Buchhaltung | Stundentabelle und Unterlagen schreiben, Crew lesen |
| Nur lesen | alles ansehen, nichts ändern |

**Durchgesetzt auf dem Server**, nicht nur im Menü: Schreiben nur in den erlaubten Datensätzen,
Verträge/Löhne bleiben bei Nicht-Administratoren unverändert (der Server übernimmt den
gespeicherten Vertrag), Personal-Import, Benutzer und Schnittstelle nur für Administratoren.
Jede Rollenänderung steht im Änderungsprotokoll.

Grenzen: Der Menüpunkt „Neu“ im bisherigen System erscheint nur für Administratoren; andere Konten
öffnen `/admin` direkt. Konten mit der bisherigen Rolle **Disposition** leitet die Weiche des
bisherigen Systems ins Einsatzmodul um – für sie müsste an dieser Weiche eine Zeile ergänzt werden
(bewusst **nicht** getan, siehe Fragen). Die Dispo-Rolle sieht Löhne in den Ampeln (Minijob-Grenze
braucht sie), sie werden aber nirgends angezeigt oder änderbar.

## Schnittstelle zum bisherigen System: vorbereitet, aus

Ziel (später): Das neue System ist eigenständig; das bisherige System, das die Einsatzzettel
(Stundenzettel) erzeugt, **zieht die Aufträge** von hier, und das neue System **liest (nur lesend) die
PDF-Ablage** der Einsatzzettel und übernimmt die Stunden.

**Heute fließt nichts.** Was vorbereitet ist (`src/lib/neu/schnittstelle.ts`, Seite *Schnittstelle*):

- **Zwei Schalter nötig:** Umgebungsvariable `NEU_SCHNITTSTELLE=an` auf dem Server **und** der Haken
  in den Einstellungen. Selbst dann antworten die beiden Adressen
  (`GET /api/neu/schnittstelle/auftraege`, `POST /api/neu/schnittstelle/stunden`) in dieser Version nur
  mit „noch nicht eingebaut“ (501), ohne Schalter mit 404, ohne Anmeldung mit 401.
- **Verträge (Formate)** sind festgelegt und getestet: *Auftrags-Feed* (ohne Entwürfe, Besetzung nur
  mit Personalnummer und Name) und *Stunden-Rückmeldung* (Datei-Verweis + Hash, je Person Datum,
  Beginn, Ende, Pausen). Die Seite zeigt eine **Vorschau des Feeds**, berechnet nur im Browser.
- **Umrechnung Rückmeldung → Stundenzeilen** ist fertig und getestet: Zeilen kommen immer als **„offen“**
  mit Quelle „Zettel“ und Verweis auf die PDF; unbekannte Personalnummern werden gemeldet, nicht geraten;
  dieselbe Datei zählt nie doppelt (Hash).
- Bausteine für später (nur Schnittstellen, ohne Inhalt): `PdfQuelle` (Verzeichnis / S3 / HTTP, nur lesend)
  und `StundenPdfLeser`.
- Das neue System greift **nicht** auf Tabellen des bisherigen Systems zu. Ein Test prüft das automatisch
  (erlaubt: Anmeldung, Datenbank-Zugang, Rate-Limit, Basis-Adresse, Beleg-Auslesung; Datenbank nur
  `v2_`-Tabellen und lesend die Konten für die Benutzerliste).

Noch zu klären, bevor wir es einschalten: Wo liegen die PDFs und wie kommt das neue System lesend heran?
Zieht das bisherige System die Aufträge (Pull) oder schickt das neue sie (Push)? Ist die Personalnummer auf dem
Zettel dieselbe wie im Personalstamm? Wie erkennen wir den Auftrag zur PDF (Auftragsnummer)? Dafür brauchen
wir ein paar Beispiel-PDFs.

## Sicherung pro Monat

Unter **Sicherung** (nur Administration) lädst du die Dokumente **eines Monats** als ZIP auf deinen Rechner und
wählst vorher, was hineinkommt:

| Bereich | Inhalt in der ZIP |
| --- | --- |
| Konkretisierungen (AÜG) | `Konkretisierungen/…pdf`, nach Einsatzdatum im Monat |
| Stundennachweise / Stundenzettel | `Stundennachweise/…pdf` (mit Unterschriften), nach Einsatzdatum |
| Exporte (zvoove, Excel) | `Exporte/…`, im System abgelegte Exportdateien |
| Auslagen | `Auslagen/<Firma>/…pdf` (Beleg mit Beiblatt), Belegdatum im Monat |
| Firmenbelege | `Firmenbelege/<Firma>/…pdf` |
| Private Belege | `Private-Belege/<Firma>/…pdf` |
| (Option) Original-Fotos | zusätzlich unter `…/originale/` |
| Personalstamm | `Personalstamm_Stand_<Datum>.csv` (Stand heute; ohne Geburtsdatum und Bankdaten) |
| Neues System: Belege | Fotos/PDFs der Beleg-Links des Monats + Übersicht |
| Neues System: Stunden | `Neues-System/Stunden_<Monat>.csv` |
| Neues System: Unterweisungsnachweise | `Neues-System/Unterweisungsnachweise/…pdf` (mit Unterschrift) + `Neues-System/Unterweisungen_<Monat>.csv` |
| Neues System: Gesamtstand | `Neues-System/Gesamtstand.json` (alle Personen, Aufträge, Einstellungen …) |

Immer dabei: **`Inhalt.csv`** (jede Datei mit Größe und SHA-256-Fingerabdruck, damit sich später prüfen lässt, dass nichts
verändert wurde) und **`LIESMICH.txt`**.

- **Vorschau** vor dem Herunterladen: Anzahl und Größe je Bereich. Obergrenze 150 MB pro ZIP (die Datei entsteht im
  Arbeitsspeicher); bei mehr bitte Bereiche getrennt laden. Die letzte Auswahl merkt sich der Browser.
- **Nur lesend.** Das Bisherige System wird nicht verändert; die Sicherung kennt nur Lesezugriffe auf Dokumente, Belege und
  Personalstamm (ein Test erzwingt das). Belege siehst du so, wie du sie im Belegbereich siehst: **keine Belege anderer
  Administratoren**, Mitarbeiter-Belege erst nach Freigabe.
- Jede Sicherung steht im Änderungsprotokoll („Zuletzt heruntergeladen“). Auf der Übersicht erinnert ein Hinweis, wenn der
  letzte volle Monat noch nicht gesichert wurde.
- Monatsgrenzen gelten in Berliner Zeit. Dokumente zählen nach dem Einsatzdatum (sonst nach Erstellungsdatum), Belege nach Belegdatum.
- **Keine komplette Datenbanksicherung.** Für eine vollständige Wiederherstellung bleibt `pg_dump` bzw. das Backup bei Railway
  (`docs/preview-umgebung.md`). Die ZIP enthält Personen- und Belegdaten: verschlüsselt oder geschützt ablegen.
- Eine **automatische** Sicherung auf dein Gerät ist das noch nicht – die Seite kann nichts auf deinen Rechner schieben. Dafür
  gäbe es später eine nächtliche Kopie in einen externen Speicher oder einen Zeitplan-Auftrag auf deinem Rechner.

## Tests

- Unit: `tests/unit/neu-erweiterung.test.ts` (Tabellen lesen, Personal- und Auftragsimport, Freigabe,
  Schulungsregeln, Kleidung, Video, Nachrichten, Rollen, Schnittstelle aus, Trennung vom bisherigen System;
  Videos: Standardvideos, eigene Pfade, Vorspul-Sperre, Mindestdauer, MP4-Länge aus den echten Dateien, Dateinamen der
  Medienroute, Unterschrift prüfen, Nachweis-PDF).
- Browser: `tests/e2e/neu.spec.ts` (Fragebogen mit Kleidung → Freigabe → Bewerbung, Kleidung im Dashboard,
  Import mit Datei und Einfügen, Nachrichten, Schulungen/Video, Benutzer/Rollen mit echtem Zweitkonto,
  Schnittstelle aus; Unterweisung: Medienroute mit Anmeldung und Teilabrufen, Server verlangt Video, Mindestdauer und
  Unterschrift, Nachweis-PDF für Person und Administration, Sicherung). Der Testserver läuft mit
  `NEU_VIDEO_MINDESTANTEIL=0.03`; das Test-Chromium spielt H.264 nicht ab, darum stellen die Tests Start und Ende des
  Players nach (`play`/`ended`).
