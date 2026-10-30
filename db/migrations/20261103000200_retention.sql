-- Phase 5: data retention.
--
-- Some records are only useful for a while. Keeping them forever costs
-- storage (the free tier has 500 MB) and means holding personal data longer
-- than needed. Once a day, a scheduled job deletes:
--
--   * activity history older than 12 months (admins can export it as CSV first),
--   * notifications that were read more than 90 days ago, and any older than 12 months,
--   * invitations that stopped being usable (accepted, declined, revoked or
--     expired) more than 90 days ago. Their history stays in the activity log.
--
-- Change the intervals below to change the policy; docs/architecture.md
-- describes it for users.

-- Lets the daily purge find old events without scanning every workspace.
create index audit_events_created_at_idx on public.audit_events (created_at);

/**
 * Deletes records past their retention period and returns how many of each
 * were removed. Runs as the table owner because nobody, not even admins, can
 * delete history through the app. A daily scheduled job on the host (Vercel
 * Cron) calls it through a server-only connection.
 */
create function public.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_count integer;
  notification_count integer;
  invitation_count integer;
begin
  delete from public.audit_events
  where created_at < now() - interval '12 months';
  get diagnostics audit_count = row_count;

  delete from public.notifications
  where (read_at is not null and read_at < now() - interval '90 days')
     or created_at < now() - interval '12 months';
  get diagnostics notification_count = row_count;

  delete from public.workspace_invitations
  where coalesce(accepted_at, declined_at, revoked_at, expires_at) < now() - interval '90 days';
  get diagnostics invitation_count = row_count;

  return jsonb_build_object(
    'audit_events', audit_count,
    'notifications', notification_count,
    'invitations', invitation_count
  );
end;
$$;

-- Only the database owner (the scheduled job) may call it.
revoke execute on function public.purge_expired_records() from public, anon, authenticated;
