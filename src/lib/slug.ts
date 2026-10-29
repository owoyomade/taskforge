const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Builds the URL slug for a new workspace, e.g. "Acme Studio" -> "acme-studio-k3x9qa".
 *
 * The random suffix means two teams can both be called "Design" without a
 * clash, and the slug doesn't reveal whether a workspace name is taken.
 * The output always matches the format enforced by the database.
 */
export function workspaceSlug(name: string, randomSuffix = randomSlugSuffix()): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "Café" -> "Cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  return base ? `${base}-${randomSuffix}` : `workspace-${randomSuffix}`;
}

export function randomSlugSuffix(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join("");
}
