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
| Unterschiedliche Benutzer | **Benutzer** |
| Anbindung ans bisherige System (vorbereitet, **aus**) | **Schnittstelle** |

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
- **Videos**: je Modul eine Adresse (YouTube, Vimeo oder eine Videodatei; nur `https`). Sie erscheint
  auf der ersten Lernkarte; ohne Adresse bleibt der Platzhalter. Optional **Pflicht „Video angesehen“**
  vor dem Quiz. YouTube wird ohne Cookies (`youtube-nocookie.com`) eingebunden; wer jede Verbindung zu
  Google vermeiden will, nimmt eine `.mp4` von eigenem Speicher.
- Zu jedem Modul gibt es einen **Drehbuch-Entwurf** (Szenen, Sprechertext, Bildidee, Einblendung) auf
  Deutsch und Englisch zum Kopieren – abgeleitet aus den Lernkarten, **nicht** von einer Fachkraft für
  Arbeitssicherheit freigegeben. Alle acht Entwürfe auch als Dokument: `docs/video-drehbuecher.md`.

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

## Tests

- Unit: `tests/unit/neu-erweiterung.test.ts` (Tabellen lesen, Personal- und Auftragsimport, Freigabe,
  Schulungsregeln, Kleidung, Video, Nachrichten, Rollen, Schnittstelle aus, Trennung vom bisherigen System).
- Browser: `tests/e2e/neu.spec.ts` (Fragebogen mit Kleidung → Freigabe → Bewerbung, Kleidung im Dashboard,
  Import mit Datei und Einfügen, Nachrichten, Schulungen/Video, Benutzer/Rollen mit echtem Zweitkonto,
  Schnittstelle aus).
