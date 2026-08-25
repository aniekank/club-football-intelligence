import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTES, PALETTE_IDS, resolvedBySystem } from './themes';

/**
 * Two ways a theme toggle lies, both of which shipped.
 *
 * The visible one: "system" sat in the swatch row, so on a dark-mode machine
 * the first two controls produced identical pages. That is a design fix, and
 * the assertion here is only that system is no longer one of the palettes.
 *
 * The invisible one is worse. The light block was scoped
 * `:not([data-theme='dark'])`, which excluded exactly one explicit theme and
 * let the OS override every other. Linx and Carbon define 37 tokens and inherit
 * the rest, so on a light-mode machine they rendered a warm dark canvas with 66
 * LIGHT tokens under it — every competition accent among them. Nothing throws,
 * nothing logs, and it only appears on a machine set the other way from the one
 * you are working on.
 */

const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('every palette the control offers exists in the stylesheet', () => {
  it('has a block for each id', () => {
    for (const id of PALETTE_IDS) {
      // Dark is the base palette AND names itself in the selector, precisely so
      // that "no attribute" cannot be confused with "no block".
      expect(tokens, `no [data-theme='${id}'] block`).toContain(`[data-theme='${id}']`);
    }
  });

  it('does not offer system as a palette', () => {
    expect(PALETTE_IDS).not.toContain('system' as never);
    expect(PALETTES.every((p) => p.id !== ('system' as never))).toBe(true);
  });

  it('previews each palette with a real canvas and a real accent', () => {
    for (const p of PALETTES) {
      expect(p.bg, p.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.fg, p.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.bg.toLowerCase(), `${p.id} previews its ground as its accent`).not.toBe(p.fg.toLowerCase());
    }
  });

  it('gives the three dark grounds three different accents', () => {
    // They are all near-black, so the accent is the ONLY thing separating them.
    const accents = PALETTES.filter((p) => p.dark).map((p) => p.fg.toLowerCase());
    expect(new Set(accents).size).toBe(accents.length);
  });
});

describe('an explicit choice beats the operating system', () => {
  it('scopes the light block against ANY data-theme, not just dark', () => {
    const media = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: light)'));
    const selector = media.slice(0, media.indexOf('{', media.indexOf('{') + 1));
    expect(selector).toContain(':not([data-theme])');
    // The old guard named one theme and let the OS repaint the others.
    expect(selector).not.toContain("[data-theme='dark']");
  });

  it('leaves partial palettes inheriting the dark base, not the light one', () => {
    // Linx and Carbon deliberately redefine only their core; the guard above is
    // what makes the remainder fall back to a dark floor. If either ever grew
    // to define everything this test would still pass — it is the guard that
    // matters, and that is asserted above. This one documents the dependency.
    const linx = tokens.slice(tokens.indexOf("[data-theme='linx']"));
    const block = linx.slice(0, linx.indexOf('\n}'));
    const defined = (block.match(/--[a-z0-9-]+\s*:/g) ?? []).length;
    const base = (tokens.slice(0, tokens.indexOf('@media')).match(/--[a-z0-9-]+\s*:/g) ?? []).length;
    expect(defined).toBeGreaterThan(0);
    expect(defined).toBeLessThan(base);
  });
});

describe('auto reports what it resolved to', () => {
  it('names a real palette either way', () => {
    expect(PALETTE_IDS).toContain(resolvedBySystem(true));
    expect(PALETTE_IDS).toContain(resolvedBySystem(false));
    expect(resolvedBySystem(true)).not.toBe(resolvedBySystem(false));
  });
});
