/**
 * @mentions in comments.
 *
 * Stored comments contain tokens like "@[Dave Mensah](d4d4…)". The person
 * typing only ever sees "@Dave Mensah": the composer turns the names they
 * picked into tokens when they post, and back into names when they edit.
 *
 * Comments are never treated as HTML. Rendering splits the text into plain
 * text pieces and mention pieces, and React escapes the text, so a comment
 * can't inject markup or scripts.
 */

export const MENTION_PATTERN =
  /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g;

export type CommentSegment = { type: "text"; text: string } | { type: "mention"; userId: string; label: string };

type Person = { id: string; name: string };

/** The distinct user ids mentioned in a stored comment. */
export function extractMentionIds(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(MENTION_PATTERN), (match) => match[2]))];
}

/** Splits a stored comment into text and mention pieces for display. */
export function toSegments(body: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let cursor = 0;
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (match.index > cursor) segments.push({ type: "text", text: body.slice(cursor, match.index) });
    segments.push({ type: "mention", label: match[1], userId: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) segments.push({ type: "text", text: body.slice(cursor) });
  return segments;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turns "@Name" into mention tokens for the people the author picked.
 * Longer names are matched first so "@Ana Lee" isn't mistaken for "@Ana".
 * A name only counts when it isn't followed by more letters or digits.
 */
export function encodeMentions(text: string, picked: Person[]): string {
  const people = [...picked].sort((a, b) => b.name.length - a.name.length);
  let result = text;
  for (const person of people) {
    // Brackets would break the token format, so they're dropped from labels.
    const label = person.name.replace(/[[\]()\n]/g, "").slice(0, 80);
    const pattern = new RegExp(`@${escapeRegExp(person.name)}(?![\\p{L}\\p{N}])(?!\\]\\()`, "gu");
    result = result.replace(pattern, `@[${label}](${person.id})`);
  }
  return result;
}

/** Turns stored tokens back into "@Name", returning the people mentioned. */
export function decodeMentions(body: string): { text: string; people: Person[] } {
  const people = new Map<string, Person>();
  const text = body.replace(MENTION_PATTERN, (_match, label: string, id: string) => {
    people.set(id, { id, name: label });
    return `@${label}`;
  });
  return { text, people: [...people.values()] };
}

/**
 * Removes mention tokens for anyone not in `allowedIds`, leaving their name
 * as plain text. Used on the server so people can only mention teammates
 * who can actually see the task.
 */
export function stripDisallowedMentions(body: string, allowedIds: Set<string>): string {
  return body.replace(MENTION_PATTERN, (token, label: string, id: string) => (allowedIds.has(id) ? token : `@${label}`));
}
