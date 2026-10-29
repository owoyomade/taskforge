-- Phase 1: profile avatars in Supabase Storage.
--
-- The bucket is private: the browser never gets a permanent public URL. The
-- server creates short-lived signed URLs for people allowed to see the image.
-- Files live at "<user id>/<file name>", and the folder name is what the
-- policies below check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2 * 1024 * 1024,
  -- SVG is deliberately excluded: it can carry scripts.
  array['image/png', 'image/jpeg', 'image/webp']
);

-- Avatars are visible to their owner and to anyone who shares a workspace
-- with them. Compares as text so a malformed folder name can't make the
-- uuid cast fail and break the whole query.
create function public.can_view_avatar(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(object_name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.workspace_members as mine
      join public.workspace_members as theirs using (workspace_id)
      where mine.user_id = (select auth.uid())
        and theirs.user_id::text = (storage.foldername(object_name))[1]
    );
$$;

revoke execute on function public.can_view_avatar(text) from public, anon;
grant execute on function public.can_view_avatar(text) to authenticated;

create policy "avatars: read own or teammates"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_view_avatar(name));

create policy "avatars: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: replace own files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: delete own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
