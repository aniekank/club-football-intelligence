import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A two-file invariant, guarded.
 *
 * Sticky table headers only work when no ancestor is horizontally scrollable:
 * `overflow-x: auto` forces `overflow-y` to become a scroll container, the
 * sticky offset then measures from that wrapper rather than the viewport, and
 * the column labels land on top of row 2 instead of pinning to the header.
 *
 * So the CSS rule and the wrapper that stands down are one decision written in
 * two places, and they have to move together. This shipped broken twice in one
 * sitting — once at every width, then once on mobile only — which is exactly
 * the kind of thing a screenshot catches and a unit test usually does not.
 */
const root = process.cwd();
const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8');
const table = readFileSync(join(root, 'src/components/table/LeagueTable.tsx'), 'utf8');

const BREAKPOINT = '1024px';

describe('sticky table header', () => {
  it('is gated behind a min-width media query', () => {
    const i = css.indexOf('.table-sticky-head thead th');
    expect(i, '.table-sticky-head rule not found').toBeGreaterThan(-1);
    // Walk back to the nearest enclosing at-rule and check it is the gate.
    const before = css.slice(0, i);
    const lastMedia = before.lastIndexOf('@media');
    const lastClose = before.lastIndexOf('}\n  }');
    expect(lastMedia, 'rule is not inside a @media block').toBeGreaterThan(lastClose);
    expect(before.slice(lastMedia)).toContain(`min-width: ${BREAKPOINT}`);
  });

  it('releases the horizontal-scroll wrapper at the same breakpoint', () => {
    // lg is Tailwind's 1024px — the same number as the media query above.
    expect(table).toContain('lg:overflow-visible');
  });

  it('still gives narrow viewports a horizontally scrollable table', () => {
    expect(table).toMatch(/scroll-x lg:overflow-visible/);
  });
});
