# Ein neues Spiel bauen

Jedes Spiel ist ein Plugin. Die App außerhalb von `src/games/<gameId>/` kennt
kein einziges Spiel – sie kennt nur das Interface aus [`types.ts`](./types.ts).

Wenn du irgendwo außerhalb deines Spielordners eine Zeile schreiben musst
(außer der einen Registrierung), stimmt etwas nicht. Sag Bescheid, statt es
hinzubiegen: dann fehlt dem Interface etwas.

## Die vier Schritte

1. Ordner `src/games/mein-spiel/` anlegen
2. `GameDefinition` implementieren
3. In [`src/games/index.ts`](./index.ts) importieren und `registerGame(...)` aufrufen
4. Unit-Tests für `computeStats` schreiben

Mehr ist es nicht. Setup-Screen, Live-Screen, Auswertung, Ranglisten, XP,
Logbuch und Profil funktionieren danach automatisch.

## Was du bekommst

Die Hülle (`src/features/session/`) erledigt für dich:

- Session in der Datenbank anlegen, Teilnehmer und Tags eintragen
- Zeitbasis: `tMs` wird gesetzt, `elapsedMs` tickt
- Events lokal puffern und im Hintergrund nach Supabase schreiben –
  ein Wurf geht auch bei mieser Verbindung nicht verloren
- Session beenden, `computeStats` aufrufen, Ergebnis speichern

Dein Spiel ruft nur `append()`, `correct()` und `finish()`.

## Die wichtigste Regel

**Alles landet im Event-Log, Statistiken werden immer daraus berechnet.**

Führe keine Punktestände in `useState` mit und speichere sie nirgends. Wenn
etwas passiert, hänge ein Event an. `computeStats` muss eine reine Funktion
sein: gleiche Events plus gleiche Config ergeben immer dasselbe Ergebnis.

Der Grund: so lassen sich neue Auswertungen rückwirkend auf alte Sessions
anwenden. Wer in einem Jahr eine neue Kennzahl einbaut, bekommt sie für die
gesamte Historie – aber nur, wenn die Rohdaten im Log stehen.

## Minimalbeispiel

```tsx
// src/games/muenzwurf/index.ts
import { z } from 'zod';
import type { GameDefinition, GameEvent } from '../types';

const configSchema = z.object({ tosses: z.number().int().min(1).max(100) });
type Config = z.infer<typeof configSchema>;

function Setup({ config, onConfigChange, onStart, starting }) {
  return (
    <>
      <input
        type="number"
        value={config.tosses}
        onChange={(e) => onConfigChange({ ...config, tosses: Number(e.target.value) })}
      />
      <button onClick={onStart} disabled={starting}>Los</button>
    </>
  );
}

function Play({ config, events, append, finish }) {
  const done = events.filter((e) => e.type === 'toss').length;
  return (
    <>
      <p>{done} / {config.tosses}</p>
      <button onClick={() => append({ type: 'toss', payload: { side: 'kopf' }, source: 'tap' })}>
        Kopf
      </button>
      <button onClick={() => append({ type: 'toss', payload: { side: 'zahl' }, source: 'tap' })}>
        Zahl
      </button>
      {done >= config.tosses && <button onClick={finish}>Auswerten</button>}
    </>
  );
}

function Result({ stats }) {
  return <p>{stats.headline}</p>;
}

// Reine Funktion, ausschließlich aus dem Log gerechnet.
function computeStats(events: GameEvent[], config: Config) {
  const tosses = events.filter((e) => e.type === 'toss');
  const heads = tosses.filter((e) => e.payload.side === 'kopf').length;
  return {
    metrics: {
      tosses: tosses.length,
      heads,
      headRate: tosses.length ? heads / tosses.length : 0,
      completed: tosses.length >= config.tosses ? 1 : 0,
    },
    headline: `${heads} × Kopf von ${tosses.length}`,
    insights: heads > tosses.length * 0.7 ? ['Verdächtig viel Kopf.'] : [],
    detail: { sides: tosses.map((e) => e.payload.side) },
  };
}

export const muenzwurfGame: GameDefinition<Config> = {
  id: 'muenzwurf',              // nur a-z, 0-9 und Bindestriche
  name: 'Münzwurf',
  description: 'Kopf oder Zahl.',
  icon: '🪙',
  minPlayers: 1,
  maxPlayers: 1,
  configSchema,
  defaultConfig: { tosses: 10 },
  SetupComponent: Setup,
  PlayComponent: Play,
  ResultComponent: Result,
  computeStats,
  leaderboards: [
    { id: 'head-rate', name: 'Kopfquote', metric: 'headRate', direction: 'desc',
      format: { kind: 'percent' } },
  ],
  xpFormula: (r) => 5 * r.metrics.tosses,
};
```

Und in `src/games/index.ts`:

```ts
import { muenzwurfGame } from './muenzwurf';
// ...
registerGame(muenzwurfGame);
```

## Die Felder im Einzelnen

| Feld | Wozu |
| --- | --- |
| `id` | Landet als `game_id` in der Datenbank. Nie mehr ändern, sonst hängen alte Sessions in der Luft. |
| `configSchema` | Zod-Schema der Spielparameter. Wird vor dem Start geprüft. |
| `defaultConfig` | Muss zum Schema passen – die Registry prüft das beim Start. |
| `computeStats` | Der Kern. Rein, deterministisch, nur aus Events. |
| `leaderboards` | Verweisen per `metric` auf Schlüssel aus `StatsResult.metrics`. |
| `xpFormula` | Bekommt das `StatsResult` und gibt XP zurück. |
| `playerCardAttributes` | Optional, für die Sammelkarte. Rohwert wird über `worst`→`best` auf 1..99 gerechnet; `best < worst` heißt "weniger ist besser". |

### `StatsResult`

```ts
{
  metrics: Record<string, number>;  // generisch: Ranglisten, Achievements, Karte
  headline: string;                 // eine Zeile fürs Logbuch
  insights: string[];               // Auffälligkeiten als Text
  detail: Record<string, unknown>;  // frei, nur deine ResultComponent liest das
}
```

`metrics` ist der Vertrag mit dem Rest der App: flache Zahlen, die ohne
Spielwissen verarbeitet werden können. Alles, was eine Interpretation braucht,
gehört nach `detail`.

Nützliche Konvention: `completed` als 0/1 mitgeben – Achievements können dann
generisch darauf prüfen.

## Korrekturen

`correct(eventId, patch)` hängt ein neues Event an, das auf das alte zeigt.
Überschrieben wird nie. Die Datenbank lässt für `game_events` gar kein
`update` und kein `delete` zu.

Die aufgelöste Sicht darauf liefert die View `game_events_effective`
(korrigierte Originale fallen raus, Korrekturen erben `t_ms`).

## Testen

Für `computeStats` gehören Unit-Tests dazu – siehe
[`demo-reaction/stats.test.ts`](./demo-reaction/stats.test.ts) als Vorlage.
Weil die Funktion rein ist, brauchst du dafür weder Datenbank noch React:
Event-Array rein, Ergebnis prüfen.

Denk an die unangenehmen Fälle: leeres Log, unsortiert eintreffende Events,
abgebrochene Session, Events ohne passenden Vorgänger.

## Das Demo-Spiel

`demo-reaction/` ist bewusst trivial und existiert nur als Nachweis, dass die
Architektur trägt. Es darf gelöscht werden, sobald es echte Spiele gibt.
