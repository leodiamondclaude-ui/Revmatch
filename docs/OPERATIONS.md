# Running RevMatch

What keeps the app healthy once it's live, and what to do when something goes wrong.

## Errors

- **Server errors** (pages, API routes, server actions) are caught by `src/instrumentation.ts`.
- **Browser crashes** are caught by `src/app/error.tsx` and `global-error.tsx`, which post to `/api/errors`. That route is throttled to 10 reports per minute per IP.
- **Failed background jobs** are recorded by the job runner.
- Every error goes to the server log. With `SUPABASE_SERVICE_ROLE_KEY` set, it's also saved to the `error_events` table, which keeps 30 days.
- Moderators see the latest 25 errors at the bottom of **/moderation**.
- To get pinged, set `ERROR_WEBHOOK_URL` to a Slack or Discord incoming webhook. The message is posted as both `text` and `content`, so either service accepts it.
- To make someone a moderator, run this in the SQL editor: `update profiles set is_moderator = true where username = '…';`

## Background jobs

"Find my car" (the model agent) takes several minutes, so the web request doesn't run it.

1. The request adds a row to `jobs`.
2. It kicks the worker straight away.
3. `/api/jobs/run` (Vercel Cron, every 5 minutes) picks up anything left over.

If a worker dies mid-run, the job is retried after 20 minutes. After 2 attempts it's marked failed, and the car shows "failed" with a retry button instead of spinning forever.

- `JOB_BATCH` sets how many jobs one cron tick runs (1–3, default 2).
- Both cron routes need `CRON_SECRET`, which Vercel sends automatically.
- Vercel Hobby only runs crons once a day. On Hobby, jobs still start immediately, but leftovers wait until the next daily run.

## Backups

`.github/workflows/backup.yml` dumps roles, schema and data every night. The dump is encrypted with GPG and kept for 30 days as a workflow artifact.

To turn it on, add two repository secrets:

- `SUPABASE_DB_URL`: Project Settings → Database → Connection string, session pooler, with the password filled in.
- `BACKUP_PASSPHRASE`: a long random string. Keep a copy somewhere other than GitHub; without it the backups can't be opened.

Run it once by hand (Actions → Database backup → Run workflow) to check it works.

Supabase's own backups depend on your plan: Pro has daily backups, and point-in-time recovery is a paid add-on. Free has none you can download, so the workflow above is the safety net.

Uploaded photos and 3D models live in Supabase Storage and are **not** in the database dump. For those, use Supabase's storage backups on paid plans, or sync the buckets yourself with the S3-compatible API.

### Restore

1. Download the artifact, then decrypt and unpack it:

   ```bash
   gpg -d revmatch-YYYY-MM-DD.tgz.gpg > backup.tgz
   ```

   ```bash
   tar xzf backup.tgz
   ```

2. Restore into a **new** Supabase project. Never restore over the live one.

   ```bash
   psql "$NEW_DB_URL" -f backup/roles.sql -f backup/schema.sql -c 'SET session_replication_role = replica' -f backup/data.sql
   ```

3. Point a preview deployment at the new project, check it, then switch production over.

## Tests

- `npm test` runs the real migrations on in-process Postgres and checks every access rule: who can see and change what, blocks, moderation, rate limits, notifications, invites and jobs.
- `npm run e2e` runs browser tests against a production build. Run `npm run build` first.
  - `e2e/smoke.spec.ts` runs anywhere.
  - `e2e/flow.spec.ts` needs a real Supabase and `E2E_FULL=1`. It covers two people signing up through an invite, posting, liking, notifications, reporting, blocking and data export.
- CI (`.github/workflows/ci.yml`) runs everything on each push. The full flow runs against a local Supabase started with `supabase start`.
