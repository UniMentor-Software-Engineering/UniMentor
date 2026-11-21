-- Production only (Supabase). NOT a migration: the local Docker PostgreSQL has no pg_cron
-- or pg_net, so this file is run by hand once against the Supabase database.
--
-- Why: Render's free instance sleeps after 15 minutes without traffic, and while it sleeps
-- the CU-10 reminder scheduler inside the API does not run. GitHub's scheduled workflows
-- turned out to be unreliable for this (keep-alive.yml), so the database itself calls
-- /api/health every 10 minutes. As a side effect the database also stays active, which
-- prevents Supabase from pausing the free project.
--
-- Run (from backend/, with the DATABASE_URL of the Render service):
--   psql "$DATABASE_URL" -f src/database/supabase/keep-alive.sql
-- It can be run again: it replaces the job instead of adding a second one.
-- Check:   select * from cron.job;  select * from cron.job_run_details order by start_time desc limit 5;
--          select status_code, created from net._http_response order by created desc limit 5;
-- Remove:  select cron.unschedule('unimentor-keep-alive');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'unimentor-keep-alive';

SELECT cron.schedule(
  'unimentor-keep-alive',
  '*/10 * * * *',
  $$SELECT net.http_get(
      url := 'https://unimentor-api.onrender.com/api/health',
      timeout_milliseconds := 60000
    )$$
);
