-- 0009_storage.sql
-- Storage-Buckets: Avatare (öffentlich lesbar) und Session-Audio (privat).
--
-- Pfadkonvention in beiden Buckets: <user_id>/<dateiname>. Die Policies
-- prüfen den ersten Pfadsegment gegen auth.uid().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-audio', 'session-audio', false, 50 * 1024 * 1024,
  array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']
)
on conflict (id) do nothing;

-- -------------------------------------------------------------- avatars
drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable" on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -------------------------------------------------------- session-audio
-- Nur der Aufnehmende kommt an seine Mitschnitte. Bewusst nicht gruppenweit:
-- das sind Raumaufnahmen, an denen Dritte beteiligt sein können.
drop policy if exists "users read own session audio" on storage.objects;
create policy "users read own session audio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users upload own session audio" on storage.objects;
create policy "users upload own session audio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own session audio" on storage.objects;
create policy "users delete own session audio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
