# Taskforge

A project management app for small teams: workspaces, projects, Kanban
boards and tasks, with each team's data kept strictly separate.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Supabase
(Postgres, Auth, Storage, Row Level Security).

> **Status:** Phase 2 of 5. Accounts, workspaces, roles, projects, Kanban
> boards and tasks work. Invitations, comments and attachments come next. See [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js 22 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (for the local Supabase stack)

The Supabase CLI is installed as a project dependency, so there's nothing
else to install globally.

## Getting started

```bash
npm install
npm run db:start        # starts Postgres, Auth, Storage and a test mail inbox in Docker
cp .env.example .env.local
```

Copy the **Publishable key** printed by `npm run db:start` into
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (run
`npm run db:status` to see it again). Then:

```bash
npm run db:reset        # applies migrations and loads demo data
npm run dev
```

Open http://localhost:3000.

### Local services

| Service | URL |
| --- | --- |
| App | http://localhost:3000 |
| Supabase Studio (database browser) | http://127.0.0.1:54323 |
| Mailpit (catches every email the app sends) | http://127.0.0.1:54324 |

### Demo accounts

`npm run db:reset` creates these local-only accounts, all with the password
`Password123`:

| Email | Workspace and role |
| --- | --- |
| alice@example.com | Acme Studio, owner |
| dave@example.com | Acme Studio, admin |
| carol@example.com | Acme Studio, viewer |
| bob@example.com | Bobcat Labs, owner (a separate tenant) |

Acme Studio also has a demo **Website relaunch** project with tasks, and a
private **Hiring plan** project that only Alice and Dave can see.

New sign-ups get a confirmation email, which appears in Mailpit.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode |
| `npm run check` | Typecheck, lint, unit tests and production build |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run test:db` | Database security tests (pgTAP); needs `db:start` |
| `npm run test:e2e` | Browser tests (Playwright) against a production build; needs `db:start` and `db:reset` |
| `npm run db:reset` | Rebuild the local database from migrations and seed data |
| `npm run db:types` | Regenerate TypeScript types from the local database |

The first time you run browser tests, install the browser with
`npx playwright install chromium`.

## Database changes

Schema changes are SQL files in `supabase/migrations/`, applied in filename
order. To add one:

```bash
npx supabase migration new describe_the_change
# edit the new file, then:
npm run db:reset && npm run db:types && npm run test:db
```

Every new tenant-owned table needs RLS enabled, policies, and pgTAP tests
proving that other workspaces can't read or change it.

## Project layout

See [docs/architecture.md](docs/architecture.md) for the folder structure,
data model, permission rules and threat model.
