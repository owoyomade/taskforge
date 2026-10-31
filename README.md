# Taskforge

A project planner for people who are new to project management. Pick a
ready-made plan, set a finish date, and Taskforge lays out the phases and
tasks, then shows you what to do next. Each team's data is kept strictly
separate.

Built with Next.js, TypeScript, Tailwind CSS and shadcn/ui on plain
Postgres with Row Level Security, Better Auth for sign-in, and private file
storage (Vercel Blob in production). Everything runs on free tiers.

> **Status:** feature complete. Guided planning with 30 templates, phases
> shown as a journey, a "Do next" home page, Plan, Board, List and Timeline
> views, notifications, activity history, invitations, comments and
> attachments, plus security headers, accessibility checks, a health check
> and data retention. To put it online, follow
> [docs/deployment.md](docs/deployment.md). Design notes are in
> [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js 22 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
  (for the local database and mail inbox)

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:up           # starts Postgres 17 and Mailpit (docker-compose.yml)
npm run db:reset        # builds the database from db/migrations and loads demo data
npm run dev
```

Open http://localhost:3000. The values in `.env.example` already match the
local services; for `BETTER_AUTH_SECRET`, generate one with the command
shown in that file.

### Local services

| Service | Address |
| --- | --- |
| App | http://localhost:3000 |
| Mailpit (catches every email the app sends) | http://127.0.0.1:8025 |
| Database (any Postgres tool) | `postgres://postgres:postgres@127.0.0.1:5433/taskforge` |
| Health check | http://localhost:3000/api/health |

Uploaded files are saved in the git-ignored `.data/uploads` folder.

### Demo accounts

`npm run db:reset` creates these local-only accounts, all with the password
`Password123`:

| Email | Workspace and role |
| --- | --- |
| alice@example.com | Acme Studio, owner |
| dave@example.com | Acme Studio, admin |
| carol@example.com | Acme Studio, viewer |
| bob@example.com | Bobcat Labs, owner (a separate tenant) |
| erin@example.com | No workspace yet; has an open invitation to Acme Studio |

With `DEMO_PASSWORD` set, the sign-in and home pages also show **Try the
demo**, which signs visitors in to a shared "Demo Studio" workspace
(`src/lib/demo.ts`). It rebuilds itself every night; uploads, invitations,
password changes and deleting or leaving the workspace are turned off for it.

Acme Studio also has a demo **Website relaunch** project with tasks, and a
private **Hiring plan** project that only Alice and Dave can see.

Erin's invitation link is
http://localhost:3000/invite/0123456789abcdef0123456789abcdef0123456789abcdef

New sign-ups get a confirmation email, which appears in Mailpit.

### Invitations

Owners and admins invite people from workspace settings. The app emails
the invitation (locally it lands in Mailpit) and also shows the link to copy,
in case the email doesn't arrive. The invited person also sees the
invitation in the app once they sign in with that email address. Links expire after 7 days and only work for the invited
address.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode |
| `npm run check` | Typecheck, lint, unit tests and production build |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run test:db` | Database security tests (pgTAP); needs `db:up` |
| `npm run test:e2e` | Browser tests (Playwright) against a production build, then accessibility and security checks |
| `npm run test:e2e:fresh` | Resets the local database, then runs the browser tests (use this one; the tests expect fresh demo data) |
| `npm run db:up` / `db:down` | Start or stop the local database and mail inbox |
| `npm run db:migrate` | Apply any new files in `db/migrations` (safe to run repeatedly; also used for production) |
| `npm run db:roles` | Let the app's two database logins sign in, with the passwords in `DATABASE_URL` and `DATABASE_AUTH_URL` |
| `npm run db:reset` | Local only: rebuild the database from scratch and load demo data |

The first time you run browser tests, install the browser with
`npx playwright install chromium`.

## Database changes

Schema changes are SQL files in `db/migrations/`, applied in filename order
by `npm run db:migrate`, each in its own transaction. To add one, create a
file named with the date and a short description, for example
`db/migrations/20261110000100_add_task_estimates.sql`, then:

```bash
npm run db:reset && npm run test:db
```

Every new tenant-owned table needs RLS enabled, policies, and pgTAP tests
proving that other workspaces can't read or change it.

## Project layout

See [docs/architecture.md](docs/architecture.md) for the folder structure,
data model, permission rules and threat model.
