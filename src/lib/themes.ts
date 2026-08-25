/**
 * The colourways, as data.
 *
 * ── "System" is not one of them ────────────────────────────────────────────
 * It was, and it was the bug: on a dark-mode machine the first two swatches
 * produced identical pages, because "follow the OS" and "dark" ARE the same
 * page when the OS is dark. Two of five controls that do nothing distinguishable
 * is not a subtle flaw — it reads as a broken toggle.
 *
 * They were never the same kind of thing. Four of these are palettes; system is
 * a MODE, a question about where the choice comes from. So the control now says
 * so: an auto switch, then the palettes, with a rule between them.
 *
 * ── The swatch colours necessarily mirror tokens.css ───────────────────────
 * Only one theme's custom properties are live at a time, so five simultaneous
 * previews cannot be read from the cascade. Keep these in step with each
 * block's `--surface-canvas` and `--brand`. A test asserts every id here has a
 * block there, which is the half that actually breaks.
 */

export type PaletteId = 'dark' | 'light' | 'linx' | 'carbon';
export type Theme = 'system' | PaletteId;

export interface Palette {
  id: PaletteId;
  label: string;
  hint: string;
  /** The real canvas colour. */
  bg: string;
  /** The real accent. */
  fg: string;
  /** True where the palette is a dark ground, so "auto" can point at one. */
  dark: boolean;
}

export const PALETTES: Palette[] = [
  { id: 'dark', label: 'Dark', hint: 'Dark', bg: '#0a0d12', fg: '#c8f751', dark: true },
  { id: 'light', label: 'Light', hint: 'Light', bg: '#f4f4f1', fg: '#6f9410', dark: false },
  { id: 'linx', label: 'Linx', hint: 'Linx — warm red and gold', bg: '#140708', fg: '#f0a52a', dark: true },
  { id: 'carbon', label: 'Carbon', hint: 'Carbon — red, black and shield yellow', bg: '#0a0a0b', fg: '#e2231a', dark: true },
];

export const PALETTE_IDS = PALETTES.map((p) => p.id);

/** Which palette "follow the system" is currently resolving to. */
export function resolvedBySystem(prefersDark: boolean): PaletteId {
  return prefersDark ? 'dark' : 'light';
}
