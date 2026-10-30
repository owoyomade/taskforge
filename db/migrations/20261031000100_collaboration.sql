-- Phase 3: invitations, ownership transfer, comments, mentions and attachments.
--
-- Invitations are matched on the invitee's *verified* email address. An
-- invite link is only a convenient way to find the invitation; accepting it
-- still requires being signed in with that exact email, so a forwarded or
-- leaked link is useless to anyone else.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  -- Ownership is never granted by invitation; it's transferred deliberately.
  role public.workspace_role not null check (role <> 'owner'),
  -- Only a SHA-256 hash of the link's token is stored. Someone who can read
  -- this table still can't reconstruct a working invite link.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open invitation per email per workspace.
create unique index workspace_invitations_open_idx
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and declined_at is null and revoked_at is null;

create index workspace_invitations_email_idx on public.workspace_invitations (email);

-- The signed-in user's verified email, lowercased; null if unverified.
create function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email) from auth.users
  where id = (select auth.uid()) and email_verified;
$$;

/**
 * Creates an invitation and returns the raw link token, which is shown to
 * the inviter once and never stored. Inviting an email that already has an
 * open invitation replaces it (the old link stops working).
 */
create function public.create_invitation(
  target_workspace uuid,
  invite_email text,
  invite_role public.workspace_role
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(invite_email));
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  created_id uuid;
begin
  if not public.has_workspace_role(target_workspace, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Only owners and admins can invite people.' using errcode = '42501';
  end if;

  if invite_role = 'owner' then
    raise exception 'Invite them as an admin, then transfer ownership once they''ve joined.' using errcode = 'TF001';
  end if;

  if exists (
    select 1 from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = target_workspace and lower(p.email) = normalized_email
  ) then
    raise exception 'That person is already a member of this workspace.' using errcode = 'TF001';
  end if;

  -- Abuse guards: invitations are the main way to make this app contact
  -- outsiders, so they're limited per workspace.
  if (
    select count(*) from public.workspace_invitations
    where workspace_id = target_workspace and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Too many invitations in the last hour. Try again later.' using errcode = 'TF001';
  end if;

  if (
    select count(*) from public.workspace_invitations
    where workspace_id = target_workspace
      and accepted_at is null and declined_at is null and revoked_at is null and expires_at > now()
  ) >= 100 then
    raise exception 'This workspace has 100 open invitations. Revoke some before sending more.' using errcode = 'TF001';
  end if;

  update public.workspace_invitations
  set revoked_at = now()
  where workspace_id = target_workspace and email = normalized_email
    and accepted_at is null and declined_at is null and revoked_at is null;

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values (
    target_workspace,
    normalized_email,
    invite_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    auth.uid()
  )
  returning id into created_id;

  return query select created_id, raw_token;
end;
$$;

/**
 * What the invite link page shows. Reveals only the workspace name, the
 * inviter's name, the role, and a masked email ("t•••@example.com") so the
 * visitor knows which account to sign in with.
 */
create function public.invitation_preview(raw_token text)
returns table (
  invitation_id uuid,
  workspace_name text,
  inviter_name text,
  role public.workspace_role,
  email_hint text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    w.name,
    coalesce(nullif(p.full_name, ''), 'A teammate'),
    i.role,
    left(i.email, 1) || '•••@' || split_part(i.email, '@', 2),
    case
      when i.accepted_at is not null then 'accepted'
      when i.declined_at is not null then 'declined'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex');
$$;

/** Open invitations addressed to the signed-in user's verified email. */
create function public.list_my_invitations()
returns table (
  invitation_id uuid,
  workspace_name text,
  inviter_name text,
  role public.workspace_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, w.name, coalesce(nullif(p.full_name, ''), 'A teammate'), i.role, i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.current_user_email()
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

/** Accepts or declines an invitation. Returns the workspace slug on accept. */
create function public.respond_to_invitation(target_invitation uuid, accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.workspace_invitations;
  workspace_slug text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to this invitation.' using errcode = '42501';
  end if;

  -- Lock the row so the same invitation can't be accepted twice at once.
  select * into invitation from public.workspace_invitations where id = target_invitation for update;

  if not found or invitation.revoked_at is not null then
    raise exception 'This invitation is no longer valid. Ask for a new one.' using errcode = 'TF001';
  end if;
  if invitation.accepted_at is not null or invitation.declined_at is not null then
    raise exception 'This invitation has already been answered.' using errcode = 'TF001';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'TF001';
  end if;
  if invitation.email is distinct from public.current_user_email() then
    raise exception 'This invitation was sent to a different email address. Sign in with that address to accept it.'
      using errcode = 'TF001';
  end if;

  if accept then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (invitation.workspace_id, auth.uid(), invitation.role)
    on conflict (workspace_id, user_id) do nothing;

    update public.workspace_invitations set accepted_at = now() where id = invitation.id;
    select slug into workspace_slug from public.workspaces where id = invitation.workspace_id;
    return workspace_slug;
  end if;

  update public.workspace_invitations set declined_at = now() where id = invitation.id;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership transfer
--
-- SECURITY INVOKER: it runs with the caller's own permissions, so the RLS
-- policies and the membership rules trigger apply exactly as they would to
-- two separate updates. The function just makes the pair all-or-nothing,
-- and promotes first so the workspace is never without an owner.
-- ---------------------------------------------------------------------------

create function public.transfer_ownership(target_workspace uuid, new_owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if public.workspace_role_for(target_workspace) is distinct from 'owner' then
    raise exception 'Only an owner can transfer ownership.' using errcode = 'TF001';
  end if;
  if new_owner = auth.uid() then
    raise exception 'You already own this workspace.' using errcode = 'TF001';
  end if;

  update public.workspace_members set role = 'owner'
  where workspace_id = target_workspace and user_id = new_owner;
  if not found then
    raise exception 'The new owner must already be a member of this workspace.' using errcode = 'TF001';
  end if;

  update public.workspace_members set role = 'admin'
  where workspace_id = target_workspace and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments and mentions
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  -- Plain text with mention tokens like @[Name](user-id). It's always
  -- rendered as text; mention tokens become name chips, never HTML.
  body text not null check (char_length(trim(body)) between 1 and 5000),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create index comments_task_created_idx on public.comments (task_id, created_at);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- Who a comment mentions, so later phases can notify them.
create table public.comment_mentions (
  comment_id uuid not null,
  project_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  primary key (comment_id, user_id),
  foreign key (comment_id, project_id) references public.comments (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  -- Only workspace members can be mentioned.
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);

create index comment_mentions_user_id_idx on public.comment_mentions (user_id);

-- ---------------------------------------------------------------------------
-- Attachments
--
-- Files are stored outside the database at
-- <workspace id>/<project id>/<task id>/<random id>-<file name>.
-- This table records each file; the app checks access before every download.
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 5 * 1024 * 1024),
  created_at timestamptz not null default now(),
  check (storage_path like workspace_id::text || '/' || project_id::text || '/' || task_id::text || '/%'),
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create index attachments_task_id_idx on public.attachments (task_id);
create index attachments_workspace_id_idx on public.attachments (workspace_id);

-- Free-tier guardrail: 100 MB of attachments per workspace.
create function public.enforce_attachment_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select coalesce(sum(size_bytes), 0) from public.attachments where workspace_id = new.workspace_id)
     + new.size_bytes > 100 * 1024 * 1024 then
    raise exception 'This workspace has used its 100 MB of attachment storage. Delete some files first.'
      using errcode = 'TF001';
  end if;
  return new;
end;
$$;

create trigger attachments_enforce_quota
  before insert on public.attachments
  for each row execute function public.enforce_attachment_quota();

/**
 * Access check for an attachment's storage path, called by the app before
 * any upload, download or delete. Reads the project id from the second
 * folder, confirms the first folder is that project's workspace, then
 * applies the normal project access rules. Comparisons are done as text so
 * a malformed path simply fails rather than raising an error.
 */
create function public.can_access_attachment_path(object_name text, needed text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id::text = split_part(object_name, '/', 2)
      and p.workspace_id::text = split_part(object_name, '/', 1)
      and case needed
        when 'view' then public.project_access(p.id) is not null
        when 'edit' then public.project_access(p.id) in ('edit', 'manage')
        when 'manage' then public.project_access(p.id) = 'manage'
        else false
      end
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.workspace_invitations, public.comments, public.comment_mentions, public.attachments
from anon, authenticated;

grant select on public.workspace_invitations to authenticated;
grant update (revoked_at) on public.workspace_invitations to authenticated;

grant select, insert, delete on public.comments to authenticated;
grant update (body, edited_at) on public.comments to authenticated;

grant select, insert, delete on public.comment_mentions to authenticated;

grant select, insert, delete on public.attachments to authenticated;

revoke execute on function
  public.current_user_email(),
  public.create_invitation(uuid, text, public.workspace_role),
  public.invitation_preview(text),
  public.list_my_invitations(),
  public.respond_to_invitation(uuid, boolean),
  public.transfer_ownership(uuid, uuid),
  public.can_access_attachment_path(text, text)
from public, anon;

grant execute on function
  public.current_user_email(),
  public.create_invitation(uuid, text, public.workspace_role),
  public.invitation_preview(text),
  public.list_my_invitations(),
  public.respond_to_invitation(uuid, boolean),
  public.transfer_ownership(uuid, uuid),
  public.can_access_attachment_path(text, text)
to authenticated;

revoke execute on function public.enforce_attachment_quota() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspace_invitations enable row level security;
alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.attachments enable row level security;

-- Invitees see their invitations through list_my_invitations(), not this table.
create policy "workspace_invitations: owners and admins read"
  on public.workspace_invitations for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "workspace_invitations: owners and admins revoke"
  on public.workspace_invitations for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "comments: read with the task"
  on public.comments for select to authenticated
  using (public.can_view_project(project_id));

create policy "comments: editors write as themselves"
  on public.comments for insert to authenticated
  with check (public.can_edit_project(project_id) and author_id = (select auth.uid()));

create policy "comments: authors edit their own"
  on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and public.can_edit_project(project_id))
  with check (author_id = (select auth.uid()) and public.can_edit_project(project_id));

create policy "comments: authors or managers delete"
  on public.comments for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.can_edit_project(project_id))
    or public.can_manage_project(project_id)
  );

create policy "comment_mentions: read with the task"
  on public.comment_mentions for select to authenticated
  using (public.can_view_project(project_id));

create policy "comment_mentions: the comment's author manages them"
  on public.comment_mentions for insert to authenticated
  with check (exists (
    select 1 from public.comments c
    where c.id = comment_id and c.author_id = (select auth.uid())
  ));

create policy "comment_mentions: the comment's author removes them"
  on public.comment_mentions for delete to authenticated
  using (exists (
    select 1 from public.comments c
    where c.id = comment_id and c.author_id = (select auth.uid())
  ));

create policy "attachments: read with the task"
  on public.attachments for select to authenticated
  using (public.can_view_project(project_id));

create policy "attachments: editors add as themselves"
  on public.attachments for insert to authenticated
  with check (public.can_edit_project(project_id) and uploaded_by = (select auth.uid()));

create policy "attachments: uploader or manager deletes"
  on public.attachments for delete to authenticated
  using (
    (uploaded_by = (select auth.uid()) and public.can_edit_project(project_id))
    or public.can_manage_project(project_id)
  );
