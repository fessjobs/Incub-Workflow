import { create } from 'zustand';
import { backend, testMode, type AuthUser, type Profile } from '@/lib/backend';

interface AuthState {
  /** null = abgemeldet, undefined = noch nicht geprüft */
  user: AuthUser | null | undefined;
  profile: Profile | null;
  profileLoading: boolean;
  error: string | null;
  readonly testMode: boolean;

  init: () => () => void;
  loadProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: undefined,
  profile: null,
  profileLoading: false,
  error: null,
  testMode,

  /**
   * Einmal beim App-Start aufrufen. Liefert die Aufräumfunktion für den
   * Auth-Listener zurück.
   */
  init: () => {
    void backend.auth.current().then((user) => {
      set({ user: user ?? null });
      if (user) void get().loadProfile();
    });

    return backend.auth.onChange((user) => {
      set({ user: user ?? null });
      if (user) void get().loadProfile();
      else set({ profile: null });
    });
  },

  loadProfile: async () => {
    const user = get().user;
    if (!user) return;

    set({ profileLoading: true });
    try {
      const fallbackName = user.displayName ?? user.email?.split('@')[0] ?? 'Spieler';
      const profile = await backend.profiles.ensure(user.id, fallbackName);
      set({ profile, profileLoading: false, error: null });
    } catch (e) {
      set({ error: (e as Error).message, profileLoading: false });
    }
  },

  updateProfile: async (patch) => {
    const user = get().user;
    if (!user) return;
    try {
      const profile = await backend.profiles.update(user.id, patch);
      set({ profile, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  signInWithEmail: async (email) => {
    set({ error: null });
    try {
      await backend.auth.signInWithEmail(email);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      await backend.auth.signInWithGoogle();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  signOut: async () => {
    await backend.auth.signOut();
    if (!testMode) set({ user: null, profile: null });
  },
}));
