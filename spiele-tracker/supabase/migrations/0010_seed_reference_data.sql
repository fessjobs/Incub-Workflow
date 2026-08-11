-- 0010_seed_reference_data.sql
-- Stammdaten: Achievement-Regeln und Shop-Sortiment.
--
-- Beides ist Daten, kein Code. Ein neues Achievement ist ein insert hier
-- (oder im Supabase-Dashboard) – die App muss dafür nicht angefasst werden.
--
-- Aufbau einer rule:
--   { "scope": "session" | "career",
--     "metric": "<Schlüssel aus StatsResult.metrics bzw. Karriere-Metrik>",
--     "op": "gte" | "lte" | "eq",
--     "value": <Zahl>,
--     "gameId": "<optional, sonst alle Spiele>" }
-- Der Evaluator in src/features/achievements/evaluate.ts liest genau das.

insert into public.achievements (id, game_id, name, description, icon, rule, xp_reward, coin_reward, sort_order)
values
  ('first_session', null, 'Erster Wurf',
   'Erste Session überhaupt abgeschlossen.', '🎯',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":1}'::jsonb,
   50, 25, 10),

  ('sessions_10', null, 'Stammgast',
   '10 Sessions gespielt.', '📅',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":10}'::jsonb,
   150, 75, 20),

  ('sessions_50', null, 'Inventar der Kneipe',
   '50 Sessions gespielt.', '🏠',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":50}'::jsonb,
   500, 250, 30),

  ('dart_clock_finish', 'dart-clock', 'Die Uhr geschlagen',
   'Alle 20 Zahlen innerhalb des Zeitlimits getroffen.', '🕛',
   '{"scope":"session","metric":"completed","op":"eq","value":1,"gameId":"dart-clock"}'::jsonb,
   300, 150, 40),

  ('dart_clock_15_numbers', 'dart-clock', 'Auf halber Strecke',
   'Mindestens 15 Zahlen in einer Session geschafft.', '⏱️',
   '{"scope":"session","metric":"numbersCleared","op":"gte","value":15,"gameId":"dart-clock"}'::jsonb,
   120, 60, 50),

  ('dart_clock_accuracy_50', 'dart-clock', 'Scharfschütze',
   'Trefferquote von mindestens 50 % in einer Session.', '🔍',
   '{"scope":"session","metric":"hitRate","op":"gte","value":0.5,"gameId":"dart-clock"}'::jsonb,
   200, 100, 60),

  ('dart_clock_fast_retrieval', 'dart-clock', 'Flinke Finger',
   'Durchschnittliche Ziehzeit unter 8 Sekunden.', '⚡',
   '{"scope":"session","metric":"avgRetrievalMs","op":"lte","value":8000,"gameId":"dart-clock"}'::jsonb,
   150, 75, 70),

  ('dart_clock_throughput', 'dart-clock', 'Dauerfeuer',
   'Mindestens 30 Würfe pro Minute.', '🔥',
   '{"scope":"session","metric":"throwsPerMinute","op":"gte","value":30,"gameId":"dart-clock"}'::jsonb,
   150, 75, 80)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  rule        = excluded.rule,
  xp_reward   = excluded.xp_reward,
  coin_reward = excluded.coin_reward,
  sort_order  = excluded.sort_order;

insert into public.shop_items (id, kind, name, description, price_coins, payload, min_level, sort_order)
values
  ('frame_default',  'avatar_frame', 'Schlicht',      'Dezenter Rahmen.',                     0,
   '{"color":"#2a343f"}'::jsonb, 1, 10),
  ('frame_neon',     'avatar_frame', 'Neon',          'Leuchtender Rahmen in Cyan.',        400,
   '{"color":"#22d3ee","glow":true}'::jsonb, 3, 20),
  ('frame_gold',     'avatar_frame', 'Gold',          'Für Leute mit Pokalregal.',         1500,
   '{"color":"#fbbf24","glow":true}'::jsonb, 10, 30),

  ('board_classic',  'board_theme',  'Klassisch',     'Schwarz-weiß mit Rot und Grün.',       0,
   '{"even":"#111827","odd":"#e5e7eb","double":"#dc2626","triple":"#16a34a"}'::jsonb, 1, 40),
  ('board_midnight', 'board_theme',  'Mitternacht',   'Dunkelblau mit Cyan-Akzenten.',      600,
   '{"even":"#0b1220","odd":"#1e293b","double":"#22d3ee","triple":"#0ea5e9"}'::jsonb, 4, 50),

  ('card_basic',     'card_design',  'Standardkarte', 'Die Karte, mit der jeder anfängt.',    0,
   '{"bg":"#141a22","accent":"#22d3ee"}'::jsonb, 1, 60),
  ('card_holo',      'card_design',  'Holo',          'Schimmernder Verlauf.',             1200,
   '{"bg":"linear-gradient(135deg,#1e293b,#4c1d95)","accent":"#a78bfa","holo":true}'::jsonb, 8, 70),

  ('sound_off',      'sound_pack',   'Stumm',         'Keine Töne.',                          0,
   '{}'::jsonb, 1, 80),
  ('sound_arcade',   'sound_pack',   'Arcade',        'Piepser wie am Automaten.',          350,
   '{"hit":"arcade_hit","miss":"arcade_miss","levelup":"arcade_levelup"}'::jsonb, 2, 90)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  price_coins = excluded.price_coins,
  payload     = excluded.payload,
  min_level   = excluded.min_level,
  sort_order  = excluded.sort_order;
