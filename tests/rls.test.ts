/**
 * Runs the real migration on PGlite (in-process Postgres) with minimal stubs of
 * Supabase's `auth` and `storage` schemas, then exercises RLS as different users.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const STUBS = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;
`;

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

async function setup() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const f of ["0001_init.sql", "0002_model_agent.sql", "0003_model_library.sql", "0004_build_sheet.sql", "0005_trust_safety.sql", "0006_notifications_invites.sql", "0007_jobs_errors.sql"]) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`
    grant usage on schema public, auth, storage to anon, authenticated;
    grant all on all tables in schema public to authenticated; grant select on all tables in schema public to anon;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public, auth to anon, authenticated;
    grant all on storage.objects to authenticated;
    -- Mirror the migrations' revokes (the blanket grant above would otherwise undo them).
    revoke execute on function public.notify(uuid, uuid, text, uuid, uuid), public.redeem_invite(uuid, text), public.claim_jobs(integer, interval) from anon, authenticated;`);
  for (const [id, u] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${u}@x.test`, JSON.stringify({ username: u })]);
  }
  return db;
}

/** Run SQL as an authenticated user (or anon when uid is null). */
async function as<T = Record<string, unknown>>(db: PGlite, uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.uid', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("reset role"); }
}
async function fails(p: Promise<unknown>) { await assert.rejects(p); }

test("RLS end to end", async (t) => {
  const db = await setup();

  await t.test("signup trigger creates profile + settings", async () => {
    const rows = await as(db, A, "select username from profiles where id = $1", [A]);
    assert.equal(rows[0].username, "alice");
    assert.equal((await as(db, A, "select count(*)::int n from user_settings")).at(0)!.n, 1);
    assert.equal((await as(db, B, "select count(*)::int n from user_settings")).at(0)!.n, 1, "only own settings visible");
  });

  let pub = "", priv = "", friendsOnly = "";
  await t.test("vehicle visibility", async () => {
    pub = (await as<{ id: string }>(db, A, `insert into vehicles (owner_id, make, model, visibility) values ($1,'Porsche','911','public') returning id`, [A]))[0].id;
    priv = (await as<{ id: string }>(db, A, `insert into vehicles (owner_id, make, model, visibility) values ($1,'BMW','M3','private') returning id`, [A]))[0].id;
    friendsOnly = (await as<{ id: string }>(db, A, `insert into vehicles (owner_id, make, model, visibility) values ($1,'Honda','S2000','friends') returning id`, [A]))[0].id;
    assert.equal((await as(db, null, "select id from vehicles")).length, 1, "anon (QR scan) sees only public");
    assert.equal((await as(db, B, "select id from vehicles")).length, 1);
    assert.equal((await as(db, A, "select id from vehicles")).length, 3);
    await fails(as(db, B, `insert into vehicles (owner_id, make, model) values ($1,'x','y')`, [A]));
    assert.equal((await as(db, B, `update vehicles set make='hacked' where id=$1 returning id`, [pub])).length, 0);
    await fails(as(db, B, `insert into modifications (vehicle_id, owner_id, category, name) values ($1,$2,'wheels','x')`, [pub, B]));
  });

  await t.test("blocks hide content both ways and end follows", async () => {
    const post = (await as<{ id: string }>(db, B, "insert into posts (author_id, body, visibility) values ($1,'bob public','public') returning id", [B]))[0].id;
    assert.equal((await as(db, A, "select id from posts where id=$1", [post])).length, 1);
    await as(db, A, "insert into follows (follower_id, following_id, status) values ($1,$2,'accepted') on conflict do nothing", [A, B]);
    await as(db, B, "insert into blocks (blocker_id, blocked_id) values ($1,$2)", [B, A]);
    assert.equal((await as(db, A, "select id from posts where id=$1", [post])).length, 0, "blocked user can't see the blocker's posts");
    assert.equal((await as(db, A, "select 1 from follows where follower_id=$1 and following_id=$2", [A, B])).length, 0, "block removed the follow");
    await fails(as(db, A, "insert into follows (follower_id, following_id, status) values ($1,$2,'accepted')", [A, B]));
    assert.equal((await as(db, A, "select blocker_id from blocks")).length, 0, "blocks are private to the blocker");
    await as(db, B, "delete from blocks where blocker_id=$1", [B]);
    assert.equal((await as(db, A, "select id from posts where id=$1", [post])).length, 1, "unblocking restores visibility");
  });

  await t.test("reports and moderation", async () => {
    const post = (await as<{ id: string }>(db, B, "insert into posts (author_id, body, visibility) values ($1,'spammy','public') returning id", [B]))[0].id;
    const rep = (await as<{ id: string }>(db, A, "insert into reports (reporter_id, target_kind, target_id, target_owner_id, reason) values ($1,'post',$2,$3,'spam') returning id", [A, post, B]))[0].id;
    assert.equal((await as(db, B, "select id from reports")).length, 0, "the reported person can't see reports");
    await fails(as(db, A, "select public.moderate($1, 'remove')", [rep]));
    await fails(as(db, C, "update profiles set is_moderator = true where id=$1", [C]));
    await db.query("update profiles set is_moderator = true where id=$1", [C]); // promoted by an admin directly
    assert.equal((await as(db, C, "select id from reports")).length, 1, "moderators see reports");
    await as(db, C, "select public.moderate($1, 'remove_and_suspend')", [rep]);
    assert.equal((await as(db, A, "select id from posts where id=$1", [post])).length, 0, "removed post is hidden");
    assert.equal((await as(db, B, "select id from posts where id=$1", [post])).length, 1, "its author still sees it");
    await fails(as(db, B, "update posts set removed_at = null where id=$1", [post]));
    await fails(as(db, B, "insert into posts (author_id, body) values ($1,'again')", [B]));
    await fails(as(db, B, "update profiles set suspended_at = null where id=$1", [B]));
    await db.query("update profiles set suspended_at = null where id=$1", [B]);
  });

  await t.test("posting is rate limited", async () => {
    // 20 posts an hour: the 21st fails
    await db.query("delete from posts where author_id=$1", [A]);
    for (let i = 0; i < 20; i++) await as(db, A, "insert into posts (author_id, body) values ($1,'p')", [A]);
    await fails(as(db, A, "insert into posts (author_id, body) values ($1,'one too many')", [A]));
    await db.query("delete from posts where author_id=$1", [A]);
  });

  await t.test("build sheet: private details are owner-only, private service entries hidden", async () => {
    await as(db, A, "insert into vehicle_private (vehicle_id, owner_id, vin, purchase_price) values ($1,$2,'WVWZZZ1FZ8V000001',30000)", [pub, A]);
    assert.equal((await as(db, A, "select vin from vehicle_private")).length, 1);
    assert.equal((await as(db, B, "select vin from vehicle_private")).length, 0, "nobody else reads VIN or price");
    await fails(as(db, B, "insert into vehicle_private (vehicle_id, owner_id, vin) values ($1,$2,'X')", [pub, B]));
    await as(db, A, "insert into build_events (vehicle_id, owner_id, title, kind, is_private) values ($1,$2,'Oil change','service',true), ($1,$2,'Best in show','award',false)", [pub, A]);
    assert.deepEqual((await as<{ title: string }>(db, B, "select title from build_events where vehicle_id=$1", [pub])).map((r) => r.title), ["Best in show"]);
    await as(db, A, "insert into modifications (vehicle_id, owner_id, category, name, status, source) values ($1,$2,'wheels','Forged wheels','planned','owner')", [pub, A]);
    await fails(as(db, A, "insert into modifications (vehicle_id, owner_id, category, name, status) values ($1,$2,'wheels','x','maybe')", [pub, A]));
  });

  await t.test("model library: everyone reads ready models, nobody writes", async () => {
    await db.exec(`insert into model_library (key, make, model, generation, year_from, year_to, status) values
      ('volkswagen|eos|1f','Volkswagen','Eos','1F',2007,2016,'ready'), ('ford|f150|14thgen','Ford','F-150','14th gen',2021,2026,'queued')`);
    assert.deepEqual((await as<{ model: string }>(db, A, "select model from model_library")).map((r) => r.model), ["Eos"], "queued entries stay hidden");
    assert.equal((await as(db, null, "select id from model_library")).length, 0, "signed-out visitors see none");
    await fails(as(db, A, "insert into model_library (key, make, model, year_from, year_to) values ('x','x','x',2020,2020)"));
    assert.equal((await as(db, A, "update model_library set status='ready' returning id")).length, 0);
    await fails(db.query("insert into model_library (key, make, model, year_from, year_to) values ('y','y','y',2021,2020)"));
    await as(db, A, "update vehicles set model_source='library' where id=$1", [pub]);
  });

  await t.test("friends-only vehicle opens after friendship accepted", async () => {
    await as(db, B, "insert into friendships (requester_id, addressee_id) values ($1,$2)", [B, A]);
    assert.equal((await as(db, B, "select id from vehicles where id=$1", [friendsOnly])).length, 0);
    await fails(as(db, B, "update friendships set status='accepted' where requester_id=$1", [B]).then((r) => { if (!r.length) throw new Error("no-op"); }));
    await as(db, A, "update friendships set status='accepted' where requester_id=$1 and addressee_id=$2", [B, A]);
    assert.equal((await as(db, B, "select id from vehicles where id=$1", [friendsOnly])).length, 1);
    assert.equal((await as(db, C, "select id from vehicles where id=$1", [friendsOnly])).length, 0);
    await fails(as(db, A, "insert into friendships (requester_id, addressee_id) values ($1,$2)", [A, B])); // duplicate pair
  });

  await t.test("private profile requires approved follow", async () => {
    await as(db, C, "update profiles set is_private=true where id=$1", [C]);
    await fails(as(db, A, "insert into follows (follower_id, following_id, status) values ($1,$2,'accepted')", [A, C]));
    await as(db, A, "insert into follows (follower_id, following_id, status) values ($1,$2,'pending')", [A, C]);
    await as(db, C, "insert into posts (author_id, body, visibility) values ($1,'hello','public')", [C]);
    assert.equal((await as(db, A, "select id from posts where author_id=$1", [C])).length, 0);
    assert.equal((await as(db, A, "select public.i_can_view_profile($1) ok", [C]))[0].ok, false);
    await as(db, C, "update follows set status='accepted' where follower_id=$1", [A]);
    assert.equal((await as(db, A, "select id from posts where author_id=$1", [C])).length, 1);
    assert.equal((await as(db, null, "select id from posts where author_id=$1", [C])).length, 0, "anon still blocked");
  });

  await t.test("drives: raw samples are owner-only, aggregates follow visibility", async () => {
    const d = (await as<{ id: string }>(db, A, `insert into drives (owner_id, vehicle_id, started_at, status, visibility, distance_m, duration_s, max_speed_mps)
      values ($1,$2,now(),'complete','friends',10000,600,30) returning id`, [A, pub]))[0].id;
    await as(db, A, "insert into drive_samples (drive_id, owner_id, t, lat, lng) values ($1,$2,now(),51.5,-0.1)", [d, A]);
    assert.equal((await as(db, A, "select id from drive_samples")).length, 1);
    assert.equal((await as(db, B, "select id from drive_samples")).length, 0, "friend can't read raw GPS");
    assert.equal((await as(db, B, "select id from drives where id=$1", [d])).length, 1, "friend sees friends drive");
    assert.equal((await as(db, C, "select id from drives where id=$1", [d])).length, 0);
    const st = await as<{ drives: string; distance_m: string }>(db, null, "select * from vehicle_public_stats($1)", [pub]);
    assert.equal(Number(st[0].drives), 1, "aggregate stats visible on public vehicle");
    assert.equal((await as(db, null, "select * from vehicle_public_stats($1)", [priv])).length, 0, "nothing for private vehicle");
    await as(db, A, "update vehicles set show_stats_public=false where id=$1", [pub]);
    assert.equal((await as(db, null, "select * from vehicle_public_stats($1)", [pub])).length, 0, "opt-out respected");
  });

  await t.test("likes/comments gated by post visibility", async () => {
    const p = (await as<{ id: string }>(db, A, "insert into posts (author_id, body, visibility) values ($1,'friends only','friends') returning id", [A]))[0].id;
    await as(db, B, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, B]);
    await fails(as(db, C, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, C]));
    await fails(as(db, B, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, A])); // can't like as someone else
    await as(db, B, "insert into post_comments (post_id, author_id, body) values ($1,$2,'nice')", [p, B]);
    const c = await as<{ likes: string; comments: string; liked: boolean }>(db, B, "select * from post_counts($1)", [[p]]);
    assert.equal(Number(c[0].likes), 1); assert.equal(Number(c[0].comments), 1); assert.equal(c[0].liked, true);
    assert.equal((await as(db, A, "delete from post_comments where post_id=$1 returning id", [p])).length, 1, "post author can moderate");
  });

  await t.test("notifications: likes, comments and requests notify the right person, once", async () => {
    await db.query("update profiles set is_private=false where id=$1", [C]);
    const p = (await as<{ id: string }>(db, C, "insert into posts (author_id, body, visibility) values ($1,'carol public','public') returning id", [C]))[0].id;
    await as(db, A, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, A]);
    await as(db, A, "delete from post_likes where post_id=$1 and user_id=$2", [p, A]);
    await as(db, A, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, A]);
    await as(db, A, "insert into post_comments (post_id, author_id, body) values ($1,$2,'clean')", [p, A]);
    await as(db, C, "insert into post_likes (post_id, user_id) values ($1,$2)", [p, C]); // own like: no notification
    const mine = await as<{ kind: string; actor_id: string }>(db, C, "select kind, actor_id from notifications where post_id=$1 order by created_at", [p]);
    assert.deepEqual(mine.map((n) => n.kind).sort(), ["comment", "like"], "re-like doesn't duplicate; own like is silent");
    assert.equal((await as(db, A, "select id from notifications where user_id=$1", [C])).length, 0, "others can't read them");
    await fails(as(db, A, "insert into notifications (user_id, actor_id, kind) values ($1,$2,'like')", [C, A]));
    await fails(as(db, C, "update notifications set kind='follow'"));
    assert.equal((await as(db, C, "update notifications set read_at=now() where post_id=$1 returning id", [p])).length, 2, "recipient marks read");
    await as(db, C, "update user_settings set notify='{\"like\": false}' where user_id=$1", [C]);
    const p2 = (await as<{ id: string }>(db, C, "insert into posts (author_id, body, visibility) values ($1,'again','public') returning id", [C]))[0].id;
    await as(db, A, "insert into post_likes (post_id, user_id) values ($1,$2)", [p2, A]);
    assert.equal((await as(db, C, "select id from notifications where post_id=$1", [p2])).length, 0, "opt-out respected");
  });

  await t.test("invites: personal links make friends, meet codes follow the host, limits hold", async () => {
    await as(db, A, "insert into invites (code, owner_id, kind) values ('ALICEFRIEND', $1, 'personal')", [A]);
    await as(db, A, "insert into invites (code, owner_id, kind, label, max_uses) values ('MEET2026', $1, 'meet', 'Cars & Coffee', 1)", [A]);
    await fails(as(db, B, "insert into invites (code, owner_id) values ('NOTMINE1', $1)", [A]));
    await fails(as(db, A, "update invites set uses = 99 where code='MEET2026'"));
    assert.equal((await as(db, B, "select code from invites")).length, 0, "invite list is owner-only");
    const info = await as<{ host_username: string; valid: boolean; label: string }>(db, null, "select * from invite_info('MEET2026')");
    assert.equal(info[0].host_username, "alice"); assert.equal(info[0].valid, true); assert.equal(info[0].label, "Cars & Coffee");

    const D = "00000000-0000-0000-0000-00000000000d", E = "00000000-0000-0000-0000-00000000000e", F = "00000000-0000-0000-0000-00000000000f";
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1,'d@x.test',$2)", [D, JSON.stringify({ username: "dave", invite: "ALICEFRIEND" })]);
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1,'e@x.test',$2)", [E, JSON.stringify({ username: "erin", invite: "MEET2026" })]);
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1,'f@x.test',$2)", [F, JSON.stringify({ username: "frank", invite: "MEET2026" })]);
    assert.equal((await as<{ ok: boolean }>(db, D, "select are_friends($1,$2) ok", [A, D]))[0].ok, true, "personal invite: already friends");
    assert.equal((await as(db, E, "select 1 from follows where follower_id=$1 and following_id=$2 and status='accepted'", [E, A])).length, 1, "meet invite: follows host");
    assert.equal((await as(db, F, "select 1 from follows where follower_id=$1 and following_id=$2", [F, A])).length, 0, "max_uses reached");
    assert.equal((await as<{ invited_by: string | null }>(db, F, "select invited_by from profiles where id=$1", [F]))[0].invited_by, null);
    assert.equal((await as<{ valid: boolean }>(db, null, "select valid from invite_info('MEET2026')"))[0].valid, false);
    const joined = await as<{ kind: string }>(db, A, "select kind from notifications where kind='invite_joined'");
    assert.equal(joined.length, 2, "host told when someone joins");

    await as(db, A, "update invites set revoked_at=now() where code='ALICEFRIEND'");
    assert.equal((await as<{ r: string }>(db, C, "select accept_invite('ALICEFRIEND') r"))[0].r, "invalid", "revoked link stops working");

    await db.exec("update app_settings set value='true' where key='invite_only'");
    await assert.rejects(db.query("insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'g@x.test','{\"username\":\"gina\"}')"));
    await db.exec("update app_settings set value='false' where key='invite_only'");
  });

  await t.test("jobs: claimed once, stale runs requeued then failed; errors readable by moderators only", async () => {
    const v = (await as<{ id: string }>(db, A, "insert into vehicles (owner_id, make, model) values ($1,'VW','Eos') returning id", [A]))[0].id;
    await fails(as(db, A, "insert into jobs (kind, owner_id, vehicle_id) values ('model_agent',$1,$2)", [A, v]));
    await db.exec("select set_config('request.uid', '', false)"); // the worker runs with the service role: no user
    await db.query("insert into jobs (kind, owner_id, vehicle_id) values ('model_agent',$1,$2)", [A, v]);
    await assert.rejects(db.query("insert into jobs (kind, owner_id, vehicle_id) values ('model_agent',$1,$2)", [A, v]), "one live job per car");
    await fails(as(db, A, "select * from claim_jobs(1)"));
    await db.exec("select set_config('request.uid', '', false)");
    const first = (await db.query<{ id: string; attempts: number }>("select * from claim_jobs(5)")).rows;
    assert.equal(first.length, 1); assert.equal(first[0].attempts, 1);
    assert.equal((await db.query("select * from claim_jobs(5)")).rows.length, 0, "a running job isn't claimed twice");
    await db.query("update jobs set locked_at = now() - interval '1 hour'");
    assert.equal((await db.query<{ attempts: number }>("select * from claim_jobs(5)")).rows[0].attempts, 2, "stale run is retried");
    await db.query("update jobs set locked_at = now() - interval '1 hour'");
    assert.equal((await db.query("select * from claim_jobs(5)")).rows.length, 0);
    assert.equal((await db.query<{ status: string }>("select status from jobs")).rows[0].status, "failed", "gives up after max_attempts");
    assert.equal((await as(db, A, "select id from jobs")).length, 1, "owner can see their job");
    assert.equal((await as(db, B, "select id from jobs")).length, 0);

    await db.query("insert into error_events (source, message) values ('server','boom')");
    await fails(as(db, A, "insert into error_events (source, message) values ('client','x')"));
    assert.equal((await as(db, A, "select id from error_events")).length, 0);
    assert.equal((await as(db, C, "select id from error_events")).length, 1, "moderator reads errors");
  });

  await t.test("storage writes limited to own folder", async () => {
    await as(db, A, "insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)", [`${A}/v/1.jpg`]);
    await fails(as(db, A, "insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)", [`${B}/v/1.jpg`]));
  });

  await t.test("FK names used by PostgREST embeds exist", async () => {
    const names = (await db.query<{ conname: string }>("select conname from pg_constraint where contype='f'")).rows.map((r) => r.conname);
    for (const n of ["posts_author_id_fkey", "post_comments_author_id_fkey", "friendships_requester_id_fkey", "friendships_addressee_id_fkey",
      "follows_follower_id_fkey", "follows_following_id_fkey", "vehicles_owner_id_fkey"]) assert.ok(names.includes(n), n);
  });

  await t.test("owner_id is immutable", async () => {
    await fails(as(db, A, "update vehicles set owner_id=$1 where id=$2", [B, pub]));
  });
});
