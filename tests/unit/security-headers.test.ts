import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce } from "@/lib/security-headers";

describe("contentSecurityPolicy", () => {
  it("only lets scripts with this request's nonce run", () => {
    const policy = contentSecurityPolicy({ nonce: "abc123", isDev: false });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy({ nonce: "n", isDev: true })).toContain("'unsafe-eval'");
  });

  it("only allows images from this site", () => {
    const policy = contentSecurityPolicy({ nonce: "n", isDev: false });
    expect(policy).toContain("img-src 'self' blob: data:;");
  });

  it("blocks framing, plugins and foreign form targets", () => {
    const policy = contentSecurityPolicy({ nonce: "n", isDev: false });
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });
});

describe("createNonce", () => {
  it("is different every time", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
