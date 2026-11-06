-- RevMatch core schema
-- Run with `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  location text,
  is_private boolean not null default false,
  accent_mode text not null default 'vehicle' check (accent_mode in ('vehicle','custom')),
  accent_color text not null default '#e10600',
  primary_vehicle_id uuid,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  units text not null default 'imperial' check (units in ('imperial','metric')),
  auto_detect boolean not null default false,
  auto_action text not null default 'prompt' check (auto_action in ('prompt','auto')),
  auto_min_speed_kph numeric not null default 20,
  auto_min_duration_s integer not null default 20,
  auto_stop_idle_s integer not null default 180,
  min_sample_distance_m numeric not null default 3,
  max_accuracy_m numeric not null default 35,
  default_drive_visibility text not null default 'private' check (default_drive_visibility in ('private','friends','public')),
  default_share_route boolean not null default false,
  endpoint_privacy_m integer not null default 400,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index on public.follows (following_id);

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index on public.friendships (addressee_id);
-- One friendship row per unordered pair
create unique index friendships_pair_uniq on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- unguessable public handle used by QR codes (/v/<slug>)
  slug text not null unique default encode(gen_random_bytes(9), 'hex'),
  nickname text,
  year integer check (year between 1886 and 2100),
  make text not null,
  model text not null,
  trim text,
  engine text,
  horsepower integer,
  torque integer,
  transmission text,
  drivetrain text,
  exterior_color text,
  exterior_color_hex text default '#9aa0a6',
  interior_color text,
  mileage integer,
  mileage_unit text not null default 'mi' check (mileage_unit in ('mi','km')),
  description text,
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  show_stats_public boolean not null default true,
  cover_photo_url text,
  -- 3D
  body_style text not null default 'coupe',
  model_config jsonb not null default '{}'::jsonb,
  model_url text,
  model_source text not null default 'procedural' check (model_source in ('procedural','library','ai')),
  model_status text not null default 'ready' check (model_status in ('none','searching','generating','ready','failed')),
  model_task_id text,
  model_attribution text,
  model_approved boolean not null default false,
  ai_identification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vehicles (owner_id);

alter table public.profiles
  add constraint profiles_primary_vehicle_fk foreign key (primary_vehicle_id) references public.vehicles(id) on delete set null;

create table public.modifications (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  name text not null,
  brand text,
  product text,
  installed_on date,
  cost numeric(12,2),
  show_cost boolean not null default false,
  description text,
  hp_gain integer,
  torque_gain integer,
  performance_notes text,
  visual jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.modifications (vehicle_id);

create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  modification_id uuid references public.modifications(id) on delete set null,
  storage_path text not null,
  url text not null,
  angle text not null default 'other' check (angle in ('front_3q','rear_3q','side','front','rear','interior','engine','detail','other')),
  caption text,
  created_at timestamptz not null default now()
);
create index on public.vehicle_photos (vehicle_id);

create table public.build_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_date date not null default current_date,
  kind text not null default 'milestone' check (kind in ('purchase','service','milestone','track','show')),
  title text not null,
  description text,
  mileage integer,
  created_at timestamptz not null default now()
);
create index on public.build_events (vehicle_id);

-- ---------------------------------------------------------------------------
-- Drives. `drives` holds share-safe aggregates only; raw GPS lives in
-- `drive_samples`, which only the owner can read.
-- ---------------------------------------------------------------------------
create table public.drives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  title text,
  notes text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_s integer,
  moving_s integer,
  distance_m numeric,
  avg_speed_mps numeric,
  avg_moving_speed_mps numeric,
  max_speed_mps numeric,
  elevation_gain_m numeric,
  elevation_loss_m numeric,
  min_altitude_m numeric,
  max_altitude_m numeric,
  avg_accuracy_m numeric,
  sample_count integer,
  sample_rate_hz numeric,
  source text not null default 'gps' check (source in ('gps','gps+obd')),
  start_mode text not null default 'manual' check (start_mode in ('manual','auto')),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  acceleration jsonb not null default '{}'::jsonb,
  obd_summary jsonb,
  segments jsonb not null default '[]'::jsonb,
  speed_series jsonb not null default '[]'::jsonb,   -- downsampled [t_s, mps, src]
  route_preview jsonb,                               -- endpoint-trimmed, downsampled [[lat,lng],...]
  visibility text not null default 'private' check (visibility in ('private','friends','public')),
  share_route boolean not null default false,
  status text not null default 'recording' check (status in ('recording','complete')),
  created_at timestamptz not null default now()
);
create index on public.drives (owner_id, started_at desc);
create index on public.drives (vehicle_id, started_at desc);

create table public.drive_samples (
  id bigint generated always as identity primary key,
  drive_id uuid not null references public.drives(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  t timestamptz not null,
  lat double precision,
  lng double precision,
  altitude double precision,
  altitude_accuracy double precision,
  accuracy double precision,
  speed_mps double precision,
  speed_source text check (speed_source in ('gps_doppler','gps_derived','obd')),
  heading double precision,
  rpm integer,
  coolant_c numeric,
  throttle_pct numeric,
  engine_load_pct numeric,
  intake_temp_c numeric,
  obd_speed_kph numeric,
  accel_g numeric
);
create index on public.drive_samples (drive_id, t);

-- ---------------------------------------------------------------------------
-- Activity feed
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  kind text not null default 'update' check (kind in ('update','new_vehicle','new_mod','drive','photo')),
  body text check (char_length(body) <= 2000),
  ref_id uuid,
  image_url text,
  meta jsonb not null default '{}'::jsonb,
  visibility text not null default 'public' check (visibility in ('public','followers','friends','private')),
  created_at timestamptz not null default now()
);
create index on public.posts (created_at desc);
create index on public.posts (author_id, created_at desc);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.post_comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so they can read across RLS)
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create or replace function public.is_following(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows where follower_id = viewer and following_id = target and status = 'accepted');
$$;

-- Can `viewer` see `owner`'s full profile content (garage, activity)?
create or replace function public.can_view_profile(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner
      or not coalesce((select is_private from profiles where id = owner), true)
      or (viewer is not null and (public.is_following(viewer, owner) or public.are_friends(viewer, owner)));
$$;

create or replace function public.can_view_vehicle(viewer uuid, vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vehicles v where v.id = vid and (
      v.owner_id = viewer
      or v.visibility = 'public'
      or (v.visibility = 'friends' and viewer is not null and public.are_friends(viewer, v.owner_id))
    )
  );
$$;

create or replace function public.can_view_post(viewer uuid, author uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = author
      or (vis = 'public' and public.can_view_profile(viewer, author))
      or (vis = 'followers' and viewer is not null and (public.is_following(viewer, author) or public.are_friends(viewer, author)))
      or (vis = 'friends' and viewer is not null and public.are_friends(viewer, author));
$$;

create or replace function public.can_view_drive(viewer uuid, d public.drives) returns boolean
language sql stable security definer set search_path = public as $$
  select d.owner_id = viewer
      or (d.status = 'complete' and (
            (d.visibility = 'public' and public.can_view_profile(viewer, d.owner_id))
         or (d.visibility = 'friends' and viewer is not null and public.are_friends(viewer, d.owner_id))));
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.follows enable row level security;
alter table public.friendships enable row level security;
alter table public.vehicles enable row level security;
alter table public.modifications enable row level security;
alter table public.vehicle_photos enable row level security;
alter table public.build_events enable row level security;
alter table public.drives enable row level security;
alter table public.drive_samples enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- Profiles: the profile card (username, avatar, bio) is discoverable so people
-- can find and follow each other; garage/activity content is gated separately.
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "settings self" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "follows visible" on public.follows for select using (
  auth.uid() in (follower_id, following_id) or (status = 'accepted' and public.can_view_profile(auth.uid(), following_id))
);
-- Follow requests to private profiles must start as pending.
create policy "follows create" on public.follows for insert with check (
  auth.uid() = follower_id and (
    status = 'pending' or not coalesce((select is_private from public.profiles where id = following_id), true)
  )
);
create policy "follows accept" on public.follows for update using (auth.uid() = following_id) with check (auth.uid() = following_id);
create policy "follows delete" on public.follows for delete using (auth.uid() in (follower_id, following_id));

create policy "friendships visible" on public.friendships for select using (
  auth.uid() in (requester_id, addressee_id) or (status = 'accepted' and (public.can_view_profile(auth.uid(), requester_id) and public.can_view_profile(auth.uid(), addressee_id)))
);
create policy "friendships request" on public.friendships for insert with check (auth.uid() = requester_id and status = 'pending');
create policy "friendships respond" on public.friendships for update using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "friendships delete" on public.friendships for delete using (auth.uid() in (requester_id, addressee_id));

create policy "vehicles visible" on public.vehicles for select using (public.can_view_vehicle(auth.uid(), id));
create policy "vehicles owner write" on public.vehicles for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "mods visible" on public.modifications for select using (public.can_view_vehicle(auth.uid(), vehicle_id));
create policy "mods owner write" on public.modifications for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

create policy "photos visible" on public.vehicle_photos for select using (public.can_view_vehicle(auth.uid(), vehicle_id));
create policy "photos owner write" on public.vehicle_photos for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

create policy "events visible" on public.build_events for select using (public.can_view_vehicle(auth.uid(), vehicle_id));
create policy "events owner write" on public.build_events for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

create policy "drives visible" on public.drives for select using (public.can_view_drive(auth.uid(), drives));
create policy "drives owner write" on public.drives for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Raw GPS never leaves the owner.
create policy "samples owner only" on public.drive_samples for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "posts visible" on public.posts for select using (public.can_view_post(auth.uid(), author_id, visibility));
create policy "posts owner write" on public.posts for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy "likes visible" on public.post_likes for select using (
  exists (select 1 from public.posts p where p.id = post_id and public.can_view_post(auth.uid(), p.author_id, p.visibility))
);
create policy "likes self" on public.post_likes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.posts p where p.id = post_id and public.can_view_post(auth.uid(), p.author_id, p.visibility))
);
create policy "likes unlike" on public.post_likes for delete using (auth.uid() = user_id);

create policy "comments visible" on public.post_comments for select using (
  exists (select 1 from public.posts p where p.id = post_id and public.can_view_post(auth.uid(), p.author_id, p.visibility))
);
create policy "comments create" on public.post_comments for insert with check (
  auth.uid() = author_id and exists (select 1 from public.posts p where p.id = post_id and public.can_view_post(auth.uid(), p.author_id, p.visibility))
);
create policy "comments delete" on public.post_comments for delete using (
  auth.uid() = author_id or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'gi'));
  candidate text;
begin
  if char_length(base) < 3 then base := base || 'driver'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    candidate := base || floor(random() * 10000)::int;
  end loop;
  insert into profiles (id, username, display_name)
    values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  insert into user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_at();

-- Owners can't move rows between users.
create or replace function public.lock_owner() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'owner_id is immutable'; end if;
  return new;
end $$;
create trigger vehicles_lock_owner before update on public.vehicles for each row execute function public.lock_owner();
create trigger drives_lock_owner before update on public.drives for each row execute function public.lock_owner();

-- Accepting a friend request leaves only status/responded_at changeable.
create or replace function public.friendship_guard() returns trigger language plpgsql as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'friendship parties are immutable';
  end if;
  new.responded_at := now();
  return new;
end $$;
create trigger friendships_guard before update on public.friendships for each row execute function public.friendship_guard();

-- ---------------------------------------------------------------------------
-- Aggregates (security invoker => RLS applies)
-- ---------------------------------------------------------------------------
create or replace function public.post_counts(ids uuid[])
returns table (post_id uuid, likes bigint, comments bigint, liked boolean)
language sql stable as $$
  select p.id,
    (select count(*) from post_likes l where l.post_id = p.id),
    (select count(*) from post_comments c where c.post_id = p.id),
    exists (select 1 from post_likes l where l.post_id = p.id and l.user_id = auth.uid())
  from posts p where p.id = any(ids);
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets. Object paths begin with the owner's user id.
-- Files are served from public buckets under unguessable paths; listing is
-- disabled and writes are limited to the owner's folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('vehicle-photos', 'vehicle-photos', true),
  ('vehicle-models', 'vehicle-models', true)
on conflict (id) do nothing;

create policy "owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','vehicle-photos','vehicle-models') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates" on storage.objects for update to authenticated
  using (bucket_id in ('avatars','vehicle-photos','vehicle-models') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','vehicle-photos','vehicle-models') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner lists" on storage.objects for select to authenticated
  using (bucket_id in ('avatars','vehicle-photos','vehicle-models') and (storage.foldername(name))[1] = auth.uid()::text);

-- Aggregate-only stats for a vehicle's public page. Returns nothing unless the
-- vehicle is visible to the caller and the owner enabled public stats.
-- Individual drives, routes and timestamps are never exposed here.
create or replace function public.vehicle_public_stats(vid uuid)
returns table (
  drives bigint, distance_m numeric, duration_s bigint, max_speed_mps numeric,
  avg_speed_mps numeric, longest_m numeric, best_0_60_s numeric, best_0_100_s numeric
)
language sql stable security definer set search_path = public as $$
  with v as (
    select id, owner_id from vehicles
    where id = vid and public.can_view_vehicle(auth.uid(), id) and (show_stats_public or owner_id = auth.uid())
  ), d as (
    select dr.* from drives dr join v on dr.vehicle_id = v.id where dr.status = 'complete'
  ), runs as (
    select (r->>'from_kph')::numeric f, (r->>'to_kph')::numeric t, (r->>'seconds')::numeric s
    from d, jsonb_array_elements(coalesce(d.acceleration->'runs', '[]'::jsonb)) r
  )
  select count(*), coalesce(sum(distance_m), 0), coalesce(sum(duration_s), 0)::bigint, max(max_speed_mps),
    case when sum(duration_s) > 0 then sum(distance_m) / sum(duration_s) end,
    max(distance_m),
    (select min(s) from runs where f = 0 and round(t) = 97),
    (select min(s) from runs where f = 0 and t = 100)
  from d
  having exists (select 1 from v);
$$;

-- Caller-scoped wrapper used by the app (always evaluates for auth.uid()).
create or replace function public.i_can_view_profile(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_view_profile(auth.uid(), owner);
$$;
