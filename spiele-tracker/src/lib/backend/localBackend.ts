import type {
  AuthUser,
  Backend,
  LoggedSession,
  NewEvent,
  NewSession,
  Profile,
  SessionResultRowInput,
} from './types';

/**
 * Backend ohne Server. Alles liegt im localStorage dieses Browsers.
 *
 * Zweck: die App ausprobieren, bevor ein Supabase-Projekt existiert — und
 * neben der Dartscheibe spielen können, auch wenn das WLAN wegbricht. Die
 * Daten verlassen das Gerät nicht und werden nicht geteilt.
 *
 * Bewusst kein IndexedDB: die Datenmengen sind winzig (ein paar hundert
 * Events pro Session), und localStorage ist synchron und damit viel leichter
 * korrekt zu halten.
 */

const PREFIX = 'spiele-tracker.local.';

interface Store {
  profiles: Profile[];
  currentUserId: string | null;
  sessions: Array<{
    id: string;
    gameId: string;
    createdBy: string;
    config: unknown;
    startedAt: string;
    endedAt: string | null;
    localStartedAt: string;
    tzOffsetMinutes: number;
    playerIds: string[];
    tags: string[];
  }>;
  events: Array<NewEvent & { id: number }>;
  results: SessionResultRowInput[];
  nextEventId: number;
}

const EMPTY: Store = {
  profiles: [],
  currentUserId: null,
  sessions: [],
  events: [],
  results: [],
  nextEventId: 1,
};

function read(): Store {
  try {
    const raw = localStorage.getItem(PREFIX + 'store');
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Store>) };
  } catch {
    // Privater Modus, volle Quota, kaputtes JSON – alles kein Grund,
    // die App nicht zu starten.
    return { ...EMPTY };
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(PREFIX + 'store', JSON.stringify(store));
  } catch {
    // Schreiben kann fehlschlagen. Die laufende Session bleibt im Speicher
    // des Stores korrekt, nur das Nachladen entfällt.
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'local-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const listeners = new Set<(user: AuthUser | null) => void>();

function notify(user: AuthUser | null) {
  for (const cb of listeners) cb(user);
}

function toAuthUser(profile: Profile | null): AuthUser | null {
  if (!profile) return null;
  return {
    id: profile.id,
    email: null,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

/** Beim ersten Start gibt es noch niemanden – also legen wir jemanden an. */
function ensureCurrentUser(store: Store): Profile {
  let me = store.profiles.find((p) => p.id === store.currentUserId);
  if (me) return me;

  me = {
    id: uuid(),
    displayName: 'Spieler 1',
    avatarUrl: null,
    bio: null,
    favoriteGame: null,
  };
  store.profiles.push(me);
  store.currentUserId = me.id;
  write(store);
  return me;
}

export const localBackend: Backend = {
  kind: 'local',

  auth: {
    async current() {
      const store = read();
      return toAuthUser(ensureCurrentUser(store));
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signInWithEmail() {
      throw new Error('Im Testmodus gibt es keine Anmeldung.');
    },

    async signInWithGoogle() {
      throw new Error('Im Testmodus gibt es keine Anmeldung.');
    },

    async signOut() {
      // Abmelden ergäbe im Testmodus keinen Sinn – es gibt nichts, wohin
      // man sich abmelden könnte. Bleibt bewusst wirkungslos.
    },
  },

  profiles: {
    async get(id) {
      return read().profiles.find((p) => p.id === id) ?? null;
    },

    async ensure(id, fallbackName) {
      const store = read();
      let profile = store.profiles.find((p) => p.id === id);
      if (!profile) {
        profile = {
          id,
          displayName: fallbackName,
          avatarUrl: null,
          bio: null,
          favoriteGame: null,
        };
        store.profiles.push(profile);
        write(store);
      }
      return profile;
    },

    async update(id, patch) {
      const store = read();
      const profile = store.profiles.find((p) => p.id === id);
      if (!profile) throw new Error('Profil nicht gefunden.');
      Object.assign(profile, patch);
      write(store);
      if (id === store.currentUserId) notify(toAuthUser(profile));
      return profile;
    },

    async list() {
      const store = read();
      ensureCurrentUser(store);
      return [...read().profiles].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'de'),
      );
    },

    async createLocal(displayName) {
      const store = read();
      const profile: Profile = {
        id: uuid(),
        displayName: displayName.trim().slice(0, 40) || 'Spieler',
        avatarUrl: null,
        bio: null,
        favoriteGame: null,
      };
      store.profiles.push(profile);
      write(store);
      return profile;
    },
  },

  sessions: {
    async create(input: NewSession) {
      const store = read();
      const id = uuid();
      store.sessions.push({
        id,
        gameId: input.gameId,
        createdBy: input.createdBy,
        config: input.config,
        startedAt: input.startedAt,
        endedAt: null,
        localStartedAt: input.localStartedAt,
        tzOffsetMinutes: input.tzOffsetMinutes,
        playerIds: [],
        tags: [],
      });
      write(store);
      return id;
    },

    async addPlayers(sessionId, playerIds) {
      const store = read();
      const session = store.sessions.find((s) => s.id === sessionId);
      if (session) session.playerIds = playerIds;
      write(store);
    },

    async addTags(sessionId, tags) {
      const store = read();
      const session = store.sessions.find((s) => s.id === sessionId);
      if (session) session.tags = tags;
      write(store);
    },

    async finish(sessionId) {
      const store = read();
      const session = store.sessions.find((s) => s.id === sessionId);
      if (session) session.endedAt = new Date().toISOString();
      write(store);
    },

    async saveResults(rows) {
      const store = read();
      for (const row of rows) {
        const i = store.results.findIndex(
          (r) => r.sessionId === row.sessionId && r.playerId === row.playerId,
        );
        if (i >= 0) store.results[i] = row;
        else store.results.push(row);
      }
      write(store);
    },

    async recentTags(limit) {
      const store = read();
      const seen = new Map<string, string>();
      for (const session of [...store.sessions].reverse()) {
        for (const tag of session.tags) {
          if (!seen.has(tag)) seen.set(tag, session.startedAt);
        }
      }
      return [...seen.keys()].slice(0, limit);
    },

    async listRecent(limit): Promise<LoggedSession[]> {
      const store = read();
      return [...store.sessions]
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
        .slice(0, limit)
        .map((s) => ({
          id: s.id,
          gameId: s.gameId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          tags: s.tags,
          playerIds: s.playerIds,
        }));
    },
  },

  events: {
    async append(rows) {
      const store = read();
      const ids: number[] = [];
      for (const row of rows) {
        const id = store.nextEventId++;
        store.events.push({ ...row, id });
        ids.push(id);
      }
      write(store);
      return ids;
    },
  },
};

/** Löscht alle lokalen Testdaten. Nur im Testmodus angeboten. */
export function clearLocalData(): void {
  try {
    localStorage.removeItem(PREFIX + 'store');
  } catch {
    // nichts zu tun
  }
}
