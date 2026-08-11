-- 0003_groups.sql
-- Gruppen und Mitgliedschaften. Alle Ranglisten sind gruppenbezogen.

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  -- Nullable mit set null: wer die Gruppe gegründet hat, darf seinen Account
  -- löschen, ohne die Gruppe der anderen mitzunehmen.
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_role') then
    create type public.group_role as enum ('owner', 'admin', 'member');
  end if;
end
$$;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);
