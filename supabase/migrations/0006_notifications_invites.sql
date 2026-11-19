-- Notifications (likes, comments, friend requests, follows, invite sign-ups) and invite codes / car-meet QR sign-ups.

-- ---------------------------------------------------------------------------
-- Notifications: written only by triggers, read and cleared by the recipient.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,      -- who gets it
  actor_id uuid references public.profiles(id) on delete cascade,              -- who did it
  kind text not null check (kind in ('like','comment','friend_request','friend_accept','follow','follow_request','invite_joined')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
-- One like/follow/request notification per person and post, so un-like/re-like doesn't spam.
create unique index if not exists notifications_once on public.notifications (user_id, actor_id, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind <> 'comment';

alter table public.notifications enable row level security;
drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications own mark" on public.notifications;
create policy "notifications own mark" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications own clear" on public.notifications;
create policy "notifications own clear" on public.notifications for delete using (auth.uid() = user_id);
-- Recipients may only flip read_at.
create or replace function public.guard_notification_update() returns trigger language plpgsql as $$
begin
  -- Applies to app users; the notification triggers (security definer) may reshape a row.
  if current_user in ('authenticated', 'anon') and (new.user_id <> old.user_id or new.actor_id is distinct from old.actor_id or new.kind <> old.kind
     or new.post_id is distinct from old.post_id or new.comment_id is distinct from old.comment_id or new.created_at <> old.created_at) then
    raise exception 'only read_at can change';
  end if;
  return new;
end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications for each row execute function public.guard_notification_update();

-- Per-kind opt-outs live in user_settings.
alter table public.user_settings add column if not exists notify jsonb not null default '{}'::jsonb;

create or replace function public.notify(recipient uuid, actor uuid, k text, post uuid default null, comment uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if recipient is null or recipient = actor then return; end if;
  if actor is not null and public.is_blocked(recipient, actor) then return; end if;
  if coalesce((select (notify->>k)::boolean from user_settings where user_id = recipient), true) = false then return; end if;
  insert into notifications (user_id, actor_id, kind, post_id, comment_id) values (recipient, actor, k, post, comment)
    on conflict do nothing;
end $$;
revoke execute on function public.notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.on_like_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author_id from posts where id = new.post_id), new.user_id, 'like', new.post_id);
  return new;
end $$;
drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert on public.post_likes for each row execute function public.on_like_notify();

create or replace function public.on_comment_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author_id from posts where id = new.post_id), new.author_id, 'comment', new.post_id, new.id);
  return new;
end $$;
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments for each row execute function public.on_comment_notify();

create or replace function public.on_friendship_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(new.addressee_id, new.requester_id, 'friend_request');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    perform public.notify(new.requester_id, new.addressee_id, 'friend_accept');
    -- The request is dealt with; clear it from the addressee's list.
    delete from notifications where user_id = new.addressee_id and actor_id = new.requester_id and kind = 'friend_request';
  end if;
  return new;
end $$;
drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify after insert or update on public.friendships for each row execute function public.on_friendship_notify();

create or replace function public.on_follow_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.following_id, new.follower_id, case when new.status = 'pending' then 'follow_request' else 'follow' end);
  elsif new.status = 'accepted' and old.status = 'pending' then
    update notifications set kind = 'follow', read_at = now()
      where user_id = new.following_id and actor_id = new.follower_id and kind = 'follow_request';
  end if;
  return new;
end $$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert or update on public.follows for each row execute function public.on_follow_notify();

-- Live bell updates (Supabase only; skipped where the publication doesn't exist).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Invites: personal links (sign up already friends with the inviter) and
-- car-meet QR codes (sign up following the host, tagged with the meet).
-- ---------------------------------------------------------------------------
create table if not exists public.invites (
  code text primary key check (code ~ '^[A-Za-z0-9]{6,16}$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'personal' check (kind in ('personal','meet')),
  label text check (label is null or char_length(label) <= 80),       -- meet name
  max_uses integer check (max_uses is null or max_uses between 1 and 5000),
  uses integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_owner_idx on public.invites (owner_id);
alter table public.invites enable row level security;
drop policy if exists "invites owner read" on public.invites;
create policy "invites owner read" on public.invites for select using (auth.uid() = owner_id);
drop policy if exists "invites owner create" on public.invites;
create policy "invites owner create" on public.invites for insert
  with check (auth.uid() = owner_id and uses = 0 and revoked_at is null and public.not_suspended(auth.uid())
    and (select count(*) from public.invites i where i.owner_id = auth.uid() and i.created_at > now() - interval '1 day') < 20);
drop policy if exists "invites owner revoke" on public.invites;
create policy "invites owner revoke" on public.invites for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create or replace function public.guard_invite_update() returns trigger language plpgsql as $$
begin
  -- Owners can only revoke, rename or change limits; uses is maintained by the signup trigger.
  if current_user in ('authenticated', 'anon') and (new.uses <> old.uses or new.code <> old.code or new.owner_id <> old.owner_id or new.kind <> old.kind) then
    raise exception 'invite fields are read-only';
  end if;
  return new;
end $$;
drop trigger if exists invites_guard on public.invites;
create trigger invites_guard before update on public.invites for each row execute function public.guard_invite_update();

alter table public.profiles add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists joined_via text references public.invites(code) on delete set null;

-- Site-wide switches readable by everyone (e.g. invite-only sign-ups). Change with SQL or the dashboard.
create table if not exists public.app_settings (key text primary key, value jsonb not null);
alter table public.app_settings enable row level security;
drop policy if exists "app settings readable" on public.app_settings;
create policy "app settings readable" on public.app_settings for select using (true);
insert into public.app_settings (key, value) values ('invite_only', 'false') on conflict do nothing;

/** Public view of an invite for the landing page: who sent it and whether it still works. No owner IDs. */
create or replace function public.invite_info(c text)
returns table (kind text, label text, host_username text, host_display_name text, host_avatar_url text, valid boolean)
language sql stable security definer set search_path = public as $$
  select i.kind, i.label, p.username, p.display_name, p.avatar_url,
    (i.revoked_at is null and (i.expires_at is null or i.expires_at > now()) and (i.max_uses is null or i.uses < i.max_uses) and p.suspended_at is null)
  from invites i join profiles p on p.id = i.owner_id where i.code = c;
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

create or replace function public.redeem_invite(new_user uuid, c text) returns void
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  select * into inv from invites where code = c for update;
  if not found or inv.revoked_at is not null or (inv.expires_at is not null and inv.expires_at <= now())
     or (inv.max_uses is not null and inv.uses >= inv.max_uses) or inv.owner_id = new_user then
    return;
  end if;
  update invites set uses = uses + 1 where code = c;
  update profiles set invited_by = inv.owner_id, joined_via = c where id = new_user;
  if inv.kind = 'personal' then
    insert into friendships (requester_id, addressee_id, status, responded_at) values (inv.owner_id, new_user, 'accepted', now()) on conflict do nothing;
  else
    insert into follows (follower_id, following_id, status) values (new_user, inv.owner_id, 'accepted') on conflict do nothing;
  end if;
  perform public.notify(inv.owner_id, new_user, 'invite_joined');
end $$;
revoke execute on function public.redeem_invite(uuid, text) from public, anon, authenticated;

-- Signup: honour invite_only and redeem any invite passed in the signup metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'gi'));
  candidate text;
  code text := nullif(new.raw_user_meta_data->>'invite', '');
begin
  if coalesce((select value::text::boolean from app_settings where key = 'invite_only'), false)
     and not exists (select 1 from public.invite_info(coalesce(code, '')) where valid) then
    raise exception 'RevMatch is invite-only right now. Ask a member for an invite link.';
  end if;
  if char_length(base) < 3 then base := base || 'driver'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    candidate := base || floor(random() * 10000)::int;
  end loop;
  insert into profiles (id, username, display_name)
    values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  insert into user_settings (user_id) values (new.id);
  if code is not null then perform public.redeem_invite(new.id, code); end if;
  return new;
end $$;

/** Existing members who scan a meet QR or open a friend's link while signed in. */
create or replace function public.accept_invite(c text) returns text
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into inv from invites where code = c;
  if not found or inv.revoked_at is not null or (inv.expires_at is not null and inv.expires_at <= now()) then return 'invalid'; end if;
  if inv.owner_id = me then return 'own'; end if;
  if public.is_blocked(me, inv.owner_id) then return 'invalid'; end if;
  if inv.kind = 'personal' then
    if exists (select 1 from friendships where least(requester_id, addressee_id) = least(me, inv.owner_id) and greatest(requester_id, addressee_id) = greatest(me, inv.owner_id)) then
      update friendships set status = 'accepted', responded_at = coalesce(responded_at, now())
        where least(requester_id, addressee_id) = least(me, inv.owner_id) and greatest(requester_id, addressee_id) = greatest(me, inv.owner_id);
    else
      insert into friendships (requester_id, addressee_id, status, responded_at) values (inv.owner_id, me, 'accepted', now());
      perform public.notify(inv.owner_id, me, 'friend_accept');
    end if;
    return 'friends';
  end if;
  insert into follows (follower_id, following_id, status) values (me, inv.owner_id, 'accepted')
    on conflict (follower_id, following_id) do update set status = 'accepted';
  return 'following';
end $$;
grant execute on function public.accept_invite(text) to authenticated;
