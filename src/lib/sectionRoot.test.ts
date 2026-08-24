import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sectionRoot, LIST_ROUTE } from './sectionRoot';

describe('sectionRoot', () => {
  it('keeps a list page where it is', () => {
    expect(sectionRoot('/table')).toBe('/table');
    expect(sectionRoot('/fixtures')).toBe('/fixtures');
    expect(sectionRoot('/')).toBe('/');
  });

  it('sends a detail page to its list route, not its path parent', () => {
    // The bug: these two used to resolve to /matches and /teams, which are not
    // routes. Both switchers rendered a control that 404'd.
    expect(sectionRoot('/matches/5795372')).toBe('/fixtures');
    expect(sectionRoot('/teams/10204')).toBe('/table');
    // This one IS its own parent, which is what made the bug easy to miss.
    expect(sectionRoot('/players/1251334')).toBe('/players');
  });
});

/**
 * The guard that stops this recurring.
 *
 * Walks the real route tree rather than trusting a hand-written list: every
 * dynamic segment must have a mapping, and every mapping must point at a route
 * that actually exists on disk.
 */
describe('every detail route has a reachable list route', () => {
  const appDir = join(process.cwd(), 'src/app');
  const sections = readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('(') && e.name !== 'api')
    .map((e) => e.name);

  const detailSections = sections.filter((s) =>
    readdirSync(join(appDir, s), { withFileTypes: true })
      .some((e) => e.isDirectory() && e.name.startsWith('[')),
  );

  it('finds the detail routes it expects to police', () => {
    expect(detailSections.sort()).toEqual(['matches', 'players', 'teams']);
  });

  it.each(detailSections)('%s maps to a route that exists', (section) => {
    const target = LIST_ROUTE[section];
    expect(target, `${section}/[id] has no LIST_ROUTE entry`).toBeDefined();
    const onDisk = join(appDir, target!.replace(/^\//, ''), 'page.tsx');
    expect(existsSync(onDisk), `${target} has no page.tsx`).toBe(true);
  });

  it('never maps a section to a bare directory with no page', () => {
    for (const [section, target] of Object.entries(LIST_ROUTE)) {
      const onDisk = join(appDir, target.replace(/^\//, ''), 'page.tsx');
      expect(existsSync(onDisk), `${section} -> ${target} is a dead link`).toBe(true);
    }
  });
});
