# Deploying and running Taskforge

This guide takes Taskforge from your laptop to the internet using a hosted
Supabase project (database, sign-in, file storage) and Vercel (the web
app). It also covers monitoring, backups and how to ship later changes.

You need accounts at [supabase.com](https://supabase.com) and
[vercel.com](https://vercel.com). Both have free tiers; see "Free-tier
constraints" in [architecture.md](architecture.md) for what they allow.
Vercel's free Hobby plan is for non-commercial use only.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Next.js app | Vercel | Built from the GitHub repo on every push to `main` |
| Postgres, Row Level Security, scheduled jobs | Supabase | Schema comes from `supabase/migrations/` |
| Sign-in and auth emails | Supabase Auth | Needs your own email provider (SMTP) for real users |
| Avatars and attachments | Supabase Storage | Private buckets, created by the migrations |

The app only uses the **publishable** Supabase key. No secret or service
role key is needed anywhere, so there is none to leak.

## 1. Create the Supabase project

1. In the Supabase dashboard, create a new project. Pick the region
   closest to your users. Save the database password in a password manager.
   You'll need it for backups.
2. From this folder, link the project and apply the migrations:

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref your-project-ref
   ```

   ```bash
   npx supabase db push
   ```

   The project ref is the random id in your dashboard URL
   (`supabase.com/dashboard/project/<ref>`). `db push` creates every table,
   policy, function, storage bucket and the daily retention job.
   It does **not** load `seed.sql`. The demo accounts and their shared
   password must never exist in production.
3. Check the result:

   ```bash
   npx supabase db advisors --linked
   ```

   You should see no security warnings. "Unused index" notes are normal on
   a brand-new database.

## 2. Configure Supabase Auth

Local settings in `supabase/config.toml` are **not** copied to the hosted
project, so set these in the dashboard under **Authentication**:

- **URL Configuration:** set Site URL to your app's address (for example
  `https://taskforge.vercel.app`). Add `https://taskforge.vercel.app/**` to
  Redirect URLs. Update both if you later add a custom domain.
- **Sign In / Providers → Email:** keep "Confirm email" on. Set minimum
  password length to 8 and require letters and digits.
- **Emails → Templates:** paste the contents of
  `supabase/templates/confirmation.html` into "Confirm signup" and
  `supabase/templates/recovery.html` into "Reset password". These link to
  Taskforge's `/auth/confirm` page; the default templates don't.
- **Emails → SMTP Settings:** connect an email provider (Resend, Postmark,
  Amazon SES and others work). Supabase's built-in mailer only sends a few
  emails an hour, which is enough to test, not to launch.
- **Rate Limits:** keep the defaults. They limit sign-in attempts per IP
  address. (The local config raises nothing; tests work around the limit.)

## 3. Deploy the app on Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub
   repository. Vercel detects Next.js; keep the default build settings.
2. Under **Environment Variables**, add these for Production (and Preview
   if you'll use preview deployments):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | Your app's URL, e.g. `https://taskforge.vercel.app` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase: Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase: Project Settings → API Keys → Publishable key |

   `NEXT_PUBLIC_` values are built into the app, so after changing one,
   redeploy for it to take effect.
3. Deploy. If the URL Vercel gives you differs from what you entered in
   step 2 of the Supabase setup, update the Supabase Site URL and redeploy.

## 4. Check the live site

Do these once after the first deploy, and again after big changes:

```bash
curl -s https://your-app.vercel.app/api/health
```

That should print `{"status":"ok","database":"ok",...}`. Then:

```bash
curl -sI https://your-app.vercel.app/sign-in
```

The headers should include `content-security-policy` (with a `nonce-`),
`strict-transport-security`, `x-content-type-options: nosniff` and
`x-frame-options: DENY`.

In a browser:

1. Sign up with a real email address and confirm it from the email.
2. Create a project from a template, add a task, and drag it to another column.
3. Attach a small file to a task and download it again.
4. Invite a second address of yours, accept from that account, and check
   that each account only sees its own workspaces.
5. Open the browser console (F12). There should be no red
   "Content Security Policy" errors.

## Monitoring

- **Uptime:** point a free uptime monitor (for example UptimeRobot or Better
  Stack) at `https://your-app/api/health` every 5 minutes, and alert on
  anything other than HTTP 200. That endpoint checks the database too.
- **Errors:** every server error is logged as one line of JSON with
  `"level":"error"`, the route pattern and an error reference. In Vercel,
  open the project → **Logs**, and filter for `level":"error`. When a user
  reports a problem, ask for the "Error reference" shown on the error
  page and search the logs for it. Logs never contain passwords, tokens,
  task text or comment text.
- **Database:** the Supabase dashboard's **Reports** show CPU, disk and
  slow queries; **Advisors** shows security and performance warnings. Run
  `npx supabase db advisors --linked` after each migration.
- **Retention job:** in the SQL editor, check that the daily clean-up ran:

  ```sql
  select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 5;
  ```

## Backups and restore

On Supabase's free tier there are **no automatic backups you can
download**. The paid Pro plan adds daily backups and point-in-time
recovery. Until then, take your own backups, and always take one right
before `db push`.

Back up (you'll be asked for the database password):

```bash
mkdir -p backups && npx supabase db dump --linked -f backups/roles.sql --role-only
```

```bash
npx supabase db dump --linked -f backups/schema.sql
```

```bash
npx supabase db dump --linked -f backups/data.sql --use-copy --data-only
```

`backups/` is git-ignored. These files contain everyone's data, including
email addresses, so keep them somewhere private and encrypted, never in
the repository or a shared folder. Delete old ones you don't need.

The dump covers the database only. Uploaded files live in Storage; to keep
copies, download the `avatars` and `attachments` buckets from the
dashboard (or with the Supabase S3-compatible API).

Restore into a **new, empty** Supabase project (never over a live one).
Copy its connection string from the dashboard (**Connect** button) and run:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file backups/roles.sql --file backups/schema.sql --command 'SET session_replication_role = replica' --file backups/data.sql --dbname "postgresql://postgres:[YOUR-PASSWORD]@db.[NEW-REF].supabase.co:5432/postgres"
```

Then point the Vercel environment variables at the new project and
redeploy. Practise this once on a scratch project so it isn't new to you
on a bad day.

## Shipping changes

For each change:

1. Locally: `npm run check`, `npm run test:db` and `npm run test:e2e:fresh`.
   All must pass.
2. If there's a new migration: take a backup, then run `npx supabase db push`,
   then `npx supabase db advisors --linked`.
3. Push to GitHub. Vercel builds and deploys `main` automatically.
4. Check `/api/health` and the flow you changed.

**Rolling back.** If a deploy breaks the app, open the Vercel project →
**Deployments**, pick the last good one and choose **Instant Rollback**.
Database migrations don't roll back on their own. Write a new migration
that undoes the change, or, in a real emergency, restore a backup into a
new project as above. That's why the backup comes before `db push`.

## Data retention

A scheduled job (`taskforge-purge-expired-records`, daily at 03:17 UTC)
deletes:

- activity history older than 12 months,
- notifications read more than 90 days ago, and any older than 12 months,
- invitations that stopped working more than 90 days ago.

To change the periods, write a migration that replaces
`public.purge_expired_records()`. Tell your users what you keep and for how
long; see "Audit history" in [architecture.md](architecture.md).
