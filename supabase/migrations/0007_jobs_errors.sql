-- Background jobs (long agent runs that must survive a timed-out or crashed request) and in-house error tracking.

-- ---------------------------------------------------------------------------
-- Jobs: the web request enqueues; a worker (kicked right away, and by cron) claims and runs.
-- Only the service role touches this table; owners see progress on the vehicle row.
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('model_agent')),
  owner_id uuid references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_ready_idx on public.jobs (status, run_after);
-- One live job per vehicle and kind.
create unique index if not exists jobs_one_live on public.jobs (kind, vehicle_id) where status in ('queued','running');
alter table public.jobs enable row level security;
-- Owners may read their own job state (no writes).
drop policy if exists "jobs owner read" on public.jobs;
create policy "jobs owner read" on public.jobs for select using (auth.uid() = owner_id);

/**
 * Claim up to n runnable jobs. Jobs stuck in 'running' longer than stale_after (the worker died) go back
 * in the queue, or fail once they've used up their attempts. Service role only.
 */
create or replace function public.claim_jobs(n integer default 1, stale_after interval default interval '20 minutes')
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'claim_jobs is for the job worker only'; end if;
  update jobs set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
    last_error = 'worker stopped before finishing',
    finished_at = case when attempts >= max_attempts then now() else null end, locked_at = null
  where status = 'running' and locked_at < now() - stale_after;
  return query
    update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
    where j.id in (
      select id from jobs where status = 'queued' and run_after <= now()
      order by run_after limit greatest(1, least(n, 10)) for update skip locked
    )
    returning j.*;
end $$;
revoke execute on function public.claim_jobs(integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Error events: server errors (instrumentation), client crashes (error boundary), failed jobs.
-- Written with the service role; moderators can read them in the app.
-- ---------------------------------------------------------------------------
create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  source text not null check (source in ('server','client','job')),
  message text not null check (char_length(message) <= 2000),
  digest text,
  path text check (path is null or char_length(path) <= 500),
  stack text check (stack is null or char_length(stack) <= 8000),
  user_id uuid references public.profiles(id) on delete set null,
  context jsonb not null default '{}'::jsonb
);
create index if not exists error_events_at_idx on public.error_events (at desc);
alter table public.error_events enable row level security;
drop policy if exists "errors moderators read" on public.error_events;
create policy "errors moderators read" on public.error_events for select using (public.is_moderator(auth.uid()));

drop policy if exists "jobs moderators read" on public.jobs;
create policy "jobs moderators read" on public.jobs for select using (public.is_moderator(auth.uid()));
