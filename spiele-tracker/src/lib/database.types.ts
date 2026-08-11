/**
 * Handgeschriebene Typen zum Schema aus supabase/migrations/.
 *
 * Sobald ein echtes Projekt existiert, lässt sich diese Datei generieren:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 * Bis dahin ist sie die Referenz – wer eine Migration ändert, ändert sie hier mit.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type GroupRole = 'owner' | 'admin' | 'member';
export type SessionStatus = 'setup' | 'running' | 'finished' | 'aborted';
export type EventSourceDb =
  | 'speech'
  | 'tap'
  | 'quick'
  | 'system'
  | 'manual'
  | 'transcription'
  | 'external';
export type ShopItemKind = 'avatar_frame' | 'board_theme' | 'card_design' | 'sound_pack';
export type InviteResponse = 'yes' | 'maybe' | 'no';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  favorite_game: string | null;
  created_at: string;
  updated_at: string;
}

export type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GroupMemberRow = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export type GameSessionRow = {
  id: string;
  game_id: string;
  group_id: string | null;
  created_by: string;
  config: Json;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  local_started_at: string | null;
  tz_offset_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export type GameEventRow = {
  id: number;
  session_id: string;
  player_id: string | null;
  t_ms: number;
  type: string;
  payload: Json;
  source: EventSourceDb;
  corrects_event_id: number | null;
  voids_target: boolean;
  client_seq: number | null;
  created_at: string;
}

export type SessionResultRow = {
  session_id: string;
  player_id: string;
  stats: Json;
  xp_awarded: number;
  coins_awarded: number;
  stats_version: number;
  computed_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Json;
  read_at: string | null;
  created_at: string;
}

type Table<TRow, TInsert = Partial<TRow>, TUpdate = Partial<TRow>> = {
  Row: TRow;
  Insert: TInsert;
  Update: TUpdate;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, 'id' | 'display_name'> & Partial<ProfileRow>
      >;
      groups: Table<GroupRow>;
      group_members: Table<GroupMemberRow>;
      game_sessions: Table<
        GameSessionRow,
        Pick<GameSessionRow, 'game_id' | 'created_by'> & Partial<GameSessionRow>
      >;
      session_players: Table<{ session_id: string; player_id: string; seat: number }>;
      session_tags: Table<{ session_id: string; tag: string }>;
      game_events: Table<
        GameEventRow,
        Pick<GameEventRow, 'session_id' | 't_ms' | 'type'> & Partial<GameEventRow>
      >;
      session_results: Table<
        SessionResultRow,
        Pick<SessionResultRow, 'session_id' | 'player_id'> & Partial<SessionResultRow>
      >;
      personal_bests: Table<{
        user_id: string;
        game_id: string;
        metric: string;
        value: number;
        session_id: string | null;
        achieved_at: string;
      }>;
      player_economy: Table<{
        user_id: string;
        xp: number;
        level: number;
        coins: number;
        updated_at: string;
      }>;
      economy_ledger: Table<{
        id: number;
        user_id: string;
        kind: 'xp' | 'coins';
        delta: number;
        reason: string;
        session_id: string | null;
        ref: string | null;
        created_at: string;
      }>;
      achievements: Table<{
        id: string;
        game_id: string | null;
        name: string;
        description: string;
        icon: string | null;
        rule: Json;
        xp_reward: number;
        coin_reward: number;
        secret: boolean;
        active: boolean;
        sort_order: number;
      }>;
      player_achievements: Table<{
        user_id: string;
        achievement_id: string;
        unlocked_at: string;
        session_id: string | null;
        progress: Json;
      }>;
      shop_items: Table<{
        id: string;
        kind: ShopItemKind;
        name: string;
        description: string | null;
        price_coins: number;
        payload: Json;
        min_level: number;
        active: boolean;
        sort_order: number;
      }>;
      player_inventory: Table<{ user_id: string; item_id: string; acquired_at: string }>;
      player_loadout: Table<{ user_id: string; kind: ShopItemKind; item_id: string }>;
      notifications: Table<NotificationRow>;
      play_invites: Table<{
        id: string;
        group_id: string;
        created_by: string;
        game_id: string | null;
        message: string | null;
        starts_at: string | null;
        expires_at: string;
        created_at: string;
      }>;
      play_invite_responses: Table<{
        invite_id: string;
        user_id: string;
        response: InviteResponse;
        responded_at: string;
      }>;
    };
    Views: {
      game_events_effective: {
        Row: Omit<GameEventRow, 'voids_target'>;
        Relationships: [];
      };
    };
    Functions: {
      create_group: { Args: { p_name: string }; Returns: GroupRow };
      join_group_by_code: { Args: { p_code: string }; Returns: GroupRow };
      recent_tags: {
        Args: { p_limit?: number };
        Returns: { tag: string; last_used: string; uses: number }[];
      };
      purchase_item: {
        Args: { p_item_id: string };
        Returns: { user_id: string; item_id: string; acquired_at: string };
      };
      create_play_invite: {
        Args: {
          p_group_id: string;
          p_game_id?: string | null;
          p_message?: string | null;
          p_starts_at?: string | null;
        };
        Returns: {
          id: string;
          group_id: string;
          created_by: string;
          game_id: string | null;
          message: string | null;
          starts_at: string | null;
          expires_at: string;
          created_at: string;
        };
      };
    };
    Enums: {
      group_role: GroupRole;
      session_status: SessionStatus;
      event_source: EventSourceDb;
      shop_item_kind: ShopItemKind;
      invite_response: InviteResponse;
    };
    CompositeTypes: Record<string, never>;
  };
}
