-- 0004_helpers.sql
-- SECURITY-DEFINER-Helfer für die RLS-Policies.
--
-- Wichtig: Policies auf group_members dürfen group_members nicht direkt
-- abfragen, sonst gibt es eine Endlosrekursion. Deshalb laufen alle
-- Mitgliedschafts-Checks über diese Funktionen, die RLS umgehen.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
$$;

-- Teilt der aktuelle Nutzer mindestens eine Gruppe mit p_user_id?
-- Steuert, wessen Profile sichtbar sind.
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- Die Session-Helfer (can_read_session / can_write_session) stehen in
-- 0005_sessions_events.sql, weil sie auf Tabellen zugreifen, die es hier
-- noch nicht gibt.

-- 6-stelliger Einladungscode ohne verwechselbare Zeichen (kein 0/O, 1/I).
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  return code;
end;
$$;

-- Gruppe anlegen und den Ersteller direkt als owner eintragen.
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.groups (name, invite_code, created_by)
  values (p_name, public.generate_invite_code(), auth.uid())
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role)
  values (new_group.id, auth.uid(), 'owner');

  return new_group;
end;
$$;

-- Beitritt über Einladungscode. Läuft als SECURITY DEFINER, weil der Nutzer
-- die Gruppe vor dem Beitritt noch nicht lesen darf.
create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.groups;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into target
  from public.groups g
  where upper(g.invite_code) = upper(trim(p_code));

  if target.id is null then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return target;
end;
$$;

revoke all on function public.create_group(text) from public;
revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
