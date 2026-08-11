-- 0008_rls_policies.sql
-- Row Level Security für alle Tabellen.
--
-- Zwei Grundsätze:
--   1. Jede Tabelle hat RLS an. Ohne passende Policy ist der Zugriff verboten.
--   2. game_events, economy_ledger und player_achievements bekommen bewusst
--      KEINE update-/delete-Policy. Damit sind sie für Clients append-only.
--      Korrekturen entstehen als neue Zeile mit corrects_event_id.

alter table public.profiles              enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.game_sessions         enable row level security;
alter table public.session_players       enable row level security;
alter table public.session_tags          enable row level security;
alter table public.game_events           enable row level security;
alter table public.session_results       enable row level security;
alter table public.personal_bests        enable row level security;
alter table public.player_economy        enable row level security;
alter table public.economy_ledger        enable row level security;
alter table public.achievements          enable row level security;
alter table public.player_achievements   enable row level security;
alter table public.shop_items            enable row level security;
alter table public.player_inventory      enable row level security;
alter table public.player_loadout        enable row level security;
alter table public.notifications         enable row level security;
alter table public.play_invites          enable row level security;
alter table public.play_invite_responses enable row level security;

-- ---------------------------------------------------------------- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------------ groups
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id));

-- Anlegen läuft normalerweise über public.create_group(). Die Policy erlaubt
-- den direkten Weg zusätzlich, aber nur für sich selbst als Ersteller.
drop policy if exists groups_insert_own on public.groups;
create policy groups_insert_own on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists groups_update_admin on public.groups;
create policy groups_update_admin on public.groups
  for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

-- Über die Rolle, nicht über created_by: das Feld wird null, wenn der
-- Gründer seinen Account löscht.
drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- ----------------------------------------------------------- group_members
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));

-- Sich selbst eintragen darf man, wenn man die Gruppe angelegt hat.
-- Der reguläre Beitritt läuft über public.join_group_by_code().
drop policy if exists group_members_insert_self on public.group_members;
create policy group_members_insert_self on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

drop policy if exists group_members_update_admin on public.group_members;
create policy group_members_update_admin on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Austreten darf jeder selbst, rauswerfen dürfen Admins.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- ----------------------------------------------------------- game_sessions
drop policy if exists game_sessions_select on public.game_sessions;
create policy game_sessions_select on public.game_sessions
  for select to authenticated
  using (
    created_by = auth.uid()
    or (group_id is not null and public.is_group_member(group_id))
    or exists (
      select 1 from public.session_players sp
      where sp.session_id = id and sp.player_id = auth.uid()
    )
  );

drop policy if exists game_sessions_insert on public.game_sessions;
create policy game_sessions_insert on public.game_sessions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy if exists game_sessions_update_owner on public.game_sessions;
create policy game_sessions_update_owner on public.game_sessions
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists game_sessions_delete_owner on public.game_sessions;
create policy game_sessions_delete_owner on public.game_sessions
  for delete to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------- session_players
drop policy if exists session_players_select on public.session_players;
create policy session_players_select on public.session_players
  for select to authenticated
  using (public.can_read_session(session_id));

drop policy if exists session_players_insert on public.session_players;
create policy session_players_insert on public.session_players
  for insert to authenticated
  with check (
    player_id = auth.uid()
    or exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

drop policy if exists session_players_delete on public.session_players;
create policy session_players_delete on public.session_players
  for delete to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------- session_tags
drop policy if exists session_tags_select on public.session_tags;
create policy session_tags_select on public.session_tags
  for select to authenticated
  using (public.can_read_session(session_id));

drop policy if exists session_tags_write on public.session_tags;
create policy session_tags_write on public.session_tags
  for insert to authenticated
  with check (public.can_write_session(session_id));

drop policy if exists session_tags_delete on public.session_tags;
create policy session_tags_delete on public.session_tags
  for delete to authenticated
  using (public.can_write_session(session_id));

-- -------------------------------------------------------------- game_events
-- Nur select und insert. Kein update, kein delete: das Log ist append-only.
drop policy if exists game_events_select on public.game_events;
create policy game_events_select on public.game_events
  for select to authenticated
  using (public.can_read_session(session_id));

drop policy if exists game_events_insert on public.game_events;
create policy game_events_insert on public.game_events
  for insert to authenticated
  with check (public.can_write_session(session_id));

-- ---------------------------------------------------------- session_results
drop policy if exists session_results_select on public.session_results;
create policy session_results_select on public.session_results
  for select to authenticated
  using (public.can_read_session(session_id));

-- Der Cache wird vom Client nach Sessionende geschrieben und darf beim
-- Nachrechnen (neue stats_version) überschrieben werden.
drop policy if exists session_results_insert on public.session_results;
create policy session_results_insert on public.session_results
  for insert to authenticated
  with check (public.can_write_session(session_id));

drop policy if exists session_results_update on public.session_results;
create policy session_results_update on public.session_results
  for update to authenticated
  using (public.can_write_session(session_id))
  with check (public.can_write_session(session_id));

-- ---------------------------------------------------------- personal_bests
drop policy if exists personal_bests_select on public.personal_bests;
create policy personal_bests_select on public.personal_bests
  for select to authenticated
  using (user_id = auth.uid() or public.shares_group_with(user_id));

drop policy if exists personal_bests_upsert on public.personal_bests;
create policy personal_bests_upsert on public.personal_bests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists personal_bests_update on public.personal_bests;
create policy personal_bests_update on public.personal_bests
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------- player_economy
drop policy if exists player_economy_select on public.player_economy;
create policy player_economy_select on public.player_economy
  for select to authenticated
  using (user_id = auth.uid() or public.shares_group_with(user_id));

drop policy if exists player_economy_insert_self on public.player_economy;
create policy player_economy_insert_self on public.player_economy
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists player_economy_update_self on public.player_economy;
create policy player_economy_update_self on public.player_economy
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --------------------------------------------------------- economy_ledger
-- Append-only, nur eigene Buchungen sichtbar.
drop policy if exists economy_ledger_select on public.economy_ledger;
create policy economy_ledger_select on public.economy_ledger
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists economy_ledger_insert on public.economy_ledger;
create policy economy_ledger_insert on public.economy_ledger
  for insert to authenticated
  with check (user_id = auth.uid());

-- ------------------------------------------------------------ achievements
-- Regelkatalog ist für alle Angemeldeten lesbar, schreiben nur per Migration
-- oder service_role (der RLS ohnehin umgeht).
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated
  using (active);

drop policy if exists player_achievements_select on public.player_achievements;
create policy player_achievements_select on public.player_achievements
  for select to authenticated
  using (user_id = auth.uid() or public.shares_group_with(user_id));

drop policy if exists player_achievements_insert on public.player_achievements;
create policy player_achievements_insert on public.player_achievements
  for insert to authenticated
  with check (user_id = auth.uid());

-- --------------------------------------------------------------- shop
drop policy if exists shop_items_select on public.shop_items;
create policy shop_items_select on public.shop_items
  for select to authenticated
  using (active);

-- Kein insert-Policy: Inventar füllt ausschließlich public.purchase_item().
drop policy if exists player_inventory_select on public.player_inventory;
create policy player_inventory_select on public.player_inventory
  for select to authenticated
  using (user_id = auth.uid() or public.shares_group_with(user_id));

drop policy if exists player_loadout_select on public.player_loadout;
create policy player_loadout_select on public.player_loadout
  for select to authenticated
  using (user_id = auth.uid() or public.shares_group_with(user_id));

-- Ausrüsten darf man nur, was man besitzt.
drop policy if exists player_loadout_insert on public.player_loadout;
create policy player_loadout_insert on public.player_loadout
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.player_inventory pi
      where pi.user_id = auth.uid() and pi.item_id = player_loadout.item_id
    )
  );

drop policy if exists player_loadout_update on public.player_loadout;
create policy player_loadout_update on public.player_loadout
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.player_inventory pi
      where pi.user_id = auth.uid() and pi.item_id = player_loadout.item_id
    )
  );

drop policy if exists player_loadout_delete on public.player_loadout;
create policy player_loadout_delete on public.player_loadout
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------ notifications
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Als gelesen markieren. Kein insert-Policy: Benachrichtigungen entstehen
-- serverseitig (SECURITY DEFINER / Trigger), damit niemand fremden Nutzern
-- beliebige Meldungen schicken kann.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------ play_invites
drop policy if exists play_invites_select on public.play_invites;
create policy play_invites_select on public.play_invites
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists play_invite_responses_select on public.play_invite_responses;
create policy play_invite_responses_select on public.play_invite_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.play_invites pi
      where pi.id = invite_id and public.is_group_member(pi.group_id)
    )
  );

drop policy if exists play_invite_responses_upsert on public.play_invite_responses;
create policy play_invite_responses_upsert on public.play_invite_responses
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.play_invites pi
      where pi.id = invite_id and public.is_group_member(pi.group_id)
    )
  );

drop policy if exists play_invite_responses_update on public.play_invite_responses;
create policy play_invite_responses_update on public.play_invite_responses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Die View erbt keine RLS von sich aus; security_invoker sorgt dafür, dass
-- die Policies der Basistabelle greifen (Postgres 15+, Supabase-Standard).
alter view public.game_events_effective set (security_invoker = on);
