import { describe, expect, it } from "vitest";

import { decodeMentions, encodeMentions, extractMentionIds, stripDisallowedMentions, toSegments } from "@/lib/mentions";

const DAVE = { id: "d4d4d4d4-0000-4000-8000-000000000004", name: "Dave Mensah" };
const ANA = { id: "a1a1a1a1-0000-4000-8000-000000000001", name: "Ana" };
const ANA_LEE = { id: "b2b2b2b2-0000-4000-8000-000000000002", name: "Ana Lee" };

describe("encodeMentions and decodeMentions", () => {
  it("turns picked names into tokens and back", () => {
    const stored = encodeMentions("Thanks @Dave Mensah!", [DAVE]);
    expect(stored).toBe(`Thanks @[Dave Mensah](${DAVE.id})!`);
    expect(decodeMentions(stored)).toEqual({ text: "Thanks @Dave Mensah!", people: [DAVE] });
  });

  it("matches the longest name first so similar names don't collide", () => {
    const stored = encodeMentions("@Ana Lee and @Ana", [ANA, ANA_LEE]);
    expect(stored).toBe(`@[Ana Lee](${ANA_LEE.id}) and @[Ana](${ANA.id})`);
  });

  it("only links names that were picked, and only whole names", () => {
    expect(encodeMentions("@Dave Mensahs desk", [DAVE])).toBe("@Dave Mensahs desk");
    expect(encodeMentions("@Dave Mensah", [])).toBe("@Dave Mensah");
  });
});

describe("toSegments", () => {
  it("splits text and mentions without interpreting any HTML", () => {
    const body = `<img src=x onerror=alert(1)> ping @[Dave Mensah](${DAVE.id})`;
    expect(toSegments(body)).toEqual([
      { type: "text", text: "<img src=x onerror=alert(1)> ping " },
      { type: "mention", userId: DAVE.id, label: "Dave Mensah" },
    ]);
  });

  it("ignores tokens whose id isn't a real uuid", () => {
    expect(toSegments("@[Root](../../admin)")).toEqual([{ type: "text", text: "@[Root](../../admin)" }]);
  });
});

describe("extractMentionIds and stripDisallowedMentions", () => {
  const body = `@[Dave Mensah](${DAVE.id}) @[Ana](${ANA.id}) @[Dave Mensah](${DAVE.id})`;

  it("lists each mentioned person once", () => {
    expect(extractMentionIds(body)).toEqual([DAVE.id, ANA.id]);
  });

  it("turns mentions of people who can't see the task into plain text", () => {
    const cleaned = stripDisallowedMentions(body, new Set([DAVE.id]));
    expect(extractMentionIds(cleaned)).toEqual([DAVE.id]);
    expect(cleaned).toContain(" @Ana ");
  });
});
