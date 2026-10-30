-- The daily clean-up now runs as a scheduled job on the host (Vercel Cron)
-- instead of pg_cron, calling /api/cron/purge, which uses the app's own
-- login. That login gets permission to run this one function and nothing
-- else. Signed-in users still can't run it (see retention.test.sql), and
-- the route refuses callers without the job's secret.

grant execute on function public.purge_expired_records() to taskforge_app;
