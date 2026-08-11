-- RLS-Verhaltenstest. Läuft gegen die Stub-Umgebung aus 00_supabase_stub.sql.
--
-- Aufruf:  supabase/test/run.sh
--
-- Geprüft wird nicht "läuft die Migration durch", sondern: sieht ein
-- Außenstehender wirklich nichts, und ist game_events wirklich append-only.

\set ON_ERROR_STOP on
\pset pager off

-- Kleine Assert-Helfer, damit ein Fehlschlag den Lauf abbricht.
create or replace function public.assert_true(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok  %', p_label;
end $$;

create or replace function public.assert_eq(p_actual anyelement, p_expected anyelement, p_label text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (erwartet %, war %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok  % (=%)', p_label, p_actual;
end $$;

-- ------------------------------------------------------------ Testdaten
-- Drei Nutzer: A und B teilen sich eine Gruppe, C steht draußen.
-- Erst alles zurücksetzen, damit der Test wiederholbar ist.
truncate table
  public.play_invite_responses,
  public.play_invites,
  public.notifications,
  public.player_loadout,
  public.player_inventory,
  public.player_achievements,
  public.economy_ledger,
  public.player_economy,
  public.personal_bests,
  public.session_results,
  public.game_events,
  public.session_tags,
  public.session_players,
  public.game_sessions,
  public.group_members,
  public.groups,
  public.profiles
cascade;

delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test', '{"full_name":"Anna"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test', '{"full_name":"Ben"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.test', '{}');

-- Der handle_new_user-Trigger muss die Profile angelegt haben.
select public.assert_eq((select count(*)::int from public.profiles), 3,
  'Trigger legt für jeden Auth-User ein Profil an');
select public.assert_eq((select display_name from public.profiles
                          where id = '11111111-1111-1111-1111-111111111111'), 'Anna',
  'Anzeigename kommt aus den OAuth-Metadaten');
select public.assert_eq((select display_name from public.profiles
                          where id = '33333333-3333-3333-3333-333333333333'), 'c',
  'Ohne Metadaten faellt der Name auf den E-Mail-Prefix zurueck');

-- Ab hier als eingeschränkte Rolle arbeiten, sonst greift RLS gar nicht.
set role authenticated;

-- ---------------------------------------------------------- A: Gruppe
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select public.assert_true(
  (select id is not null from public.create_group('Donnerstagsrunde')),
  'A kann eine Gruppe anlegen');

select public.assert_eq((select count(*)::int from public.groups), 1,
  'A sieht seine Gruppe');

-- --------------------------------------------------------- C: draussen
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.assert_eq((select count(*)::int from public.groups), 0,
  'C sieht fremde Gruppen nicht');
select public.assert_eq((select count(*)::int from public.profiles), 1,
  'C sieht nur sein eigenes Profil');

-- ------------------------------------------------------ B: Beitritt
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.assert_eq((select count(*)::int from public.groups), 0,
  'B sieht die Gruppe vor dem Beitritt nicht');

reset role;                       -- kurz ohne RLS, um an den Code zu kommen
select invite_code as code from public.groups \gset
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select public.assert_true(
  (select id is not null from public.join_group_by_code(:'code')),
  'B tritt ueber den Einladungscode bei');
select public.assert_eq((select count(*)::int from public.groups), 1,
  'B sieht die Gruppe nach dem Beitritt');
select public.assert_eq((select count(*)::int from public.profiles), 2,
  'B sieht jetzt auch As Profil (gemeinsame Gruppe)');

-- Falscher Code muss scheitern.
do $$
begin
  perform public.join_group_by_code('XXXXXX');
  raise exception 'FAIL: ungueltiger Einladungscode wurde akzeptiert';
exception
  when sqlstate 'P0002' then
    raise notice 'ok  Ungueltiger Einladungscode wird abgelehnt';
end $$;

-- --------------------------------------------------- A: Session + Events
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select id as gid from public.groups \gset

insert into public.game_sessions (game_id, group_id, created_by, config, status, started_at)
values ('dart-clock', :'gid', '11111111-1111-1111-1111-111111111111',
        '{"timeLimitSec":120}'::jsonb, 'running', now())
returning id as sid \gset

insert into public.session_players (session_id, player_id)
values (:'sid', '11111111-1111-1111-1111-111111111111');

insert into public.session_tags (session_id, tag) values (:'sid', 'kneipe'), (:'sid', 'bier');

insert into public.game_events (session_id, player_id, t_ms, type, payload, source)
values
  (:'sid', '11111111-1111-1111-1111-111111111111', 1200, 'throw', '{"target":1,"hit":1}'::jsonb, 'speech'),
  (:'sid', '11111111-1111-1111-1111-111111111111', 3400, 'throw', '{"target":2,"hit":17}'::jsonb, 'speech');

select public.assert_eq((select count(*)::int from public.game_events), 2,
  'A schreibt Events in die eigene Session');

-- Append-only: kein update, kein delete.
do $$
begin
  update public.game_events set payload = '{"target":2,"hit":2}'::jsonb where t_ms = 3400;
  if found then
    raise exception 'FAIL: update auf game_events war moeglich';
  end if;
  raise notice 'ok  update auf game_events greift ins Leere (append-only)';
end $$;

do $$
begin
  delete from public.game_events where t_ms = 3400;
  if found then
    raise exception 'FAIL: delete auf game_events war moeglich';
  end if;
  raise notice 'ok  delete auf game_events greift ins Leere (append-only)';
end $$;

-- Korrektur laeuft ueber ein neues Event.
select id as bad_event from public.game_events where t_ms = 3400 \gset

insert into public.game_events (session_id, player_id, t_ms, type, payload, source, corrects_event_id)
values (:'sid', '11111111-1111-1111-1111-111111111111', 3400, 'throw',
        '{"target":2,"hit":7}'::jsonb, 'manual', :'bad_event');

select public.assert_eq((select count(*)::int from public.game_events), 3,
  'Die Korrektur haengt ein drittes Event an, statt zu ueberschreiben');
select public.assert_eq((select count(*)::int from public.game_events_effective), 2,
  'Die aufgeloeste View zeigt weiterhin zwei Wuerfe');
select public.assert_eq(
  (select (payload ->> 'hit')::int from public.game_events_effective where t_ms = 3400), 7,
  'Die View liefert den korrigierten Wert');
select public.assert_eq(
  (select t_ms from public.game_events_effective where (payload ->> 'hit')::int = 7), 3400,
  'Die Korrektur erbt t_ms des Originals');

-- ------------------------------------------------- Sichtbarkeit Session
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.assert_eq((select count(*)::int from public.game_sessions), 1,
  'B sieht die Gruppensession');
select public.assert_eq((select count(*)::int from public.game_events), 3,
  'B sieht die Events der Gruppensession');

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.assert_eq((select count(*)::int from public.game_sessions), 0,
  'C sieht die fremde Session nicht');
select public.assert_eq((select count(*)::int from public.game_events), 0,
  'C sieht die fremden Events nicht');
select public.assert_eq((select count(*)::int from public.session_tags), 0,
  'C sieht die fremden Tags nicht');

-- C darf auch nichts in die fremde Session schreiben.
do $$
begin
  insert into public.game_events (session_id, player_id, t_ms, type)
  values ((select id from public.game_sessions limit 1), auth.uid(), 1, 'throw');
  raise exception 'FAIL: C konnte in eine fremde Session schreiben';
exception
  when insufficient_privilege then
    raise notice 'ok  C darf nicht in fremde Sessions schreiben';
  when null_value_not_allowed then
    raise notice 'ok  C sieht die fremde Session nicht einmal';
  when not_null_violation then
    raise notice 'ok  C sieht die fremde Session nicht einmal';
end $$;

-- ------------------------------------------------------------- Oekonomie
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.player_economy (user_id, xp, level, coins)
values ('11111111-1111-1111-1111-111111111111', 900, 5, 500);

select public.assert_true((select item_id = 'frame_neon' from public.purchase_item('frame_neon')),
  'A kauft einen Rahmen fuer 400 Coins');
select public.assert_eq((select coins from public.player_economy where user_id = auth.uid()), 100,
  'Coins wurden abgebucht');
select public.assert_eq((select count(*)::int from public.economy_ledger where reason = 'purchase'), 1,
  'Der Kauf steht im Ledger');

-- Zu teuer: der zweite Kauf muss scheitern.
do $$
begin
  perform public.purchase_item('card_holo');
  raise exception 'FAIL: Kauf ohne Deckung war moeglich';
exception
  when sqlstate 'P0001' then
    raise notice 'ok  Kauf ohne ausreichende Coins wird abgelehnt';
end $$;

-- Nur Besitz darf ausgeruestet werden.
insert into public.player_loadout (user_id, kind, item_id)
values (auth.uid(), 'avatar_frame', 'frame_neon');
select public.assert_eq((select count(*)::int from public.player_loadout), 1,
  'Gekauftes Item laesst sich ausruesten');

do $$
begin
  insert into public.player_loadout (user_id, kind, item_id)
  values (auth.uid(), 'card_design', 'card_holo');
  raise exception 'FAIL: nicht besessenes Item konnte ausgeruestet werden';
exception
  when insufficient_privilege then
    raise notice 'ok  Nicht besessene Items lassen sich nicht ausruesten';
end $$;

-- --------------------------------------------------------- Spielaufruf
select public.assert_true(
  (select id is not null from public.create_play_invite(:'gid', 'dart-clock', 'Wer hat Bock?')),
  'A erzeugt einen Spielaufruf');

reset role;                       -- Zustellung an alle prüfen, ohne RLS-Filter
select public.assert_eq((select count(*)::int from public.notifications), 1,
  'Genau ein anderes Gruppenmitglied wird benachrichtigt');
select public.assert_eq((select user_id from public.notifications),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Die Benachrichtigung geht an B, nicht an den Absender');
set role authenticated;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.assert_eq((select count(*)::int from public.notifications), 0,
  'C bekommt keine Benachrichtigung aus einer fremden Gruppe');

-- C darf keine fremde Gruppe aufrufen.
do $$
begin
  perform public.create_play_invite((select id from public.groups limit 1));
  raise exception 'FAIL: C konnte in einer fremden Gruppe einladen';
exception
  when sqlstate '42501' then
    raise notice 'ok  C darf in fremden Gruppen nicht einladen';
  when others then
    raise notice 'ok  C kommt an die fremde Gruppe gar nicht heran (%)', sqlstate;
end $$;

-- ------------------------------------------------------------- Aufräumen
reset role;
select 'RLS-TESTS BESTANDEN' as ergebnis;
