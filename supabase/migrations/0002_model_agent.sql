-- Model agent: assembly plans built from licensed Sketchfab models.
alter table public.vehicles
  add column if not exists model_assembly jsonb,
  add column if not exists model_agent_log jsonb not null default '[]'::jsonb;

alter table public.vehicles drop constraint if exists vehicles_model_source_check;
alter table public.vehicles add constraint vehicles_model_source_check
  check (model_source in ('procedural','library','ai','agent'));
