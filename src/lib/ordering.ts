/**
 * Fractional ordering for board columns and tasks.
 *
 * Each item stores a number, and lists are sorted by it. To put an item
 * between two neighbours we give it the midpoint of their numbers, so a
 * drag-and-drop move updates exactly one row instead of renumbering the
 * whole list (which would clash with anyone else editing the same board).
 */

export const POSITION_STEP = 1000;

// Doubles run out of precision after roughly 50 halvings of the same gap.
// Long before that, we renumber the list evenly.
const MIN_GAP = 1e-6;

/** Position for an item placed after `before` and ahead of `after` (either may be missing). */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + POSITION_STEP;
  if (after !== undefined) return after - POSITION_STEP;
  return POSITION_STEP;
}

/** True when two neighbours are so close that a midpoint would lose precision. */
export function needsRebalance(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after - before < MIN_GAP;
}

/** Evenly spaced positions for `count` items: 1000, 2000, 3000, ... */
export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_STEP);
}

/**
 * The position for moving `itemId` to `targetIndex` within `orderedIds`
 * (which may or may not already contain the item).
 */
export function positionForIndex(
  orderedItems: { id: string; position: number }[],
  itemId: string,
  targetIndex: number,
): { position: number; rebalance: boolean } {
  const others = orderedItems.filter((item) => item.id !== itemId);
  const index = Math.max(0, Math.min(targetIndex, others.length));
  const before = others[index - 1]?.position;
  const after = others[index]?.position;
  return { position: positionBetween(before, after), rebalance: needsRebalance(before, after) };
}
