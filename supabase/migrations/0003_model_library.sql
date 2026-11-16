-- Model library: stock 3D models prepared ahead of time, one per car generation, shared by every owner.
-- The library agent fills it from a catalogue of popular cars and from cars owners add that it doesn't cover yet.
create table if not exists public.model_library (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                       -- normalised make|model|generation
  make text not null,
  model text not null,
  generation text,
  year_from int not null,
  year_to int not null check (year_to >= year_from),
  body text not null default 'sedan',
  status text not null default 'queued' check (status in ('queued','building','ready','none_found','failed')),
  source text check (source in ('sketchfab','generated')),
  base jsonb,                                     -- AssemblyPlan["base"]: GLB url, licence, material/wheel mapping
  structure text,                                 -- node/material listing used to fit owners' mods onto the base
  look jsonb,                                     -- factory colours and signature details
  summary text,
  warnings jsonb not null default '[]'::jsonb,
  thumbnail_url text,
  demand int not null default 0,                  -- how many owners have asked for this car; built first
  attempts int not null default 0,
  last_error text,
  log jsonb not null default '[]'::jsonb,
  claimed_at timestamptz,
  built_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists model_library_queue on public.model_library (status, demand desc, created_at);
create index if not exists model_library_make on public.model_library (lower(make));

alter table public.model_library enable row level security;
-- Anyone signed in can read finished models; only the service role (the agent) writes.
drop policy if exists "Ready library models are readable" on public.model_library;
create policy "Ready library models are readable" on public.model_library for select to authenticated using (status = 'ready');
