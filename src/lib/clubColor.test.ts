import { describe, it, expect } from 'vitest';
import { clubWash, tooSimilar } from './clubColor';

/**
 * These exist because club colours are NOT ours to choose. Across the
 * competitions here they include near-white, near-black and full-chroma
 * yellow, and any of those can break a surface that paints with them naively.
 */
describe('clubWash', () => {
  const alphaOf = (css: string) => Number(/,\s*([\d.]+)\)$/.exec(css)?.[1] ?? NaN);

  it('gives a dark club colour close to the full requested alpha', () => {
    expect(alphaOf(clubWash('#0a1e3c', 0.3))).toBeCloseTo(0.3, 2);
  });

  it('drops a near-white club colour to a whisper', () => {
    // Real Madrid, Fulham, Derby. At full alpha this lifts a dark card enough
    // to hurt the text sitting on it.
    const white = alphaOf(clubWash('#ffffff', 0.3));
    expect(white).toBeLessThan(0.08);
    expect(white).toBeGreaterThan(0);
  });

  it('keeps the hue rather than clamping the colour', () => {
    // Shifting Real Madrid's white until it passes a ratio produces a grey that
    // is no longer Real Madrid's. Alpha moves; the channels do not.
    expect(clubWash('#ffff00', 0.3)).toContain('255, 255, 0');
  });

  it('never emits a colour for a missing or malformed value', () => {
    expect(clubWash(null)).toBe('transparent');
    expect(clubWash('not-a-colour')).toBe('transparent');
    expect(clubWash('#12345')).toBe('transparent');
  });

  it('accepts three-digit hex', () => {
    expect(clubWash('#08f', 0.3)).toContain('0, 136, 255');
  });
});

describe('tooSimilar', () => {
  it('catches two clubs that would read as one side', () => {
    // Liverpool v Man United: both red, and a split between them says nothing.
    expect(tooSimilar('#c8102e', '#da291c')).toBe(true);
  });

  it('passes a genuine contrast of colours', () => {
    expect(tooSimilar('#c8102e', '#034694')).toBe(false);
  });

  it('says nothing when a colour is missing', () => {
    expect(tooSimilar(null, '#c8102e')).toBe(false);
  });
});
