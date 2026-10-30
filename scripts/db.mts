/**
 * Database commands: npm run db:migrate | db:roles | db:reset | db:seed
 *
 * migrate  Applies every file in db/migrations that this database hasn't
 *          had yet, in filename order, each in its own transaction. Safe to
 *          run any number of times, locally or against production.
 * roles    Lets the app and the sign-in library log in, using the user name
 *          and password in DATABASE_URL and DATABASE_AUTH_URL. Run once per
 *          environment, and again after changing either password.
 * reset    LOCAL ONLY. Deletes the local database, recreates it, migrates,
 *          sets up the logins and loads db/seed.sql.
 * seed     LOCAL ONLY. Loads db/seed.sql into an already migrated database.
 *
 * Connects with DATABASE_OWNER_URL: the database owner, which migrations
 * need to create tables and roles. The defaults below are the local
 * Docker database's (see docker-compose.yml); production values come from
 * the environment and are never committed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const LOCAL_OWNER_URL = "postgres://postgres:postgres@127.0.0.1:5433/taskforge";
const LOCAL_APP_URL = "postgres://taskforge_app:taskforge_app@127.0.0.1:5433/taskforge";
const LOCAL_AUTH_URL = "postgres://taskforge_auth:taskforge_auth@127.0.0.1:5433/taskforge";
const MIGRATIONS_DIR = join(import.meta.dirname, "..", "db", "migrations");
const SEED_FILE = join(import.meta.dirname, "..", "db", "seed.sql");

const ownerUrl = process.env.DATABASE_OWNER_URL ?? LOCAL_OWNER_URL;

function isLocal(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function inTransaction(client: pg.Client, work: () => Promise<void>): Promise<void> {
  await client.query("begin");
  try {
    await work();
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function migrate(url: string): Promise<void> {
  await withClient(url, async (client) => {
    // Kept out of "public" so it isn't mistaken for app data (and needs no RLS).
    await client.query("create schema if not exists meta");
    await client.query(`create table if not exists meta.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);

    const { rows } = await client.query<{ version: string }>("select version from meta.schema_migrations");
    const applied = new Set(rows.map((row) => row.version));
    const pending = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql") && !applied.has(file))
      .sort();

    for (const file of pending) {
      // One transaction per file: a failing migration leaves no half-applied changes.
      await inTransaction(client, async () => {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
        await client.query("insert into meta.schema_migrations (version) values ($1)", [file]);
      });
      console.log(`applied ${file}`);
    }
    console.log(pending.length === 0 ? "Database is up to date." : `Applied ${pending.length} migration(s).`);
  });
}

/** Switches on login for one of the app's roles, with the password from its connection URL. */
async function enableLogin(client: pg.Client, expectedRole: string, connectionUrl: string): Promise<void> {
  const url = new URL(connectionUrl);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (role !== expectedRole) throw new Error(`Expected the user in this URL to be ${expectedRole}, not ${role}.`);
  if (password.length < 12 && !isLocal(connectionUrl)) throw new Error(`Use a password of at least 12 characters for ${role}.`);

  // format() quotes the name and password safely, so neither can change the statement.
  const { rows } = await client.query<{ statement: string }>(
    "select format('alter role %I with login password %L', $1::text, $2::text) as statement",
    [role, password],
  );
  await client.query(rows[0].statement);
  console.log(`${role} can now log in.`);
}

async function roles(url: string): Promise<void> {
  await withClient(url, async (client) => {
    await enableLogin(client, "taskforge_app", process.env.DATABASE_URL ?? LOCAL_APP_URL);
    await enableLogin(client, "taskforge_auth", process.env.DATABASE_AUTH_URL ?? LOCAL_AUTH_URL);
  });
}

async function seed(url: string): Promise<void> {
  await withClient(url, (client) =>
    inTransaction(client, async () => {
      await client.query(readFileSync(SEED_FILE, "utf8"));
    }),
  );
  console.log("Loaded demo data from db/seed.sql.");
}

async function reset(url: string): Promise<void> {
  const database = new URL(url).pathname.slice(1);
  // The name is pasted into the SQL text, so only a plain identifier is allowed.
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error(`Unexpected database name: ${database}`);

  // The maintenance database lets us drop and recreate the app's database.
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  await withClient(maintenance.toString(), async (client) => {
    await client.query(`drop database if exists "${database}" with (force)`);
    await client.query(`create database "${database}"`);
  });
  await migrate(url);
  await roles(url);
  await seed(url);
}

const command = process.argv[2];
if ((command === "reset" || command === "seed") && !isLocal(ownerUrl)) {
  console.error(`Refusing to ${command} ${new URL(ownerUrl).hostname}: that only runs against the local database.`);
  process.exit(1);
}

switch (command) {
  case "migrate":
    await migrate(ownerUrl);
    break;
  case "roles":
    await roles(ownerUrl);
    break;
  case "reset":
    await reset(ownerUrl);
    break;
  case "seed":
    await seed(ownerUrl);
    break;
  default:
    console.error("Usage: node scripts/db.mts migrate | roles | reset | seed");
    process.exit(1);
}
