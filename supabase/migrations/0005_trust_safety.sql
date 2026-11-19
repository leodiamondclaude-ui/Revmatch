-- Trust & safety: AI usage limits, blocking, reporting and moderation, posting rate limits, account deletion.

-- ---------------------------------------------------------------------------
-- AI usage (per-user daily limits). Written and read by the service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('identify','lookup','agent','generate')),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind on public.ai_usage (user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "usage self read" on public.ai_usage;
create policy "usage self read" on public.ai_usage for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Blocks: a blocked user can't see the blocker's content or interact with them.
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Blocking ends any friendship or follow between the two.
create or replace function public.on_block() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships where (requester_id = new.blocker_id and addressee_id = new.blocked_id) or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  delete from public.follows where (follower_id = new.blocker_id and following_id = new.blocked_id) or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end $$;
drop trigger if exists blocks_cleanup on public.blocks;
create trigger blocks_cleanup after insert on public.blocks for each row execute function public.on_block();

-- Visibility helpers now respect blocks (same rules as before, plus: blocked either way sees nothing).
create or replace function public.can_view_post(viewer uuid, author uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = author
      or (not (viewer is not null and public.is_blocked(viewer, author)) and (
           (vis = 'public' and public.can_view_profile(viewer, author))
        or (vis = 'followers' and viewer is not null and (public.is_following(viewer, author) or public.are_friends(viewer, author)))
        or (vis = 'friends' and viewer is not null and public.are_friends(viewer, author))));
$$;

create or replace function public.can_view_vehicle(viewer uuid, vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vehicles v where v.id = vid and (
      v.owner_id = viewer
      or (not (viewer is not null and public.is_blocked(viewer, v.owner_id)) and (
           v.visibility = 'public'
        or (v.visibility = 'friends' and viewer is not null and public.are_friends(viewer, v.owner_id))))
    )
  );
$$;

drop policy if exists "follows create" on public.follows;
create policy "follows create" on public.follows for insert with check (
  auth.uid() = follower_id and not public.is_blocked(follower_id, following_id) and (
    status = 'pending' or not coalesce((select is_private from public.profiles where id = following_id), true)));
drop policy if exists "friendships request" on public.friendships;
create policy "friendships request" on public.friendships for insert with check (auth.uid() = requester_id and status = 'pending' and not public.is_blocked(requester_id, addressee_id));

-- ---------------------------------------------------------------------------
-- Reports and moderation. Anyone signed in can report; only moderators read and act.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_moderator boolean not null default false;
alter table public.profiles add column if not exists suspended_at timestamptz;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('post','comment','profile','vehicle','photo')),
  target_id uuid not null,
  target_owner_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','hate','sexual','violence','illegal','impersonation','other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);
create index if not exists reports_open on public.reports (status, created_at);
alter table public.reports enable row level security;

create or replace function public.is_moderator(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_moderator from public.profiles where id = uid), false);
$$;
drop policy if exists "reports create" on public.reports;
create policy "reports create" on public.reports for insert with check (auth.uid() = reporter_id and status = 'open');
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select using (auth.uid() = reporter_id or public.is_moderator(auth.uid()));
drop policy if exists "reports resolve" on public.reports;
create policy "reports resolve" on public.reports for update using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));

-- Content taken down by a moderator is hidden from everyone but its author.
alter table public.posts add column if not exists removed_at timestamptz;
alter table public.post_comments add column if not exists removed_at timestamptz;
drop policy if exists "posts visible" on public.posts;
create policy "posts visible" on public.posts for select using (
  auth.uid() = author_id or public.is_moderator(auth.uid())
  or (removed_at is null and public.can_view_post(auth.uid(), author_id, visibility)));
drop policy if exists "comments visible" on public.post_comments;
create policy "comments visible" on public.post_comments for select using (
  (removed_at is null or auth.uid() = author_id or public.is_moderator(auth.uid()))
  and exists (select 1 from public.posts p where p.id = post_id and public.can_view_post(auth.uid(), p.author_id, p.visibility)));

-- Moderators act through this one function rather than broad write access.
create or replace function public.moderate(report uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Moderators only'; end if;
  if action not in ('remove','suspend','remove_and_suspend','dismiss') then raise exception 'Unknown action'; end if;
  select * into r from public.reports where id = report;
  if not found then raise exception 'Report not found'; end if;
  if action in ('remove','remove_and_suspend') then
    if r.target_kind = 'post' then update public.posts set removed_at = now() where id = r.target_id;
    elsif r.target_kind = 'comment' then update public.post_comments set removed_at = now() where id = r.target_id;
    elsif r.target_kind = 'vehicle' then update public.vehicles set visibility = 'private' where id = r.target_id;
    elsif r.target_kind = 'photo' then delete from public.vehicle_photos where id = r.target_id;
    elsif r.target_kind = 'profile' then update public.profiles set bio = null, avatar_url = null, display_name = null, location = null where id = r.target_id;
    end if;
  end if;
  if action in ('suspend','remove_and_suspend') and r.target_owner_id is not null then
    update public.profiles set suspended_at = now() where id = r.target_owner_id and not is_moderator;
  end if;
  -- Resolve every open report about the same thing.
  update public.reports set status = case when action = 'dismiss' then 'dismissed' else 'actioned' end, resolved_by = auth.uid(), resolved_at = now()
    where target_kind = r.target_kind and target_id = r.target_id and status = 'open';
end $$;
revoke all on function public.moderate(uuid, text) from public, anon;
grant execute on function public.moderate(uuid, text) to authenticated;

-- Suspended accounts can't post, comment or like.
create or replace function public.not_suspended(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select suspended_at is null from public.profiles where id = uid), true);
$$;

-- ---------------------------------------------------------------------------
-- Posting rate limits (spam protection), enforced in the database.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; lim int; who uuid;
begin
  if tg_table_name = 'posts' then who := new.author_id; lim := 20;
    select count(*) into n from public.posts where author_id = who and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'post_comments' then who := new.author_id; lim := 60;
    select count(*) into n from public.post_comments where author_id = who and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'reports' then who := new.reporter_id; lim := 30;
    select count(*) into n from public.reports where reporter_id = who and created_at > now() - interval '1 day';
  elsif tg_table_name = 'friendships' then who := new.requester_id; lim := 50;
    select count(*) into n from public.friendships where requester_id = who and created_at > now() - interval '1 day';
  else return new; end if;
  if not public.not_suspended(who) then raise exception 'This account is suspended.' using errcode = 'P0001'; end if;
  if n >= lim then raise exception 'Slow down: you''ve hit the limit for now. Try again later.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists posts_rate on public.posts;
create trigger posts_rate before insert on public.posts for each row execute function public.rate_limit_guard();
drop trigger if exists comments_rate on public.post_comments;
create trigger comments_rate before insert on public.post_comments for each row execute function public.rate_limit_guard();
drop trigger if exists reports_rate on public.reports;
create trigger reports_rate before insert on public.reports for each row execute function public.rate_limit_guard();
drop trigger if exists friendships_rate on public.friendships;
create trigger friendships_rate before insert on public.friendships for each row execute function public.rate_limit_guard();

-- ---------------------------------------------------------------------------
-- Account deletion: removes the auth user, which cascades to every row the user owns.
-- Storage objects are removed by the API route before this runs.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Owners can't promote themselves, lift their own suspension, or un-remove moderated posts.
create or replace function public.guard_moderation_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role', true) in ('authenticated', 'anon') and not public.is_moderator(auth.uid()) then
    if tg_table_name = 'profiles' and (new.is_moderator is distinct from old.is_moderator or new.suspended_at is distinct from old.suspended_at) then
      raise exception 'Not allowed';
    end if;
    if tg_table_name in ('posts','post_comments') and new.removed_at is distinct from old.removed_at then raise exception 'Not allowed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_mod on public.profiles;
create trigger profiles_guard_mod before update on public.profiles for each row execute function public.guard_moderation_fields();
drop trigger if exists posts_guard_mod on public.posts;
create trigger posts_guard_mod before update on public.posts for each row execute function public.guard_moderation_fields();
drop trigger if exists comments_guard_mod on public.post_comments;
create trigger comments_guard_mod before update on public.post_comments for each row execute function public.guard_moderation_fields();
