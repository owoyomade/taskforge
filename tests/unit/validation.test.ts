import { describe, expect, it } from "vitest";

import { resetPasswordSchema, signUpSchema, workspaceNameSchema } from "@/lib/validation";

describe("signUpSchema", () => {
  const valid = { fullName: "Ada Obi", email: "ada@example.com", password: "launch2026" };

  it("accepts a valid sign-up and normalises the email", () => {
    const result = signUpSchema.parse({ ...valid, email: "  Ada@Example.COM " });
    expect(result.email).toBe("ada@example.com");
  });

  it.each([
    ["too short", "abc123"],
    ["no number", "onlyletters"],
    ["no letter", "12345678"],
    ["over bcrypt's 72-byte limit", "a1".repeat(37)],
  ])("rejects a password that is %s", (_label, password) => {
    expect(signUpSchema.safeParse({ ...valid, password }).success).toBe(false);
  });

  it("rejects a blank name and an invalid email", () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: "   " }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("reports mismatched passwords on the confirmation field", () => {
    const result = resetPasswordSchema.safeParse({ password: "launch2026", confirmPassword: "launch2027" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

describe("workspaceNameSchema", () => {
  it("trims names and enforces the same 2-60 character limit as the database", () => {
    expect(workspaceNameSchema.parse({ name: "  Acme  " }).name).toBe("Acme");
    expect(workspaceNameSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(workspaceNameSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });
});
