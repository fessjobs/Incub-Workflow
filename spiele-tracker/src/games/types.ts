import type { FC } from 'react';
import type { ZodType } from 'zod';

/**
 * Das Plugin-Interface, gegen das jedes Spiel implementiert wird.
 *
 * Regel für den Rest der App: außerhalb von src/games/<gameId>/ darf es keine
 * spielspezifische Logik geben. Statistik-Screens, Ranglisten und Profile
 * lesen ausschließlich generische Felder plus das, was computeStats liefert.
 */

// ---------------------------------------------------------------- Events

/** Woher kam ein Event? Spiegelt public.event_source in der Datenbank. */
export type EventSource =
  | 'speech'
  | 'tap'
  | 'quick'
  | 'system'
  | 'manual'
  | 'transcription'
  | 'external';

/**
 * Ein Eintrag im append-only Log. `tMs` ist die Zeit seit Spielstart – bei der
 * Spracherkennung bewusst der Zeitpunkt des ersten Zwischenergebnisses, nicht
 * des finalen, weil daran die Zeitstatistiken hängen.
 */
export interface GameEvent<TPayload = Record<string, unknown>> {
  /** Von der Datenbank vergeben. Fehlt, solange das Event nur lokal gepuffert ist. */
  id?: number;
  sessionId: string;
  playerId: string | null;
  tMs: number;
  type: string;
  payload: TPayload;
  source: EventSource;
  /**
   * Korrekturen überschreiben nie. Sie hängen ein neues Event an, das auf das
   * alte zeigt. Über diesen Weg ersetzt später auch die Whisper-Nachkorrektur
   * einzelne Würfe.
   */
  correctsEventId?: number | null;
  /** Streicht das Ziel-Event ersatzlos (z.B. doppelt erkannter Wurf). */
  voidsTarget?: boolean;
  /** Reihenfolge bei identischem tMs. */
  clientSeq?: number;
}

// ------------------------------------------------------------ Statistik

/**
 * Ergebnis von computeStats.
 *
 * `metrics` ist der generische Vertrag: flache Zahlen, die die App ohne
 * Spielwissen weiterverarbeiten kann – Ranglisten, Achievements, persönliche
 * Bestwerte, Spielerkarten. Alles Spielspezifische gehört nach `detail` und
 * wird ausschließlich von der ResultComponent des Spiels gelesen.
 */
export interface StatsResult {
  metrics: Record<string, number>;
  /** Kurzfassung fürs Logbuch und die Session-Kachel. */
  headline: string;
  /** Als Text formulierte Auffälligkeiten ("Insights"). */
  insights: string[];
  /** Freiform, nur für die ResultComponent des jeweiligen Spiels. */
  detail: Record<string, unknown>;
}

/** Wie eine Metrik dem Menschen gezeigt wird. */
export interface MetricFormat {
  /** 'number' | 'percent' | 'duration' | 'perMinute' */
  kind: 'number' | 'percent' | 'duration' | 'perMinute';
  decimals?: number;
  unit?: string;
}

export interface LeaderboardDef {
  id: string;
  name: string;
  /** Schlüssel aus StatsResult.metrics. */
  metric: string;
  /** 'desc' = mehr ist besser. */
  direction: 'desc' | 'asc';
  format?: MetricFormat;
  /** Kurzer Hinweis, was die Zahl bedeutet. */
  description?: string;
}

/**
 * Ein Attribut der Sammelkarte. Die Rohmetrik wird über eine lineare Rampe
 * auf 1..99 normalisiert: bei `worst` gibt es 1, bei `best` gibt es 99.
 * `best` darf kleiner als `worst` sein – dann ist weniger besser (Ziehzeit).
 */
export interface PlayerCardAttributeDef {
  id: string;
  /** Dreibuchstabiges Kürzel im Stil der Fußballkarten, z.B. 'SPD'. */
  short: string;
  name: string;
  metric: string;
  worst: number;
  best: number;
}

// -------------------------------------------------------- Komponenten

export interface GameSetupProps<TConfig> {
  config: TConfig;
  onConfigChange: (next: TConfig) => void;
  /** Startet die Session. Die Hülle legt dabei die DB-Zeile an. */
  onStart: () => void;
  /** true, solange die Session angelegt wird. */
  starting: boolean;
}

/**
 * Was die PlayComponent von der Hülle bekommt. Das Spiel kümmert sich um
 * Regeln und Darstellung, die Hülle um Persistenz, Uhr und Session-Lifecycle.
 */
export interface GamePlayProps<TConfig> {
  config: TConfig;
  /** Bereits aufgezeichnete Events dieser Session, chronologisch. */
  events: GameEvent[];
  /** Hängt ein Event an. tMs setzt die Hülle, wenn es nicht mitgegeben wird. */
  append: (event: AppendableEvent) => void;
  /**
   * Korrigiert ein früheres Event, indem ein neues angehängt wird.
   * Das Original bleibt im Log erhalten.
   */
  correct: (targetId: number | undefined, patch: AppendableEvent) => void;
  /** Millisekunden seit Spielstart, tickt während der Session. */
  elapsedMs: number;
  /** Beendet die Session und springt zur Auswertung. */
  finish: () => void;
  playerId: string | null;
}

export interface GameResultProps<TConfig> {
  config: TConfig;
  events: GameEvent[];
  stats: StatsResult;
}

/** Was ein Spiel beim Anhängen angeben muss – der Rest kommt von der Hülle. */
export interface AppendableEvent {
  type: string;
  payload?: Record<string, unknown>;
  source?: EventSource;
  /** Nur setzen, wenn ein anderer Zeitpunkt als "jetzt" gemeint ist. */
  tMs?: number;
  playerId?: string | null;
  voidsTarget?: boolean;
}

// ------------------------------------------------------------ Definition

export interface GameDefinition<TConfig = unknown> {
  /** Stabiler Schlüssel. Landet als game_id in der Datenbank. */
  id: string;
  name: string;
  /** Ein Satz, der im Spieleauswahl-Screen steht. */
  description: string;
  /** Emoji als Platzhalter-Icon. */
  icon: string;
  minPlayers: number;
  maxPlayers: number;

  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;

  SetupComponent: FC<GameSetupProps<TConfig>>;
  PlayComponent: FC<GamePlayProps<TConfig>>;
  ResultComponent: FC<GameResultProps<TConfig>>;

  /**
   * Der Kern. Muss eine reine Funktion sein: gleiche Events plus gleiche
   * Config ergeben immer dasselbe Ergebnis. Nur so lassen sich neue
   * Auswertungen rückwirkend auf alte Sessions anwenden.
   */
  computeStats: (events: GameEvent[], config: TConfig) => StatsResult;

  leaderboards: LeaderboardDef[];
  xpFormula: (result: StatsResult) => number;

  /** Optional: Attribute für die Sammelkarte (Block 7). */
  playerCardAttributes?: PlayerCardAttributeDef[];
  /** Ab wie vielen Sessions zeigt die Karte echte Werte statt "Rookie"? */
  minSessionsForCard?: number;
}

/**
 * Für Stellen, die Spiele generisch halten (Registry, Router, Listen).
 * Die Config ist dort per Definition unbekannt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any>;
