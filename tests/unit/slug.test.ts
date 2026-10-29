import { describe, expect, it } from "vitest";

import { randomSlugSuffix, workspaceSlug } from "@/lib/slug";

// The same rule the database enforces in the workspaces.slug check constraint.
const DATABASE_SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("workspaceSlug", () => {
  it("turns a name into a lowercase, hyphenated slug with the suffix", () => {
    expect(workspaceSlug("Acme Studio", "k3x9qa")).toBe("acme-studio-k3x9qa");
  });

  it("strips accents and punctuation", () => {
    expect(workspaceSlug("Café & Co. — Design!", "abc234")).toBe("cafe-co-design-abc234");
  });

  it("falls back to a generic slug when the name has no usable characters", () => {
    expect(workspaceSlug("🚀🚀", "abc234")).toBe("workspace-abc234");
  });

  it("keeps long names within the database length limit without a trailing hyphen", () => {
    const slug = workspaceSlug("a".repeat(39) + " b" + "c".repeat(30), "abc234");
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug).toMatch(DATABASE_SLUG_FORMAT);
  });

  it.each(["Acme Studio", "  spaced   out  ", "Ünïcödé Team", "---", "123"])(
    "always produces a slug the database accepts for %j",
    (name) => {
      expect(workspaceSlug(name)).toMatch(DATABASE_SLUG_FORMAT);
    },
  );
});

describe("randomSlugSuffix", () => {
  it("produces lowercase letters and digits of the requested length", () => {
    expect(randomSlugSuffix(8)).toMatch(/^[a-z0-9]{8}$/);
  });
});
