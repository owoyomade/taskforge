type DatabaseError = { code?: string; message: string };

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Turns a Postgres error into a message that is safe to show users.
 *
 * Raw database errors can mention table names, constraints or SQL, so only
 * errors we raised ourselves (SQLSTATE TF001, see the migrations) pass
 * through verbatim. Everything else is logged server-side and replaced.
 */
export function toUserMessage(error: DatabaseError, context: string): string {
  switch (error.code) {
    case "TF001":
      return error.message;
    case "42501":
      return "You don't have permission to do that.";
    case "23505":
      return "That already exists. Please try a different value.";
    default:
      // Log the code and message only; never the submitted data.
      console.error(JSON.stringify({ level: "error", context, code: error.code, message: error.message }));
      return GENERIC_MESSAGE;
  }
}
