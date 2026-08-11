import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';

interface AuthState {
  /** null = abgemeldet, undefined = noch nicht geprüft */
  session: Session | null | undefined;
  user: User | null;
  profile: ProfileRow | null;
  profileLoading: boolean;
  error: string | null;

  init: () => () => void;
  loadProfile: () => Promise<void>;
  updateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: undefined,
  user: null,
  profile: null,
  profileLoading: false,
  error: null,

  /**
   * Einmal beim App-Start aufrufen. Liefert die Aufräumfunktion für den
   * Auth-Listener zurück.
   */
  init: () => {
    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session ?? null, user: data.session?.user ?? null });
      if (data.session) void get().loadProfile();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session: session ?? null, user: session?.user ?? null });
      if (session) {
        void get().loadProfile();
      } else {
        set({ profile: null });
      }
    });

    return () => sub.subscription.unsubscribe();
  },

  loadProfile: async () => {
    const userId = get().user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;

    set({ profileLoading: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      set({ error: error.message, profileLoading: false });
      return;
    }

    // Der Datenbank-Trigger legt das Profil an. Falls es doch fehlt (z.B. bei
    // einem vor der Migration angelegten Account), holen wir das hier nach.
    if (!data) {
      const fallbackName =
        (get().user?.user_metadata?.full_name as string | undefined) ??
        get().user?.email?.split('@')[0] ??
        'Spieler';
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, display_name: fallbackName })
        .select()
        .single();
      set({
        profile: created ?? null,
        error: insertError?.message ?? null,
        profileLoading: false,
      });
      return;
    }

    set({ profile: data, profileLoading: false, error: null });
  },

  updateProfile: async (patch) => {
    const userId = get().user?.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ profile: data, error: null });
  },

  signInWithEmail: async (email) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) set({ error: error.message });
  },

  signInWithGoogle: async () => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) set({ error: error.message });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },
}));
