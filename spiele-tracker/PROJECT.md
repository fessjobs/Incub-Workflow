# Spiele-Tracker – Architektur, Datenmodell, offene Punkte

Web-App zum Tracken von Spielen einer Freundesgruppe. Erstes vollständig
implementiertes Spiel wird ein Dart-Trainingsspiel ("Round the Clock auf
Zeit"); die Architektur ist von Anfang an auf beliebige weitere Spiele als
Plugin ausgelegt.

**Stand: Block 1 und 2 abgeschlossen.** Siehe [Fahrplan](#fahrplan).

---

## Leitentscheidungen

Vier Entscheidungen, aus denen sich fast alles andere ergibt:

**1. Das Event-Log ist die einzige Wahrheit.**
Jede Statistik wird aus `game_events` berechnet, nie aus aggregierten Feldern.
Der Grund ist nicht Eleganz, sondern Rückwirkung: eine neue Auswertung, die in
einem Jahr dazukommt, gilt automatisch für die gesamte Historie. `session_results`
existiert, ist aber ausdrücklich nur ein Cache mit Versionsnummer.

**2. Das Log ist append-only – auch gegen den eigenen Client.**
`game_events` hat in der Datenbank keine `update`- und keine `delete`-Policy.
Eine Korrektur ist eine neue Zeile mit `corrects_event_id`. Damit bleibt die
Historie erhalten (was hat die Spracherkennung ursprünglich verstanden?), und
die spätere Whisper-Nachkorrektur braucht keinen Sonderweg.

**3. Kein Spielwissen außerhalb von `src/games/<gameId>/`.**
Statistik-Screens, Ranglisten und Profile lesen ausschließlich generische
Felder plus `StatsResult.metrics`. Das Demo-Spiel `demo-reaction` ist der
laufende Beweis: es funktioniert überall, ohne dass die App es kennt.

**4. Zeit über `performance.now()`, nicht `Date.now()`.**
Monoton – eine Systemzeitkorrektur mitten in der Session darf die
Zeitstatistiken nicht verschieben.

---

## Tech-Stack

| | |
| --- | --- |
| Build | Vite 5 |
| UI | React 18, TypeScript strict, Tailwind 3 |
| State | Zustand |
| Diagramme | Recharts (ab Block 5) |
| Validierung | Zod |
| Backend | Supabase – Postgres, Auth, Realtime, Storage |
| Tests | Vitest |

Reine Web-App, kein PWA-Setup. Mobile first: die App wird auf dem Handy neben
der Dartscheibe bedient. Dunkles Theme, hoher Kontrast, Live-Screen aus 2,5 m
lesbar und ohne Scrollen bedienbar.

---

## Verzeichnisse

```
src/
  games/                 Alle Spiele als Plugins
    types.ts             Das Interface – der wichtigste Vertrag im Projekt
    registry.ts          Registrierung + Validierung beim Start
    index.ts             Die einzige Stelle, an der Spiele eingehängt werden
    README.md            Anleitung: wie baue ich ein neues Spiel
    demo-reaction/       Demo-Spiel als Architektur-Nachweis (löschbar)
  features/
    auth/                Login, Callback, Zugriffsschutz
    session/             Die generische Session-Hülle
      sessionStore.ts    Event-Puffer, Persistenz, Lifecycle
      GameRoute.tsx      Setup → Live → Auswertung, ohne Spielwissen
      useElapsed.ts      Uhr auf Basis von requestAnimationFrame
      TagPicker.tsx      Freitext-Tags plus zuletzt verwendete
  lib/
    supabase.ts          Client
    database.types.ts    Typen zum Schema (handgeschrieben, siehe unten)
  store/authStore.ts     Session und Profil
  components/            Geteilte UI-Bausteine
  pages/                 Screens außerhalb des Spiels

supabase/
  migrations/            Nummerierte SQL-Migrationen inkl. RLS
  test/                  Migrations- und RLS-Tests gegen lokales Postgres
```

---

## Das Plugin-Interface

Vollständig dokumentiert in [`src/games/README.md`](./src/games/README.md).
Kurzfassung:

```ts
interface GameDefinition<TConfig> {
  id: string;                    // = game_id in der Datenbank, nie ändern
  name, description, icon: string;
  minPlayers, maxPlayers: number;
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;        // wird beim Start gegen das Schema geprüft
  SetupComponent, PlayComponent, ResultComponent: FC<...>;
  computeStats: (events, config) => StatsResult;   // rein & deterministisch
  leaderboards: LeaderboardDef[];
  xpFormula: (result) => number;
  playerCardAttributes?: PlayerCardAttributeDef[];
  minSessionsForCard?: number;
}
```

`StatsResult.metrics` ist der generische Vertrag – flache Zahlen, die
Ranglisten, Achievements, persönliche Bestwerte und Spielerkarten ohne
Spielwissen verarbeiten. `StatsResult.detail` ist Freiform und wird nur von
der `ResultComponent` des jeweiligen Spiels gelesen.

Die Registry prüft beim Start: id-Format, doppelte ids, `minPlayers`/
`maxPlayers`, ob `defaultConfig` zum Schema passt, doppelte Ranglisten-ids.
Lieber laut scheitern als später kaputte Ranglisten.

---

## Datenmodell

### Kern

| Tabelle | Zweck |
| --- | --- |
| `profiles` | 1:1 zu `auth.users`, per Trigger angelegt |
| `groups`, `group_members` | Gruppen mit Einladungscode, Rollen owner/admin/member |
| `game_sessions` | Eine Session eines Spiels; `config` als JSONB |
| `session_players` | Teilnehmer |
| `session_tags` | Frei vergebene Tags, normalisiert (keine festen Kategorien) |
| **`game_events`** | **Das append-only Log. Der Kern.** |
| `game_events_effective` | View: korrigierte Events aufgelöst |
| `session_results` | Cache der berechneten Statistik, mit `stats_version` |
| `personal_bests` | Bestwerte je Nutzer/Spiel/Metrik, separat geführt |

### `game_events`

```
id                bigint identity
session_id        uuid
player_id         uuid
t_ms              int        Millisekunden seit Spielstart
type              text       'throw', 'retrieval_start', 'signal', ...
payload           jsonb      spielspezifisch
source            enum       speech | tap | quick | system | manual
                             | transcription | external
corrects_event_id bigint     zeigt auf das korrigierte Event
voids_target      boolean    streicht das Ziel ersatzlos
client_seq        int        Reihenfolge bei gleichem t_ms
```

`source = 'external'` ist der offen gehaltene Weg für ein externes
Erkennungssystem wie Autodarts. `source = 'transcription'` ist der Weg für die
Whisper-Nachkorrektur.

### Progression

`player_economy` (XP, Level, Coins) als Projektion über das append-only
`economy_ledger`. `achievements` ist eine **deklarative Regeltabelle** – ein
neues Achievement ist ein `insert`, keine Code-Änderung:

```json
{ "scope": "session", "metric": "hitRate", "op": "gte",
  "value": 0.5, "gameId": "dart-clock" }
```

`shop_items` / `player_inventory` / `player_loadout`: ausschließlich Kosmetik,
keine Pay-to-Win-Mechanik, keine Echtgeldanbindung. Käufe laufen über
`purchase_item()` serverseitig, damit der Preis nicht umgangen werden kann.

### Benachrichtigungen

`notifications` (Realtime-Publikation aktiv), `play_invites` +
`play_invite_responses` für den "Wer hat Bock?"-Button. Notifications werden
ausschließlich serverseitig erzeugt (SECURITY DEFINER) – es gibt bewusst keine
`insert`-Policy, sonst könnte jeder jedem beliebige Meldungen schicken.

### Storage

| Bucket | Sichtbarkeit | Pfad |
| --- | --- | --- |
| `avatars` | öffentlich lesbar | `<user_id>/<datei>` |
| `session-audio` | privat, nur der Aufnehmende | `<user_id>/<datei>` |

Session-Audio bewusst nicht gruppenweit sichtbar: das sind Raumaufnahmen, an
denen Dritte unbeteiligt mitwirken.

---

## Sicherheit (RLS)

Jede Tabelle hat RLS aktiviert. Ohne passende Policy ist der Zugriff verboten.

Mitgliedschafts-Prüfungen laufen über `SECURITY DEFINER`-Helfer
(`is_group_member`, `is_group_admin`, `is_group_owner`, `shares_group_with`,
`can_read_session`, `can_write_session`). Das ist kein Stilmittel, sondern
notwendig: eine Policy auf `group_members`, die `group_members` abfragt,
erzeugt sonst eine Endlosrekursion.

Sichtbarkeitsregeln in einem Satz:

- **Profile**: nur eigenes plus Leute, mit denen man eine Gruppe teilt
- **Gruppen**: nur eigene. Beitritt über `join_group_by_code()`, weil man die
  Gruppe vor dem Beitritt noch nicht lesen darf
- **Sessions**: Ersteller, Teilnehmer, oder die ganze Gruppe (falls gesetzt)
- **`game_events`**: nur `select` und `insert` – append-only
- **`economy_ledger`**, **`player_achievements`**: append-only, nur eigene
- **`notifications`**: nur eigene, kein `insert` für Clients

Getestet, nicht nur behauptet: `supabase/test/` fährt ein lokales Postgres
hoch, spielt die Migrationen zweimal ein (Idempotenz) und prüft 29 Zusicherungen
– unter anderem, dass ein Außenstehender fremde Sessions, Events und Tags nicht
sieht, dass `update`/`delete` auf `game_events` ins Leere greifen und dass ein
Kauf ohne Deckung scheitert.

```bash
supabase/test/run.sh          # braucht ein lokales Postgres 16
```

---

## Die Session-Hülle

`src/features/session/sessionStore.ts` ist das Bindeglied zwischen Spiel und
Datenbank. Ein Spiel ruft `append()`, `correct()`, `finish()` – der Rest
passiert hier:

- Session anlegen, Teilnehmer und Tags eintragen
- `tMs` vergeben (oder den vom Spiel gelieferten Zeitpunkt übernehmen – die
  Spracherkennung nutzt das, um den Zeitpunkt des **ersten** Zwischenergebnisses
  zu setzen statt den des finalen)
- Events lokal puffern, alle 1,5 s im Hintergrund schreiben

Der lokale Puffer ist kein Luxus: neben der Dartscheibe ist das WLAN oft mies.
Der Live-Screen darf nie auf eine Netzwerkantwort warten, und ein Wurf darf
nicht verloren gehen, weil ein Request hängt. Schlägt ein Schreibvorgang fehl,
bleiben die Events im Puffer und werden erneut versucht; das UI zeigt nur
dezent "n ausstehend".

Korrekturen auf noch nicht geschriebene Events werden über die lokale ID
verknüpft und beim Flush auf die Server-ID aufgelöst.

### Lokale Zeit

`game_sessions` speichert zusätzlich `local_started_at` (ohne Zone) und
`tz_offset_minutes`. Die Tageszeit-Auswertung fragt "war das eine Session um
22 Uhr abends", nicht "um 20 Uhr UTC" – in UTC zu rechnen wäre schlicht falsch.

---

## Einrichtung

```bash
npm install
cp .env.example .env.local     # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY
npm run dev
```

Migrationen: `supabase/migrations/*.sql` in dieser Reihenfolge einspielen,
entweder per `supabase db push` oder im SQL-Editor. Details in
[`supabase/README.md`](./supabase/README.md).

In den Supabase-Einstellungen zusätzlich nötig:
Auth → URL Configuration → Redirect URL auf `<app-url>/auth/callback`, und für
Google der OAuth-Provider mit Client-ID und Secret.

```bash
npm run test        # Vitest
npm run typecheck   # tsc --noEmit
npm run build
```

---

## Fahrplan

| Block | Inhalt | Stand |
| --- | --- | --- |
| 1 | Setup, Schema, Migrationen, RLS, Auth-Flow | ✅ |
| 2 | Game-Registry, Plugin-Interface, Dummy-Spiel | ✅ |
| 3 | Dart: Setup, Timer, Rundenlogik, Event-Logging, Tap-Board | offen |
| 4 | Spracherkennung, Normalisierer, Korrektur-UI | offen |
| 5 | Statistik-Engine und Auswertungs-Screens | offen |
| 6 | Profile, Gruppen, Logbuch, Ranglisten | offen |
| 7 | Level, Coins, Shop, Achievements, Spielerkarten | offen |
| 8 | Benachrichtigungen | offen |

---

## Offene Punkte

Bewusst getroffene Entscheidungen, die später noch einmal angefasst werden
sollten:

- **`database.types.ts` ist handgeschrieben.** Sobald ein echtes Supabase-Projekt
  existiert, per `supabase gen types typescript` erzeugen. Bis dahin gilt: wer
  eine Migration ändert, ändert diese Datei mit.
- **Kein Auto-Reload alter Sessions.** Ein Reload mitten in der Session
  verliert den lokalen Zustand; die Events sind in der Datenbank, werden aber
  noch nicht zurückgeladen. Relevant ab Block 3.
- **Account löschen.** `groups.created_by` wird `null` (die Gruppe überlebt),
  `game_sessions` hängt an `cascade` (Sessions verschwinden mit dem Account).
  Das ist die datenschutzfreundlichere Variante, kostet aber Gruppen-Historie.
  Falls das stört: `created_by` nullable machen und Sessions behalten.
- **`session_results` kann veralten.** `stats_version` ist vorhanden, ein
  Nachrechnen-Job noch nicht.
- **Mehrspieler-Sessions** sind im Schema vorgesehen (`session_players`),
  aber weder in der Hülle noch im Demo-Spiel umgesetzt.
- **Bundle-Größe** liegt bei ~464 kB (131 kB gzip), im Wesentlichen
  supabase-js. Vor Block 5 (Recharts) lohnt ein Blick auf Code-Splitting.
- **Web-Push** funktioniert ohne PWA-Installation nur eingeschränkt und auf iOS
  gar nicht. Deshalb ist das In-App-Center (Realtime) in Block 8 die
  Hauptvariante, Web-Push nur optionale Zugabe mit Feature-Detection.
