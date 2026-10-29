import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps paths on this site, including query strings", () => {
    expect(safeRedirectPath("/w/acme-studio-k3x9qa/settings?tab=members")).toBe(
      "/w/acme-studio-k3x9qa/settings?tab=members",
    );
  });

  it.each([
    ["an absolute URL", "https://evil.example/login"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash trick", "/\\evil.example"],
    ["a relative path", "dashboard"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a hidden tab character", "/\t/evil.example"],
    ["an empty string", ""],
  ])("falls back for %s", (_label, input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("falls back for non-string input such as a missing form field", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/onboarding")).toBe("/onboarding");
  });
});
