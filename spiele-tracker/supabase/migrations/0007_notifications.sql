-- 0007_notifications.sql
-- In-App-Benachrichtigungscenter (Supabase Realtime) und Spielaufrufe.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,           -- 'record_broken', 'play_invite', 'achievement', ...
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- "Wer hat Bock?" – ein Aufruf an alle Mitglieder einer Gruppe.
create table if not exists public.play_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  game_id    text,
  message    text check (message is null or char_length(message) <= 200),
  starts_at  timestamptz,
  expires_at timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now()
);

create index if not exists play_invites_group_idx on public.play_invites (group_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invite_response') then
    create type public.invite_response as enum ('yes', 'maybe', 'no');
  end if;
end
$$;

create table if not exists public.play_invite_responses (
  invite_id    uuid not null references public.play_invites (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  response     public.invite_response not null,
  responded_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

-- Aufruf anlegen und allen anderen Gruppenmitgliedern eine Notification
-- zustellen. SECURITY DEFINER, weil ein Nutzer sonst nicht in fremde
-- notifications-Zeilen schreiben dürfte.
create or replace function public.create_play_invite(
  p_group_id uuid,
  p_game_id  text default null,
  p_message  text default null,
  p_starts_at timestamptz default null
)
returns public.play_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.play_invites;
  v_name   text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  insert into public.play_invites (group_id, created_by, game_id, message, starts_at)
  values (p_group_id, auth.uid(), p_game_id, p_message, p_starts_at)
  returning * into v_invite;

  select display_name into v_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, data)
  select gm.user_id,
         'play_invite',
         coalesce(v_name, 'Jemand') || ' will spielen',
         p_message,
         jsonb_build_object(
           'invite_id', v_invite.id,
           'group_id', p_group_id,
           'game_id', p_game_id
         )
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id <> auth.uid();

  return v_invite;
end;
$$;

revoke all on function public.create_play_invite(uuid, text, text, timestamptz) from public;
grant execute on function public.create_play_invite(uuid, text, text, timestamptz) to authenticated;

-- Realtime-Publikation. add table ist nicht idempotent, deshalb der Check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'play_invite_responses'
  ) then
    alter publication supabase_realtime add table public.play_invite_responses;
  end if;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime existiert nicht – übersprungen.';
end
$$;
