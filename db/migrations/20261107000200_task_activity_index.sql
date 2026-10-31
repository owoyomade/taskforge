-- The workload radar asks "when did this task last change?" for every open
-- task with a due date. Without this index each answer would scan the
-- project's whole history; with it, it's a single index lookup.
create index audit_events_task_created_idx on public.audit_events (task_id, created_at desc) where task_id is not null;
