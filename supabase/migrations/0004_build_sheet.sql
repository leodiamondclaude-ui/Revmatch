-- Build sheet: everything an owner shows off about their car, plus owner-only private details.

-- Public build sheet (follows the vehicle's visibility). Only data the owner chose to show is written here;
-- hidden details live in vehicle_private.
alter table public.vehicles add column if not exists build jsonb not null default '{}'::jsonb;

-- Owner-only details: VIN, plate, what they paid, budget, private notes. Never readable by anyone else.
create table if not exists public.vehicle_private (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vin text check (vin is null or char_length(vin) <= 17),
  plate text check (plate is null or char_length(plate) <= 12),
  purchase_price numeric(12,2),
  budget numeric(12,2),
  notes text check (notes is null or char_length(notes) <= 4000),
  hidden jsonb not null default '{}'::jsonb,       -- build-sheet values the owner hid from the public page
  updated_at timestamptz not null default now()
);
alter table public.vehicle_private enable row level security;
drop policy if exists "private owner only" on public.vehicle_private;
create policy "private owner only" on public.vehicle_private for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

-- Mods can be planned (a wishlist) as well as installed.
alter table public.modifications add column if not exists status text not null default 'installed';
alter table public.modifications drop constraint if exists modifications_status_check;
alter table public.modifications add constraint modifications_status_check check (status in ('installed','planned'));
-- Where a mod came from, so owner-confirmed photo findings can be told apart from typed ones.
alter table public.modifications add column if not exists source text not null default 'owner';
alter table public.modifications drop constraint if exists modifications_source_check;
alter table public.modifications add constraint modifications_source_check check (source in ('owner','photo'));

-- Shows and awards go on the build timeline too.
alter table public.build_events drop constraint if exists build_events_kind_check;
alter table public.build_events add constraint build_events_kind_check check (kind in ('purchase','service','milestone','track','show','award'));
-- Service entries can be kept private.
alter table public.build_events add column if not exists is_private boolean not null default false;
drop policy if exists "events visible" on public.build_events;
create policy "events visible" on public.build_events for select
  using (auth.uid() = owner_id or (not is_private and public.can_view_vehicle(auth.uid(), vehicle_id)));

-- Cars waiting on a library entry that's still being built get it applied when it's ready.
alter table public.model_library add column if not exists waiting uuid[] not null default '{}';
