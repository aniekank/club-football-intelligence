/**
 * Club colour, made safe to paint with.
 *
 * Club colours arrive from the feed and are not ours to choose. Across
 * thirty-six competitions they include near-white (Real Madrid, Fulham,
 * Derby), near-black (Juventus, Newcastle) and full-chroma yellow — so
 * anything that paints with them unguarded will, somewhere in the product,
 * wash out a card or vanish into it.
 *
 * The guard is deliberately not "clamp the colour to a safe one". Shifting
 * Real Madrid's white until it passes a contrast ratio produces a grey that is
 * no longer Real Madrid's, which defeats the point of using it. Instead the
 * ALPHA is scaled by how light the colour is: a dark club colour can be laid on
 * fairly strongly over a dark card, a near-white one is dropped to a whisper.
 * The hue stays true and the surface stays legible.
 */

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * A club colour as an `rgba()` wash, with alpha reduced for light colours.
 *
 * `max` is the alpha a dark club colour gets. A white one lands near a fifth of
 * it, which is still visible as a tint and cannot lift the surface enough to
 * hurt the text above it.
 */
export function clubWash(hex: string | null, max = 0.3): string {
  if (!hex) return 'transparent';
  const rgb = parseHex(hex);
  if (!rgb) return 'transparent';
  const l = luminance(rgb);
  // Full strength up to mid-grey, then falling away to 20% at pure white.
  const scale = l <= 0.35 ? 1 : Math.max(0.2, 1 - (l - 0.35) / 0.65);
  const alpha = Math.round(max * scale * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** True when two club colours are close enough to read as the same side. */
export function tooSimilar(a: string | null, b: string | null): boolean {
  const ca = a ? parseHex(a) : null;
  const cb = b ? parseHex(b) : null;
  if (!ca || !cb) return false;
  const d = Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
  // ~12% of the maximum RGB distance. Below that a split reads as one colour.
  return d < 54;
}
