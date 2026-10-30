-- Phase 1: who may see a profile photo.
--
-- Photos are stored outside the database at "<user id>/<file name>" and the
-- app only hands them out after this check. The folder name is what's
-- compared, so a photo is visible to its owner and to anyone who shares a
-- workspace with them.

-- Compares as text so a malformed path can't make the uuid cast fail.
create function public.can_view_avatar(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(object_name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1
      from public.workspace_members as mine
      join public.workspace_members as theirs using (workspace_id)
      where mine.user_id = (select auth.uid())
        and theirs.user_id::text = split_part(object_name, '/', 1)
    );
$$;

revoke execute on function public.can_view_avatar(text) from public, anon;
grant execute on function public.can_view_avatar(text) to authenticated;
