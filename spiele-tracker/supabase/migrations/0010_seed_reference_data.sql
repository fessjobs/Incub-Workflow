-- 0010_seed_reference_data.sql
-- Stammdaten: Achievement-Regeln.
--
-- Kein Shop-Sortiment mehr: Entscheidung vom 30.10. ist XP und Level ohne
-- Währung und ohne Kosmetik.
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

insert into public.achievements (id, game_id, name, description, icon, rule, xp_reward, sort_order)
values
  ('first_session', null, 'Erster Wurf',
   'Erste Session überhaupt abgeschlossen.', '🎯',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":1}'::jsonb,
   50, 10),

  ('sessions_10', null, 'Stammgast',
   '10 Sessions gespielt.', '📅',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":10}'::jsonb,
   150, 20),

  ('sessions_50', null, 'Inventar der Kneipe',
   '50 Sessions gespielt.', '🏠',
   '{"scope":"career","metric":"sessionsPlayed","op":"gte","value":50}'::jsonb,
   500, 30),

  ('dart_clock_finish', 'dart-clock', 'Die Uhr geschlagen',
   'Alle 20 Zahlen innerhalb des Zeitlimits getroffen.', '🕛',
   '{"scope":"session","metric":"completed","op":"eq","value":1,"gameId":"dart-clock"}'::jsonb,
   300, 40),

  ('dart_clock_15_numbers', 'dart-clock', 'Auf halber Strecke',
   'Mindestens 15 Zahlen in einer Session geschafft.', '⏱️',
   '{"scope":"session","metric":"numbersCleared","op":"gte","value":15,"gameId":"dart-clock"}'::jsonb,
   120, 50),

  ('dart_clock_accuracy_50', 'dart-clock', 'Scharfschütze',
   'Trefferquote von mindestens 50 % in einer Session.', '🔍',
   '{"scope":"session","metric":"hitRate","op":"gte","value":0.5,"gameId":"dart-clock"}'::jsonb,
   200, 60),

  ('dart_clock_fast_retrieval', 'dart-clock', 'Flinke Finger',
   'Durchschnittliche Ziehzeit unter 8 Sekunden.', '⚡',
   '{"scope":"session","metric":"avgRetrievalMs","op":"lte","value":8000,"gameId":"dart-clock"}'::jsonb,
   150, 70),

  ('dart_clock_throughput', 'dart-clock', 'Dauerfeuer',
   'Mindestens 30 Würfe pro Minute.', '🔥',
   '{"scope":"session","metric":"throwsPerMinute","op":"gte","value":30,"gameId":"dart-clock"}'::jsonb,
   150, 80)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  rule        = excluded.rule,
  xp_reward   = excluded.xp_reward,
  sort_order  = excluded.sort_order;
