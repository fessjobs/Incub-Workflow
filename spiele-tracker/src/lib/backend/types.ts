/**
 * Die Schnittstelle zum Backend.
 *
 * Es gibt zwei Implementierungen: Supabase für den echten Betrieb und einen
 * lokalen Ersatz, der alles im Browser speichert. Der lokale springt
 * automatisch ein, wenn keine Supabase-Zugangsdaten konfiguriert sind — so
 * lässt sich die App testen, bevor überhaupt ein Projekt existiert.
 *
 * Absichtlich klein gehalten: nur die Operationen, die die App wirklich
 * braucht. Keine generische Query-Schicht, die am Ende doch wieder
 * Supabase-Semantik durchreicht.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  favoriteGame: string | null;
  /** Emoji als Ersatzbild. */
  emoji?: string | null;
  /** Spielerfarbe. */
  color?: string | null;
  /** Frei gewählter Typ, z.B. "Der Ruhige". */
  character?: string | null;
}

export interface NewSession {
  gameId: string;
  groupId: string | null;
  createdBy: string;
  config: unknown;
  startedAt: string;
  localStartedAt: string;
  tzOffsetMinutes: number;
}

export interface NewEvent {
  sessionId: string;
  playerId: string | null;
  tMs: number;
  type: string;
  payload: Record<string, unknown>;
  source: string;
  correctsEventId: number | null;
  voidsTarget: boolean;
  clientSeq: number | null;
}

export interface SessionResultRowInput {
  sessionId: string;
  playerId: string;
  stats: unknown;
  statsVersion: number;
}

export interface LoggedSession {
  id: string;
  gameId: string;
  startedAt: string | null;
  endedAt: string | null;
  tags: string[];
  playerIds: string[];
}

export interface Backend {
  /** 'local' heißt: alles bleibt in diesem Browser. */
  readonly kind: 'supabase' | 'local';

  auth: {
    current(): Promise<AuthUser | null>;
    /** Liefert die Abmeldefunktion für den Listener zurück. */
    onChange(cb: (user: AuthUser | null) => void): () => void;
    signInWithEmail(email: string): Promise<void>;
    signInWithGoogle(): Promise<void>;
    signOut(): Promise<void>;
  };

  profiles: {
    get(id: string): Promise<Profile | null>;
    ensure(id: string, fallbackName: string): Promise<Profile>;
    update(id: string, patch: Partial<Profile>): Promise<Profile>;
    /** Alle sichtbaren Profile. Bei Supabase filtert das die RLS-Policy. */
    list(): Promise<Profile[]>;
    /**
     * Nur im lokalen Modus: einen weiteren Mitspieler anlegen. Im echten
     * Betrieb meldet sich jeder selbst an (Entscheidung vom 30.10.).
     */
    createLocal?(displayName: string): Promise<Profile>;
    /** Nur im lokalen Modus: Mitspieler wieder entfernen. */
    removeLocal?(id: string): Promise<void>;
  };

  sessions: {
    create(input: NewSession): Promise<string>;
    addPlayers(sessionId: string, playerIds: string[]): Promise<void>;
    addTags(sessionId: string, tags: string[]): Promise<void>;
    finish(sessionId: string): Promise<void>;
    saveResults(rows: SessionResultRowInput[]): Promise<void>;
    recentTags(limit: number): Promise<string[]>;
    /** Fürs Logbuch. */
    listRecent(limit: number): Promise<LoggedSession[]>;
    /** Wie viele Sessions hat dieser Spieler gespielt, je Spiel aufgeschlüsselt? */
    careerFor(playerId: string): Promise<{
      sessionsPlayed: number;
      byGame: Record<string, number>;
    }>;
  };

  achievements: {
    /** Bereits freigeschaltete IDs dieses Spielers. */
    unlocked(playerId: string): Promise<string[]>;
    /** Neue Freischaltungen festhalten. */
    record(playerId: string, ids: string[]): Promise<void>;
  };

  events: {
    /** Gibt die vergebenen IDs in derselben Reihenfolge zurück. */
    append(rows: NewEvent[]): Promise<number[]>;
  };
}
