import { describe, it, expect } from 'vitest';
import { BEST_THIRDS_TABLE, fillRoundOf16, type GroupLetter } from './bracket';

/** Each group's teams named by finishing position: "1A", "2A", "3A", "4A". */
const groups = () =>
  new Map<GroupLetter, string[]>(
    (['A', 'B', 'C', 'D', 'E', 'F'] as GroupLetter[]).map((g) => [g, [1, 2, 3, 4].map((r) => `${r}${g}`)]),
  );

describe('the best-thirds table', () => {
  it('has all fifteen combinations', () => {
    expect(Object.keys(BEST_THIRDS_TABLE)).toHaveLength(15);
  });

  it('never pairs a group winner with a third from its own group, and uses each third once', () => {
    for (const [key, row] of Object.entries(BEST_THIRDS_TABLE)) {
      expect([...row].sort().join('')).toBe(key);
      row.forEach((third, i) => expect(third).not.toBe('ABCD'[i]));
    }
  });
});

describe('filling the round of sixteen', () => {
  it('reproduces AFCON 2025 (thirds from C, D, E, F)', () => {
    // Real ties: Mali–Tunisia (2A–2C), Senegal–Sudan (1D–3E), Egypt–Benin (1B–3D),
    // Ivory Coast–Burkina Faso (1F–2E), Algeria–DR Congo (1E–2D),
    // Nigeria–Mozambique (1C–3F), South Africa–Cameroon (2B–2F), Morocco–Tanzania (1A–3C).
    expect(fillRoundOf16(groups(), ['C', 'D', 'E', 'F'])).toEqual([
      ['2A', '2C'], ['1D', '3E'], ['1B', '3D'], ['1F', '2E'],
      ['1E', '2D'], ['1C', '3F'], ['2B', '2F'], ['1A', '3C'],
    ]);
  });

  it('reproduces AFCON 2023 (thirds from A, C, D, E)', () => {
    // Real ties: Equatorial Guinea–Guinea (1A–3C), Cape Verde–Mauritania (1B–3D),
    // Senegal–Ivory Coast (1C–3A), Angola–Namibia (1D–3E).
    const ties = fillRoundOf16(groups(), ['E', 'A', 'D', 'C']);
    expect(ties).toContainEqual(['1A', '3C']);
    expect(ties).toContainEqual(['1B', '3D']);
    expect(ties).toContainEqual(['1C', '3A']);
    expect(ties).toContainEqual(['1D', '3E']);
  });

  it('refuses anything but four thirds', () => {
    expect(fillRoundOf16(groups(), ['A', 'B', 'C'])).toBeNull();
  });
});
