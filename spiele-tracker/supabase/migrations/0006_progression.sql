-- 0006_progression.sql
-- Level und XP. Kein Shop, keine Coins, keine Kosmetik.
--
-- Entscheidung vom 30.10.: XP und Level ja, Shop nein. XP ist hier eine
-- Fortschrittsanzeige, keine Währung — es gibt bewusst nichts auszugeben.
-- Falls später doch ein Shop kommen soll, ist das eine eigene Migration;
-- hier steht absichtlich kein totes Schema herum.

create table if not exists public.player_economy (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  xp         integer not null default 0 check (xp >= 0),
  level      integer not null default 1 check (level >= 1),
  updated_at timestamptz not null default now()
);

drop trigger if exists player_economy_set_updated_at on public.player_economy;
create trigger player_economy_set_updated_at
  before update on public.player_economy
  for each row execute function public.set_updated_at();

-- Append-only Buchungen. Der Stand in player_economy ist eine Projektion
-- daraus und jederzeit nachrechenbar.
create table if not exists public.xp_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  delta      integer not null,
  reason     text not null,                  -- 'session', 'achievement', ...
  session_id uuid references public.game_sessions (id) on delete set null,
  ref        text,                           -- achievement_id
  created_at timestamptz not null default now()
);

create index if not exists xp_ledger_user_idx on public.xp_ledger (user_id, created_at desc);

-- Deklarative Achievement-Regeln: neue Achievements entstehen als Datensatz,
-- nicht als Code. Die Rule-JSON liest der generische Evaluator
-- (siehe src/features/achievements/evaluate.ts).
create table if not exists public.achievements (
  id           text primary key,
  game_id      text,                          -- null = spielübergreifend
  name         text not null,
  description  text not null,
  icon         text,
  rule         jsonb not null,                -- { scope, metric, op, value, gameId }
  xp_reward    integer not null default 0,
  secret       boolean not null default false,
  active       boolean not null default true,
  sort_order   integer not null default 0
);

create table if not exists public.player_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  session_id     uuid references public.game_sessions (id) on delete set null,
  progress       jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id)
);
