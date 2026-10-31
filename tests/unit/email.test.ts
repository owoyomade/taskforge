import { describe, expect, it, vi } from "vitest";

// email.ts is server-only and reads SMTP settings when it loads; neither
// matters for building messages, so both are stubbed here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-env", () => ({ serverEnv: { SMTP_HOST: "localhost", SMTP_PORT: 1025, EMAIL_FROM: "Taskforge <test@example.com>" } }));

const { invitationMessage } = await import("@/lib/email");

const INVITE_URL = "https://taskforge.example/invite/0123456789abcdef0123456789abcdef0123456789abcdef";

describe("invitationMessage", () => {
  it("names the workspace, the inviter and the role, with the link in both versions", () => {
    const email = invitationMessage("ife@example.com", "Acme Studio", "Alice Adeyemi", "admin", INVITE_URL);

    expect(email.to).toBe("ife@example.com");
    expect(email.subject).toBe("Alice Adeyemi invited you to Acme Studio on Taskforge");
    expect(email.text).toContain("Alice Adeyemi invited you to join Acme Studio as an admin.");
    expect(email.text).toContain(INVITE_URL);
    expect(email.html).toContain(`href="${INVITE_URL}"`);
    expect(email.html).toContain("as an admin");
  });

  it("uses the right article for each role", () => {
    expect(invitationMessage("a@example.com", "W", "X", "member", INVITE_URL).text).toContain("as a member.");
    expect(invitationMessage("a@example.com", "W", "X", "viewer", INVITE_URL).text).toContain("as a viewer.");
  });

  it("escapes names in the HTML version instead of rendering them", () => {
    const email = invitationMessage("a@example.com", "<b>Acme</b>", '<a href="https://evil.example">Click</a>', "member", INVITE_URL);

    expect(email.html).not.toContain("<b>Acme</b>");
    expect(email.html).not.toContain("evil.example\">");
    expect(email.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    // Only one link: the invitation itself.
    expect(email.html.match(/<a /g)).toHaveLength(1);
  });

  it("keeps the subject on one line and copes with a missing inviter name", () => {
    const email = invitationMessage("a@example.com", "Acme\r\nBcc: someone@example.com", "  ", "member", INVITE_URL);

    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toBe("A teammate invited you to Acme Bcc: someone@example.com on Taskforge");
  });
});
