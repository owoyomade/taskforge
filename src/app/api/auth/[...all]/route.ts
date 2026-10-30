import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/better-auth";

// The sign-in library's web endpoints: the links in confirmation and reset
// emails land here (/api/auth/verify-email, /api/auth/reset-password/...).
export const { GET, POST } = toNextJsHandler(auth);
