# Deploying and running Taskforge

This guide puts Taskforge on the internet for free:

| Piece | Service | Free plan notes |
| --- | --- | --- |
| Website, sign-in, scheduled clean-up | [Vercel](https://vercel.com) Hobby | For personal, non-commercial projects |
| Database | [Neon](https://neon.com) Postgres | Sleeps when idle; the first visit after a quiet spell takes a moment longer |
| Uploaded files (photos, attachments) | Vercel Blob, private store | About 1 GB of storage |
| Sign-up and password-reset emails | Your Gmail account | A few hundred emails a day |

You'll create the accounts yourself, and you'll type every password and
secret into the services yourself. Nothing secret goes into this
repository.

## 1. Create the Neon database

1. Sign up at neon.com (signing in with GitHub is easiest) and create a
   project. Pick the region closest to your users and **Postgres 17**, the
   version the local database uses.
2. On the project dashboard, click **Connect** and copy the connection
   string. It looks like
   `postgresql://neondb_owner:PASSWORD@ep-…-pooler.REGION.aws.neon.tech/neondb?sslmode=require`.
   That's the **owner** login. Keep it in your password manager.
3. Invent two strong passwords (20+ characters; a password manager can
   generate them). They're for the two logins the app uses:
   `taskforge_app` (the app) and `taskforge_auth` (the sign-in library).
4. In this folder, create a file named `.env.production.local`. It's
   git-ignored, so it stays on your computer. Put these lines in it, using
   your own values:

   ```bash
   DATABASE_OWNER_URL=postgresql://neondb_owner:OWNER-PASSWORD@HOST/neondb?sslmode=require
   DATABASE_URL=postgresql://taskforge_app:APP-PASSWORD@HOST/neondb?sslmode=require
   DATABASE_AUTH_URL=postgresql://taskforge_auth:AUTH-PASSWORD@HOST/neondb?sslmode=require
   ```

   `HOST` is the same in all three lines: the part after `@` and before
   `/neondb` in Neon's connection string.
5. Set up the database: it creates every table, rule and function, then
   lets the two logins sign in with your passwords. Demo data is **not**
   loaded. The demo accounts and their shared password must never exist in
   production.

   ```bash
   node --env-file=.env.production.local scripts/db.mts migrate
   ```

   ```bash
   node --env-file=.env.production.local scripts/db.mts roles
   ```

## 2. Prepare Gmail for sending

1. Your Google account needs 2-Step Verification on (Google Account →
   Security).
2. Create an app password: Google Account → Security → 2-Step Verification
   → App passwords. Name it "Taskforge". Google shows a 16-letter password
   once. Copy it into your password manager.

Emails will come from your Gmail address. For a portfolio that's fine. A
real product would use its own domain and an email service.

## 3. Deploy on Vercel

1. Sign up at vercel.com with GitHub. Choose **Add New → Project** and
   import the Taskforge repository. Keep the default build settings.
2. Before the first deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | Your site's address, e.g. `https://taskforge-yourname.vercel.app` |
   | `DATABASE_URL` | The `taskforge_app` line from step 1 |
   | `DATABASE_AUTH_URL` | The `taskforge_auth` line from step 1 |
   | `BETTER_AUTH_SECRET` | A new random value: `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | Your Gmail address |
   | `SMTP_PASSWORD` | The Gmail app password |
   | `EMAIL_FROM` | `Taskforge <your.address@gmail.com>` |
   | `CRON_SECRET` | Another random value (same command as above) |
   | `DEMO_PASSWORD` | Another random value. Turns on the "Try the demo" button; visitors never see it |

   Never add `DATABASE_OWNER_URL` to Vercel. The app doesn't need it, and
   it can do anything to the database.
3. Open the project's **Storage** tab, create a **Blob** store, choose
   **Private** access, and connect it to the project. Vercel adds
   `BLOB_READ_WRITE_TOKEN` for you.
4. Deploy. If Vercel gives you a different address from the one you put in
   `NEXT_PUBLIC_SITE_URL`, update that variable and redeploy: it's built
   into the app, and the emailed links use it.

The nightly job (`vercel.json`) is picked up automatically. Vercel calls
`/api/cron/purge` at 03:17 UTC with your `CRON_SECRET`; it deletes expired
records and rebuilds the demo workspace. The first click on **Try the
demo** builds the demo, so there's nothing to set up for it.

## 4. Check the live site

```bash
curl -s https://your-site.vercel.app/api/health
```

That should print `{"status":"ok","database":"ok",...}`. Then:

```bash
curl -sI https://your-site.vercel.app/sign-in
```

The headers should include `content-security-policy` (with a `nonce-`),
`strict-transport-security`, `x-content-type-options: nosniff` and
`x-frame-options: DENY`.

In a browser:

1. Sign up with a real email address and confirm it from the email.
2. Create a project from a template, add a task, and drag it to another column.
3. Upload a profile photo, attach a file to a task, and download it again.
4. Invite a second address of yours, accept from that account, and check
   that each account only sees its own workspaces.
5. Open the browser console (F12). There should be no red
   "Content Security Policy" errors.

## Monitoring

- **Uptime:** point a free uptime monitor (for example UptimeRobot or Better
  Stack) at `/api/health` every 5 minutes, and alert on anything but HTTP 200.
  Expect the odd slow answer after Neon has been asleep.
- **Errors:** every server error is logged as one line of JSON with
  `"level":"error"`, the route pattern and an error reference. In Vercel,
  open the project → **Logs** and filter for `level":"error`. When someone
  reports a problem, ask for the "Error reference" on the error page and
  search for it. Logs never contain passwords, tokens, task text or comment
  text.
- **Clean-up job:** Vercel → project → **Settings → Cron Jobs** shows each
  run; the log line `"context":"cron.purge"` says how much was removed.
- **Database:** Neon's console shows storage used and recent activity.

## Backups and restore

Neon keeps a short history you can restore from in its console (see its
docs for how far back the free plan goes). For your own copies, use the
standard Postgres tools (`brew install postgresql@17` provides them):

```bash
mkdir -p backups && pg_dump --no-owner --format=custom --file=backups/taskforge-$(date +%F).dump "$DATABASE_OWNER_URL"
```

Run it with the owner URL from `.env.production.local`. `backups/` is
git-ignored. Backups contain everyone's data, including email addresses,
so keep them private and encrypted, and delete old ones you don't need.

Restore into a **new, empty** Neon project (never over a live one), then
recreate the two logins and point Vercel at it:

```bash
pg_restore --no-owner --dbname="NEW-OWNER-URL" backups/taskforge-YYYY-MM-DD.dump
```

```bash
node --env-file=.env.production.local scripts/db.mts roles
```

(After editing the three URLs in `.env.production.local` to the new
project.) Uploaded files live in Vercel Blob, not in the dump.

## Shipping changes

For each change:

1. Locally: `npm run check`, `npm run test:db` and `npm run test:e2e:fresh`.
   All must pass.
2. If there's a new migration: take a backup, then
   `node --env-file=.env.production.local scripts/db.mts migrate`.
3. Push to GitHub. Vercel builds and deploys `main` automatically.
4. Check `/api/health` and the flow you changed.

**Rolling back.** If a deploy breaks the app, open Vercel → **Deployments**,
pick the last good one and choose **Instant Rollback**. Migrations don't
roll back on their own: write a new one that undoes the change, or restore
a backup into a new project. That's why the backup comes first.

## Data retention

The daily job deletes:

- activity history older than 12 months,
- notifications read more than 90 days ago, and any older than 12 months,
- invitations that stopped working more than 90 days ago.

To change the periods, write a migration that replaces
`public.purge_expired_records()`. Tell your users what you keep and for how
long; see "Audit history" in [architecture.md](architecture.md).
