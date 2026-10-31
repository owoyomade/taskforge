import "server-only";

import { hashPassword, verifyPassword } from "better-auth/crypto";

import { getCurrentUser } from "@/lib/auth";
import { authPool } from "@/lib/better-auth";
import { addDays } from "@/lib/dates";
import { withUser, type Db } from "@/lib/db";
import { findTemplate } from "@/lib/templates/library";
import { weekStart } from "@/lib/workload";

/**
 * The public demo behind the "Try the demo" button.
 *
 * Every visitor signs in as the same demo account, so it's protected:
 * - its password is a server secret (DEMO_PASSWORD), so nobody can sign in
 *   to it through the normal form, change its password or lock it out;
 * - uploads, invitations, password changes and deleting or leaving the
 *   workspace are turned off for it (see isDemoEmail callers);
 * - resetDemo() rebuilds the workspace every night (and on first use).
 *
 * The two teammates have no password at all, so they can't be signed in to;
 * they exist so the demo shows assignments, comments and notifications.
 * Example.com addresses are reserved for examples, so nobody real gets mail.
 */
export const DEMO_EMAIL = "demo@example.com";
const DEMO_SLUG = "demo-studio";
const TEAMMATES = [
  { email: "sam.demo@example.com", name: "Sam Okoro" },
  { email: "priya.demo@example.com", name: "Priya Shah" },
] as const;

export function demoEnabled(): boolean {
  return (process.env.DEMO_PASSWORD?.length ?? 0) >= 16;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === DEMO_EMAIL;
}

/** True when the signed-in person is the shared demo account. */
export async function isDemoSession(): Promise<boolean> {
  return isDemoEmail((await getCurrentUser())?.email);
}

/** What the demo shows instead of doing something it doesn't allow. */
export const DEMO_BLOCKED = "That's turned off in the demo. Create your own free account to try it.";

/** Creates (or refreshes) an account directly in the auth tables, already verified. */
async function upsertAccount(email: string, name: string): Promise<string> {
  const { rows } = await authPool.query<{ id: string }>(
    `insert into auth.users (email, name, email_verified) values ($1, $2, true)
     on conflict (email) do update set name = excluded.name, email_verified = true
     returning id`,
    [email, name],
  );
  return rows[0].id;
}

/** Sets the demo account's password to DEMO_PASSWORD (a salted hash, as Better Auth stores it). */
async function setDemoPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  const client = await authPool.connect();
  try {
    await client.query("begin");
    await client.query("delete from auth.accounts where user_id = $1 and provider_id = 'credential'", [userId]);
    await client.query("insert into auth.accounts (user_id, account_id, provider_id, password) values ($1, $2, 'credential', $3)", [
      userId,
      userId,
      hash,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

const PROJECTS = [
  { template: "website-launch", name: "Website relaunch", color: "teal", finishInDays: 40 },
  { template: "team-offsite", name: "Spring team offsite", color: "amber", finishInDays: 55 },
  { template: "launch-campaign", name: "Product launch campaign", color: "violet", finishInDays: 30 },
] as const;

/** Moves the first `count` tasks of a project into its done column, so phases show real progress. */
async function finishFirstTasks(db: Db, projectId: string, count: number): Promise<void> {
  await db.query(
    `update public.tasks t set column_id = done.id
     from (select id from public.board_columns where project_id = $1 and is_done order by position limit 1) done
     where t.id in (select id from public.tasks where project_id = $1 and parent_task_id is null order by position limit $2)`,
    [projectId, count],
  );
}

/** Assigns every `step`-th open task to someone, starting at `offset`. */
async function assignTasks(db: Db, projectId: string, userId: string, offset: number, step: number): Promise<void> {
  await db.query(
    `insert into public.task_assignees (task_id, project_id, workspace_id, user_id)
     select t.id, t.project_id, t.workspace_id, $2
     from (
       select t.id, t.project_id, t.workspace_id, row_number() over (order by t.position) as n
       from public.tasks t join public.board_columns c on c.id = t.column_id
       where t.project_id = $1 and t.parent_task_id is null and not c.is_done
     ) t
     where (t.n - 1 - $3) % $4 = 0 and t.n > $3
     on conflict do nothing`,
    [projectId, userId, offset, step],
  );
}

/**
 * Rebuilds the demo from scratch: accounts, the "Demo Studio" workspace,
 * three projects at different stages, assignments, a comment and a
 * notification. Safe to run any time; visitors mid-session simply land in
 * the fresh copy.
 */
export async function resetDemo(): Promise<void> {
  const password = process.env.DEMO_PASSWORD;
  if (!password || !demoEnabled()) throw new Error("The demo is off: set DEMO_PASSWORD (16+ characters).");

  const demoId = await upsertAccount(DEMO_EMAIL, "Alex Rivera");
  await setDemoPassword(demoId, password);
  const teammateIds = await Promise.all(TEAMMATES.map((teammate) => upsertAccount(teammate.email, teammate.name)));
  const today = new Date().toISOString().slice(0, 10);

  // Start clean: every workspace the demo owns goes (projects, file records and members with it),
  // and a renamed profile gets its name back.
  const workspaceId = await withUser(demoId, async (db) => {
    await db.query("update public.profiles set full_name = 'Alex Rivera', avatar_path = null where id = $1", [demoId]);
    await db.query(
      "delete from public.workspaces where id in (select workspace_id from public.workspace_members where user_id = $1 and role = 'owner')",
      [demoId],
    );
    const [workspace] = await db.query<{ id: string }>("select (public.create_workspace('Demo Studio', $1)).id", [DEMO_SLUG]);
    return workspace.id;
  });

  // Teammates join through a real invitation, as a person would.
  for (const [index, teammate] of TEAMMATES.entries()) {
    const [invite] = await withUser(demoId, (db) =>
      db.query<{ invitation_id: string }>("select invitation_id from public.create_invitation($1, $2, 'member')", [workspaceId, teammate.email]),
    );
    await withUser(teammateIds[index], (db) => db.query("select public.respond_to_invitation($1, true)", [invite.invitation_id]));
  }

  const projectIds: string[] = [];
  for (const project of PROJECTS) {
    const template = findTemplate(project.template);
    if (!template) throw new Error(`Demo template missing: ${project.template}`);
    const [created] = await withUser(demoId, (db) =>
      db.query<{ id: string }>(
        `select (public.create_project_from_template(
           target_workspace => $1, project_name => $2, project_description => $3, project_visibility => 'workspace',
           project_color => $4, finish_date => $5, template => $6::jsonb
         )).id`,
        [workspaceId, project.name, template.summary, project.color, addDays(today, project.finishInDays), JSON.stringify(template.definition)],
      ),
    );
    projectIds.push(created.id);
  }

  await withUser(demoId, async (db) => {
    // Different stages: one well under way, one just started, one in the middle.
    await finishFirstTasks(db, projectIds[0], 5);
    await finishFirstTasks(db, projectIds[1], 1);
    await finishFirstTasks(db, projectIds[2], 3);
    for (const projectId of projectIds) {
      await assignTasks(db, projectId, demoId, 0, 3);
      await assignTasks(db, projectId, teammateIds[0], 1, 3);
      await assignTasks(db, projectId, teammateIds[1], 2, 3);
    }
  });

  await withUser(demoId, (db) => createCrunch(db, teammateIds[0], teammateIds[1], projectIds[0], today));

  // A teammate's comment mentioning the demo user puts something in the inbox.
  await withUser(teammateIds[0], async (db) => {
    const [task] = await db.query<{ id: string; project_id: string; workspace_id: string }>(
      `select t.id, t.project_id, t.workspace_id from public.task_assignees a join public.tasks t on t.id = a.task_id
       where a.user_id = $1 and t.project_id = $2 order by t.position limit 1`,
      [demoId, projectIds[0]],
    );
    if (!task) return;
    const [comment] = await db.query<{ id: string }>(
      "insert into public.comments (workspace_id, project_id, task_id, author_id, body) values ($1, $2, $3, $4, $5) returning id",
      [task.workspace_id, task.project_id, task.id, teammateIds[0], `@[Alex Rivera](${demoId}) could you take a look before Friday? Happy to pair on it.`],
    );
    await db.query("insert into public.comment_mentions (comment_id, project_id, workspace_id, user_id) values ($1, $2, $3, $4)", [
      comment.id,
      task.project_id,
      task.workspace_id,
      demoId,
    ]);
  });
}

/**
 * Gives the workload radar something real to show: next week, Sam has more
 * open tasks due than the default capacity of 5, and one task due in two
 * days has nobody on it. Everything else keeps its template dates.
 */
async function createCrunch(db: Db, samId: string, priyaId: string, projectId: string, today: string): Promise<void> {
  const nextMonday = addDays(weekStart(today), 7);
  const samsTasks = await db.query<{ id: string }>(
    `select t.id from public.task_assignees a
     join public.tasks t on t.id = a.task_id
     join public.board_columns c on c.id = t.column_id
     where a.user_id = $1 and t.parent_task_id is null and not c.is_done
     order by t.due_date nulls last, t.position
     limit 7`,
    [samId],
  );
  for (const [index, task] of samsTasks.entries()) {
    // Monday to Friday. A start date after the new due date is cleared, so the
    // "due on or after start" rule still holds.
    const due = addDays(nextMonday, index % 5);
    await db.query(
      "update public.tasks set due_date = $2, start_date = case when start_date > $2 then null else start_date end where id = $1",
      [task.id, due],
    );
  }

  // Every open demo task starts with someone on it, so one of Priya's last
  // tasks in the first project is handed back to nobody.
  const [loose] = await db.query<{ id: string }>(
    `select t.id from public.task_assignees a
     join public.tasks t on t.id = a.task_id
     join public.board_columns c on c.id = t.column_id
     where a.user_id = $2 and t.project_id = $1 and t.parent_task_id is null and not c.is_done
     order by t.position desc
     limit 1`,
    [projectId, priyaId],
  );
  if (loose) {
    const due = addDays(today, 2);
    await db.query("delete from public.task_assignees where task_id = $1", [loose.id]);
    await db.query(
      "update public.tasks set due_date = $2, start_date = case when start_date > $2 then null else start_date end where id = $1",
      [loose.id, due],
    );
  }
}

/**
 * True once the demo workspace exists and the account still has the current
 * DEMO_PASSWORD, so the first click on a fresh site, or after the password
 * was changed, sets it up again instead of failing to sign in.
 */
export async function demoIsReady(): Promise<boolean> {
  const { rows } = await authPool.query<{ id: string; password: string | null }>(
    `select u.id, a.password from auth.users u
       left join auth.accounts a on a.user_id = u.id and a.provider_id = 'credential'
      where u.email = $1`,
    [DEMO_EMAIL],
  );
  const demoId = rows[0]?.id;
  const hash = rows[0]?.password;
  const password = process.env.DEMO_PASSWORD;
  if (!demoId || !hash || !password || !(await verifyPassword({ hash, password }))) return false;
  const [workspace] = await withUser(demoId, (db) =>
    db.query<{ ready: boolean }>("select exists (select 1 from public.workspaces where slug = $1) as ready", [DEMO_SLUG]),
  );
  return workspace?.ready ?? false;
}
