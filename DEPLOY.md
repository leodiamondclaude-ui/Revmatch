# Putting RevMatch live

This takes about an hour the first time. You need:

- a [Supabase](https://supabase.com) account (database, logins, file storage)
- a [Vercel](https://vercel.com) account (hosting)
- this GitHub repo

AI features and the phone app are optional extras at the end.

---

## 1. Supabase

1. **Create a project.** Pick a region near your users and save the database password.
2. **Apply the database schema.**
   - Option A, the Supabase CLI:

     ```bash
     npx supabase link --project-ref YOUR-PROJECT-REF
     ```

     ```bash
     npx supabase db push
     ```

   - Option B, by hand: in **SQL Editor**, run each file in `supabase/migrations/` in order (`0001` to `0007`).
3. **Check the storage buckets.** In **Storage**, check that `avatars`, `vehicle-photos` and `vehicle-models` exist. The first migration creates them.
4. **Authentication → Sign In / Providers → Email:**
   - Turn on **Confirm email**, so people must verify their address before they can sign in.
   - Set a minimum password length of 8 or more.
   - Optional: turn on leaked-password protection, if your plan has it.
5. **Authentication → URL Configuration:**
   - **Site URL:** `https://your-domain`
   - **Redirect URLs:** `https://your-domain/auth/callback`, plus `http://localhost:3000/auth/callback` for local development.
6. **Authentication → Emails → SMTP:** set up a real email sender (Resend, Postmark, SES and so on). Supabase's built-in sender only allows a handful of emails an hour and is meant for testing, so sign-up and password-reset emails will stop arriving without this.
7. **Authentication → Rate Limits:** the defaults are sensible. The database adds its own limits on posts, comments, reports, friend requests and invites.
8. **Optional: Authentication → Attack Protection → CAPTCHA** (hCaptcha or Turnstile). This needs a small change to the sign-up form to pass the token, so ask for it if you get bot sign-ups.
9. **Project Settings → API:** copy the **Project URL**, the **anon public key** and the **service_role key**. The service role key is secret: it only ever goes in Vercel, never in the phone app or in code.

## 2. Vercel

1. **Import the GitHub repo.** Vercel detects Next.js.
2. **Add environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (enables error tracking, the job queue and AI cost limits) |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain` |
   | `CRON_SECRET` | a long random string, e.g. from `openssl rand -hex 32` |
   | `NEXT_PUBLIC_OPERATOR_NAME` | your name or company (shown in the privacy policy and terms) |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | where people reach you about privacy and abuse |
   | `ERROR_WEBHOOK_URL` | optional: a Slack or Discord webhook for error alerts |

3. **Deploy, then add your domain** (Project → Settings → Domains).
4. **Check crons.** `vercel.json` schedules the job worker every 5 minutes and the model library every 30. Vercel Hobby only runs crons once a day: jobs still start straight away, but retries wait for the next run. Pro runs them on schedule.

## 3. Make yourself a moderator

Sign up on the live site, then run this in the Supabase SQL Editor:

```sql
update profiles set is_moderator = true where username = 'your_username';
```

A **Moderation** link appears in the sidebar, with reports and recent errors.

## 4. Legal

`/privacy` and `/terms` are written to match what the app does, but they are **templates**. Have a lawyer check them for the countries you launch in, especially for GDPR (EU and UK) and for users aged 16–17.

## 5. Backups

Add two repository secrets in GitHub (Settings → Secrets and variables → Actions):

- `SUPABASE_DB_URL`: Supabase → Connect → Session pooler connection string, with the password filled in.
- `BACKUP_PASSPHRASE`: a long random string. Keep a copy outside GitHub.

Then run **Actions → Database backup → Run workflow** once to check it works. Restore steps are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## 6. Optional: AI features

| Feature | Variables |
|---|---|
| Reading your four photos (colours, wheels, mods…) | `ANTHROPIC_API_KEY` |
| "Find my car": real 3D models | `ANTHROPIC_API_KEY` plus `SKETCHFAB_API_TOKEN` and/or `MESHY_API_KEY` |

Daily limits per user stop one person running up the bill. The defaults are 12 photo reads, 30 spec lookups and 3 model searches a day; change them with `AI_LIMIT_IDENTIFY`, `AI_LIMIT_LOOKUP` and `AI_LIMIT_AGENT`. Each service also needs a spending cap set on its own billing page.

To fill the model library ahead of time, open `/api/models/library/prewarm` with the header `Authorization: Bearer $CRON_SECRET`, or let the cron do it.

## 7. Optional: invite-only launch

To let in only people with an invite link or meet QR code:

```sql
update app_settings set value = 'true' where key = 'invite_only';
```

Set it back to `'false'` to open sign-ups.

## 8. Optional: phone app

See [mobile/README.md](mobile/README.md). The short version:

1. Put the Supabase URL, the anon key and your site URL in `mobile/.env`.
2. Run:

   ```bash
   npx eas-cli@latest build --profile preview
   ```

3. Install the build on your phone.

---

## Go-live test (do this on the real site)

CI already checks sign-up, invites, posting, likes, notifications, reports, blocking and data export against a local Supabase. These checks need the real thing: real email, a real phone and a real car.

1. **Sign up** with a real email address, confirm it from your inbox, then sign in.
2. **Forgot password**: the reset email arrives, and the new password works.
3. **Add a car**: take the four photos and check what was spotted. Add two mods by typing them, then publish. The car page should lead with your photos.
4. **Edit the car**: fill in a few build-sheet fields and a private note. Open the car page in a private window: the private note and VIN must **not** show.
5. **QR**: scan the car's QR code with another phone. It opens the public page.
6. **Invite**: make a friend link and sign up a second account with it. The two accounts should already be friends, and the first gets a notification.
7. **Social**: post from the second account, like it from the first, and comment. Bells update and the notifications page lists them.
8. **Report and block**: report the post from one account, and check it shows in **/moderation**. Remove it, and it disappears for others. Then block, and content is hidden both ways.
9. **Drive (web)**: record a short drive on your phone's browser, about 2 minutes in a car. The report shows the route, speed trace and distance.
10. **Drive (phone app, if built)**: start a drive and lock the phone for a few minutes. When you end it, it uploads and appears in **Drives** on the website.
11. **Account**: download your data and check the JSON has your car and drives. Then delete the second test account and check it can't sign in.
12. **Errors**: visit a broken URL, e.g. `/p/not-a-real-post`. It should show a friendly page. If you set up a webhook, real server errors ping you.
