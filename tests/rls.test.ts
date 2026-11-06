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
  await db.exec(readFileSync("supabase/migrations/0001_init.sql", "utf8"));
  await db.exec(`
    grant usage on schema public, auth, storage to anon, authenticated;
    grant all on all tables in schema public to authenticated; grant select on all tables in schema public to anon;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public, auth to anon, authenticated;
    grant all on storage.objects to authenticated;`);
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
