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
  /**
   * Lokale ID der Hülle. Schon vor dem Serverschreiben vorhanden – ein Spiel
   * kann damit auf einen eben erst erzeugten Wurf verweisen, etwa um ihn zu
   * korrigieren.
   */
  localId?: number;
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

// ----------------------------------------------------------- Spieler

/**
 * Ein Teilnehmer einer Session. Alle Spieler haben einen Account — Gäste
 * ohne Anmeldung gibt es bewusst nicht (Entscheidung vom 30.10.).
 */
export interface SessionPlayer {
  id: string;
  displayName: string;
  /** Hochgeladenes Foto als Data-URL, falls vorhanden. */
  avatarUrl?: string | null;
  /** Emoji als Ersatzbild, wenn kein Foto da ist. */
  emoji?: string | null;
  /** Farbe des Spielers – zieht sich durch Avatar, Tabellen und Karten. */
  color?: string | null;
  /** Frei gewählter Spitzname/Typ, z.B. "Der Ruhige". */
  character?: string | null;
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
/**
 * Was computeStats über die Session weiß, das nicht im Event-Log steht.
 * Bei Mehrspieler-Sessions wird computeStats einmal je Spieler aufgerufen;
 * `playerId` sagt, für wen gerade gerechnet wird.
 */
export interface StatsContext {
  playerId: string | null;
  players: SessionPlayer[];
}

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

  /** Alle Teilnehmer dieser Session, in Spielreihenfolge. */
  players: SessionPlayer[];
  /**
   * Wer gerade an der Reihe ist. Bei Einzelsessions der einzige Spieler.
   * Events, die das Spiel anhängt, werden automatisch diesem Spieler
   * zugeordnet.
   */
  activePlayerId: string | null;
  /**
   * Wechselt den Spieler am Abwurfpunkt. Die Hülle schreibt dazu ein
   * `player_change`-Event – wann gewechselt wird, bestimmt das Spiel, denn
   * das ist eine Regelfrage (ganzer Durchgang bei Round the Clock, alle drei
   * Pfeile bei 501).
   */
  setActivePlayer: (playerId: string) => void;
}

export interface GameResultProps<TConfig> {
  config: TConfig;
  events: GameEvent[];
  /** Das Ergebnis des angezeigten Spielers. */
  stats: StatsResult;
  /** Bei Mehrspieler-Sessions alle Ergebnisse, nach Spieler-ID. */
  allStats: Record<string, StatsResult>;
  players: SessionPlayer[];
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
   * Config plus gleicher Kontext ergeben immer dasselbe Ergebnis. Nur so
   * lassen sich neue Auswertungen rückwirkend auf alte Sessions anwenden.
   *
   * Bei mehreren Spielern wird einmal je Spieler aufgerufen. Das Spiel
   * filtert die Events selbst nach ctx.playerId – die Hülle tut das nicht,
   * weil manche Kennzahlen den Gegner brauchen (Cutthroat).
   */
  computeStats: (events: GameEvent[], config: TConfig, ctx: StatsContext) => StatsResult;

  leaderboards: LeaderboardDef[];
  xpFormula: (result: StatsResult) => number;

  /** Optional: Attribute für die Sammelkarte (Block 7). */
  playerCardAttributes?: PlayerCardAttributeDef[];
  /**
   * Ab wie vielen Sessions gilt die Karte als aussagekräftig? Unterhalb
   * dieser Zahl zeigt die Karte trotzdem echte Werte, aber mit dem Hinweis
   * "noch wenig Daten" (Entscheidung vom 30.10. – kein Rookie-Zustand, der
   * die Werte versteckt).
   */
  confidentAfterSessions?: number;
}

/**
 * Für Stellen, die Spiele generisch halten (Registry, Router, Listen).
 * Die Config ist dort per Definition unbekannt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any>;
