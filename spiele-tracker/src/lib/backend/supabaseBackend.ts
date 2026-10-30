import { supabase } from '@/lib/supabase';
import type {
  AuthUser,
  Backend,
  LoggedSession,
  NewEvent,
  NewSession,
  Profile,
  SessionResultRowInput,
} from './types';
import type { Json, ProfileRow } from '@/lib/database.types';

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    favoriteGame: row.favorite_game,
  };
}

export const supabaseBackend: Backend = {
  kind: 'supabase',

  auth: {
    async current(): Promise<AuthUser | null> {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      return {
        id: user.id,
        email: user.email ?? null,
        displayName:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      };
    },

    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        cb(
          user
            ? {
                id: user.id,
                email: user.email ?? null,
                displayName:
                  (user.user_metadata?.full_name as string | undefined) ??
                  (user.user_metadata?.name as string | undefined) ??
                  null,
                avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
              }
            : null,
        );
      });
      return () => data.subscription.unsubscribe();
    },

    async signInWithEmail(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/#/auth/callback` },
      });
      if (error) throw new Error(error.message);
    },

    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/#/auth/callback` },
      });
      if (error) throw new Error(error.message);
    },

    async signOut() {
      await supabase.auth.signOut();
    },
  },

  profiles: {
    async get(id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
      return data ? toProfile(data) : null;
    },

    async ensure(id, fallbackName) {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
      if (data) return toProfile(data);

      // Normalerweise legt der Datenbank-Trigger das Profil an. Das hier ist
      // der Notnagel für Accounts, die es vor der Migration schon gab.
      const { data: created, error } = await supabase
        .from('profiles')
        .insert({ id, display_name: fallbackName })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message ?? 'Profil konnte nicht angelegt werden.');
      return toProfile(created);
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: patch.displayName,
          avatar_url: patch.avatarUrl,
          bio: patch.bio,
          favorite_game: patch.favoriteGame,
        })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Profil konnte nicht gespeichert werden.');
      return toProfile(data);
    },

    async list() {
      // Welche Profile zurückkommen, entscheidet die RLS-Policy: das eigene
      // plus alle, mit denen man eine Gruppe teilt.
      const { data } = await supabase.from('profiles').select('*').order('display_name');
      return (data ?? []).map(toProfile);
    },
  },

  sessions: {
    async create(input: NewSession) {
      const { data, error } = await supabase
        .from('game_sessions')
        .insert({
          game_id: input.gameId,
          group_id: input.groupId,
          created_by: input.createdBy,
          config: input.config as Json,
          status: 'running',
          started_at: input.startedAt,
          local_started_at: input.localStartedAt,
          tz_offset_minutes: input.tzOffsetMinutes,
        })
        .select()
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Session konnte nicht angelegt werden.');
      return data.id;
    },

    async addPlayers(sessionId, playerIds) {
      const { error } = await supabase
        .from('session_players')
        .insert(playerIds.map((id, seat) => ({ session_id: sessionId, player_id: id, seat })));
      if (error) throw new Error(error.message);
    },

    async addTags(sessionId, tags) {
      if (tags.length === 0) return;
      await supabase.from('session_tags').insert(tags.map((tag) => ({ session_id: sessionId, tag })));
    },

    async finish(sessionId) {
      await supabase
        .from('game_sessions')
        .update({ status: 'finished', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    },

    async saveResults(rows: SessionResultRowInput[]) {
      if (rows.length === 0) return;
      await supabase.from('session_results').upsert(
        rows.map((r) => ({
          session_id: r.sessionId,
          player_id: r.playerId,
          stats: r.stats as Json,
          stats_version: r.statsVersion,
          computed_at: new Date().toISOString(),
        })),
      );
    },

    async recentTags(limit) {
      const { data } = await supabase.rpc('recent_tags', { p_limit: limit });
      return (data ?? []).map((row) => row.tag);
    },

    async listRecent(limit): Promise<LoggedSession[]> {
      const { data } = await supabase
        .from('game_sessions')
        .select('id, game_id, started_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(limit);
      return (data ?? []).map((row) => ({
        id: row.id,
        gameId: row.game_id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        tags: [],
        playerIds: [],
      }));
    },
  },

  events: {
    async append(rows: NewEvent[]) {
      const { data, error } = await supabase
        .from('game_events')
        .insert(
          rows.map((e) => ({
            session_id: e.sessionId,
            player_id: e.playerId,
            t_ms: e.tMs,
            type: e.type,
            payload: e.payload as Json,
            source: e.source as never,
            corrects_event_id: e.correctsEventId,
            voids_target: e.voidsTarget,
            client_seq: e.clientSeq,
          })),
        )
        .select('id');
      if (error || !data) throw new Error(error?.message ?? 'Events konnten nicht geschrieben werden.');
      return data.map((row) => row.id);
    },
  },
};
