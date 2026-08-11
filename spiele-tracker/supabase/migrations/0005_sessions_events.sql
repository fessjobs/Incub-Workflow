-- 0005_sessions_events.sql
-- Sessions, Teilnehmer, Tags und das append-only Event-Log.
--
-- Grundsatz: game_events ist die einzige Wahrheit. Jede Statistik wird aus dem
-- Log berechnet, nie aus aggregierten Feldern. Damit lassen sich neue
-- Auswertungen rückwirkend auf alte Sessions anwenden.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('setup', 'running', 'finished', 'aborted');
  end if;
end
$$;

create table if not exists public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null,                    -- Registry-Key, z.B. 'dart-clock'
  group_id    uuid references public.groups (id) on delete set null,
  -- Cascade: löscht jemand seinen Account, verschwinden auch seine Sessions
  -- samt Event-Log. Das ist die datenschutzfreundlichere Variante und hält
  -- die Policies einfach (created_by bleibt not null).
  created_by  uuid not null references public.profiles (id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,   -- validiert gegen configSchema des Spiels
  status      public.session_status not null default 'setup',
  started_at  timestamptz,                      -- t_ms = 0 entspricht diesem Zeitpunkt
  ended_at    timestamptz,
  -- Lokale Startzeit des Spielers inkl. Offset. Nötig für die
  -- Tageszeit-Auswertung, die nicht in UTC rechnen darf.
  local_started_at    timestamp,
  tz_offset_minutes   int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists game_sessions_game_idx     on public.game_sessions (game_id, started_at desc);
create index if not exists game_sessions_group_idx    on public.game_sessions (group_id, started_at desc);
create index if not exists game_sessions_creator_idx  on public.game_sessions (created_by, started_at desc);

drop trigger if exists game_sessions_set_updated_at on public.game_sessions;
create trigger game_sessions_set_updated_at
  before update on public.game_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.session_players (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  seat       smallint not null default 0,
  primary key (session_id, player_id)
);

create index if not exists session_players_player_idx on public.session_players (player_id);

-- Frei vergebene Tags, normalisiert. Keine fest verdrahteten Kategorien: die
-- Auswertung vergleicht später generisch Sessions mit und ohne einen Tag.
create table if not exists public.session_tags (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  tag        text not null check (char_length(tag) between 1 and 32),
  primary key (session_id, tag)
);

create index if not exists session_tags_tag_idx on public.session_tags (tag);

-- Woher kam ein Event? Entscheidet u.a., ob Abweichungsdaten vorliegen.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_source') then
    create type public.event_source as enum (
      'speech',       -- Web Speech API
      'tap',          -- SVG-Dartboard
      'quick',        -- Treffer/Daneben-Modus, ohne Abweichungsdaten
      'system',       -- von der App erzeugt (Rundenwechsel, Timer)
      'manual',       -- händische Korrektur im UI
      'transcription',-- nachträgliche Whisper-Korrektur
      'external'      -- externes Erkennungssystem, z.B. Autodarts
    );
  end if;
end
$$;

create table if not exists public.game_events (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  player_id   uuid references public.profiles (id) on delete set null,
  t_ms        integer not null check (t_ms >= 0),  -- ms seit Spielstart
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  source      public.event_source not null default 'system',
  -- Korrekturen überschreiben nichts, sie hängen ein neues Event an, das auf
  -- das alte zeigt. So bleibt das Log append-only und die Historie erhalten.
  -- Das ist auch der Weg, auf dem die Whisper-Nachkorrektur Würfe ersetzt.
  corrects_event_id bigint references public.game_events (id) on delete set null,
  -- Setzt ein Korrektur-Event den Ursprungswurf komplett außer Kraft,
  -- ohne Ersatz? (z.B. versehentlich doppelt erkannter Wurf)
  voids_target boolean not null default false,
  client_seq  integer,                              -- Reihenfolge bei gleichem t_ms
  created_at  timestamptz not null default now()
);

create index if not exists game_events_session_idx  on public.game_events (session_id, t_ms, client_seq);
create index if not exists game_events_type_idx     on public.game_events (session_id, type);
create index if not exists game_events_corrects_idx on public.game_events (corrects_event_id)
  where corrects_event_id is not null;

-- Aufgelöste Sicht auf das Log: korrigierte Events fallen raus, Korrekturen
-- erben t_ms des Originals, damit Zeitstatistiken stabil bleiben. Der Client
-- kann dieselbe Auflösung lokal rechnen; die View ist für Ad-hoc-Analysen.
create or replace view public.game_events_effective as
with corrections as (
  select corrects_event_id as target_id
  from public.game_events
  where corrects_event_id is not null
)
select
  e.id,
  e.session_id,
  e.player_id,
  coalesce(orig.t_ms, e.t_ms) as t_ms,
  e.type,
  e.payload,
  e.source,
  e.corrects_event_id,
  e.client_seq,
  e.created_at
from public.game_events e
left join public.game_events orig on orig.id = e.corrects_event_id
where e.id not in (select target_id from corrections)   -- Original ersetzt
  and e.voids_target is not true;                        -- reine Streichung

-- Ergebnis-Cache. Bewusst nur Cache: alles hier ist aus game_events
-- reproduzierbar. Bei einer neuen Statistik-Version wird neu gerechnet.
create table if not exists public.session_results (
  session_id    uuid not null references public.game_sessions (id) on delete cascade,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  stats         jsonb not null default '{}'::jsonb,
  xp_awarded    integer not null default 0,
  coins_awarded integer not null default 0,
  stats_version integer not null default 1,
  computed_at   timestamptz not null default now(),
  primary key (session_id, player_id)
);

create index if not exists session_results_player_idx on public.session_results (player_id);

-- Persönliche Bestwerte je Spiel und Metrik, separat geführt, damit ein
-- Überbieten im UI hervorgehoben werden kann.
create table if not exists public.personal_bests (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null,
  metric      text not null,
  value       double precision not null,
  session_id  uuid references public.game_sessions (id) on delete set null,
  achieved_at timestamptz not null default now(),
  primary key (user_id, game_id, metric)
);

-- Jetzt erst möglich: die Session-Helfer für RLS.
create or replace function public.can_read_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and (
        s.created_by = auth.uid()
        or (s.group_id is not null and public.is_group_member(s.group_id))
        or exists (
          select 1 from public.session_players sp
          where sp.session_id = s.id and sp.player_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_write_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and (
        s.created_by = auth.uid()
        or exists (
          select 1 from public.session_players sp
          where sp.session_id = s.id and sp.player_id = auth.uid()
        )
      )
  );
$$;

-- Zuletzt verwendete Tags des Nutzers für die Schnellauswahl im Setup.
create or replace function public.recent_tags(p_limit int default 12)
returns table (tag text, last_used timestamptz, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select st.tag,
         max(s.created_at) as last_used,
         count(*)          as uses
  from public.session_tags st
  join public.game_sessions s on s.id = st.session_id
  where s.created_by = auth.uid()
  group by st.tag
  order by max(s.created_at) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.recent_tags(int) to authenticated;
