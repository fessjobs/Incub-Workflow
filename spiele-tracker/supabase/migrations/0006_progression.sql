-- 0006_progression.sql
-- Level, Coins, Achievements, Shop. Rein kosmetische Ökonomie, kein Echtgeld.

create table if not exists public.player_economy (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  xp         integer not null default 0 check (xp >= 0),
  level      integer not null default 1 check (level >= 1),
  coins      integer not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists player_economy_set_updated_at on public.player_economy;
create trigger player_economy_set_updated_at
  before update on public.player_economy
  for each row execute function public.set_updated_at();

-- Append-only Buchungen. Der Kontostand in player_economy ist eine
-- Projektion daraus und jederzeit nachrechenbar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_kind') then
    create type public.ledger_kind as enum ('xp', 'coins');
  end if;
end
$$;

create table if not exists public.economy_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.ledger_kind not null,
  delta      integer not null,
  reason     text not null,                  -- 'session', 'achievement', 'purchase', ...
  session_id uuid references public.game_sessions (id) on delete set null,
  ref        text,                           -- achievement_id / shop_item_id
  created_at timestamptz not null default now()
);

create index if not exists economy_ledger_user_idx on public.economy_ledger (user_id, created_at desc);

-- Deklarative Achievement-Regeln: neue Achievements entstehen als Datensatz,
-- nicht als Code. Die Rule-JSON wird vom generischen Evaluator gelesen
-- (siehe src/features/achievements/evaluate.ts).
create table if not exists public.achievements (
  id           text primary key,
  game_id      text,                          -- null = spielübergreifend
  name         text not null,
  description  text not null,
  icon         text,
  rule         jsonb not null,                -- { metric, op, value, scope, window }
  xp_reward    integer not null default 0,
  coin_reward  integer not null default 0,
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

-- Shop: ausschließlich Kosmetik.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shop_item_kind') then
    create type public.shop_item_kind as enum (
      'avatar_frame', 'board_theme', 'card_design', 'sound_pack'
    );
  end if;
end
$$;

create table if not exists public.shop_items (
  id          text primary key,
  kind        public.shop_item_kind not null,
  name        text not null,
  description text,
  price_coins integer not null check (price_coins >= 0),
  payload     jsonb not null default '{}'::jsonb,   -- Farben, Asset-Keys etc.
  min_level   integer not null default 1,
  active      boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists public.player_inventory (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null references public.shop_items (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Was ist gerade ausgerüstet – maximal ein Item je Kategorie.
create table if not exists public.player_loadout (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind    public.shop_item_kind not null,
  item_id text not null references public.shop_items (id) on delete cascade,
  primary key (user_id, kind)
);

-- Kauf als Transaktion: Coins prüfen, abbuchen, Inventar füllen, Beleg
-- schreiben. Läuft serverseitig, damit der Client den Preis nicht umgehen kann.
create or replace function public.purchase_item(p_item_id text)
returns public.player_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_item  public.shop_items;
  v_econ  public.player_economy;
  v_row   public.player_inventory;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_item from public.shop_items where id = p_item_id and active;
  if v_item.id is null then
    raise exception 'item not available' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.player_inventory where user_id = v_user and item_id = p_item_id) then
    raise exception 'already owned' using errcode = 'P0001';
  end if;

  -- Zeile sperren, damit parallele Käufe den Kontostand nicht überziehen.
  select * into v_econ from public.player_economy where user_id = v_user for update;
  if v_econ.user_id is null then
    insert into public.player_economy (user_id) values (v_user) returning * into v_econ;
  end if;

  if v_econ.level < v_item.min_level then
    raise exception 'level too low' using errcode = 'P0001';
  end if;

  if v_econ.coins < v_item.price_coins then
    raise exception 'not enough coins' using errcode = 'P0001';
  end if;

  update public.player_economy
     set coins = coins - v_item.price_coins
   where user_id = v_user;

  insert into public.economy_ledger (user_id, kind, delta, reason, ref)
  values (v_user, 'coins', -v_item.price_coins, 'purchase', v_item.id);

  insert into public.player_inventory (user_id, item_id)
  values (v_user, v_item.id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.purchase_item(text) from public;
grant execute on function public.purchase_item(text) to authenticated;
