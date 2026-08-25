import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import config from '../../tailwind.config';

/**
 * The spacing scale is a NAMED token scale, and Tailwind-idiomatic classes
 * silently vanish against it.
 *
 * `tailwind.config.ts` sets `theme.spacing` — not `theme.extend.spacing` — to a
 * deliberate 8pt set of steps 0–10. That REPLACES Tailwind's default scale, so
 * step 5 is 24px rather than 20px, and anything outside 0–10 is not a class at
 * all. `h-1.5`, `w-12`, `mt-12`, `h-64` compile to nothing: no error, no
 * warning, just an element with no height, or an absolutely-positioned one that
 * silently falls back to its static position.
 *
 * That had accumulated to 54 uses across 22 files before anyone noticed —
 * including a forecast bar with no height and a sticky mark in the wrong corner.
 * Out-of-scale values are legitimate; they just have to be WRITTEN as arbitrary
 * values (`h-[0.375rem]`) so the intent is explicit and the class actually
 * exists.
 */
const VALID = new Set([...Array.from({ length: 11 }, (_, i) => String(i)), 'px', 'full', 'auto']);

const PROPS = [
  'h', 'w', 'min-h', 'min-w', 'max-h', 'max-w', 'gap', 'gap-x', 'gap-y',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
  'space-x', 'space-y', 'inset', 'inset-x', 'inset-y',
  'top', 'bottom', 'left', 'right', 'size',
].join('|');

const PATTERN = new RegExp(
  String.raw`(?<![\w-])(?:[a-z]+:)?-?(${PROPS})-([0-9]+(?:\.[0-9]+)?)(?![\w.\[-])`,
  'g',
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

describe('spacing utilities stay inside the token scale', () => {
  const offenders: string[] = [];

  /**
   * Block-comment state has to be TRACKED, not sniffed per line.
   *
   * Checking whether a line starts with `*` or `//` misses the middle of a JSX
   * block comment, whose continuation lines start with ordinary prose — and
   * these comments discuss class names constantly, including the ones this
   * test exists to ban. Sniffing flagged a paragraph explaining the rule as a
   * violation of it.
   */
  for (const file of walk(join(process.cwd(), 'src'))) {
    let inBlock = false;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const opens = line.lastIndexOf('/*');
      const closes = line.lastIndexOf('*/');
      const wasInBlock = inBlock;
      if (!inBlock && opens > -1 && closes < opens) inBlock = true;
      else if (inBlock && closes > -1) inBlock = false;

      const trimmed = line.trimStart();
      if (wasInBlock || inBlock || trimmed.startsWith('//')) return;
      // A single-line /* ... */ is also a comment, not code.
      if (opens > -1 && closes > opens) return;

      for (const m of line.matchAll(PATTERN)) {
        if (!VALID.has(m[2] as string)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}  ${m[0]}`);
        }
      }
    });
  }

  it('finds no class outside steps 0-10', () => {
    expect(offenders, `use an arbitrary value instead, e.g. h-[0.375rem]:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});


/**
 * Every other named scale, guarded the same way — and read from the config
 * rather than restated here.
 *
 * `theme.spacing` was not the only key set outright: `fontSize`,
 * `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`
 * and `zIndex` are all REPLACEMENTS too. So `text-6xl` is not a small mistake
 * against a large scale, it is not a class — and it fails exactly as `h-1.5`
 * did, by rendering the element at its inherited size with no warning
 * anywhere. A hero number written `text-6xl` came out the size of body copy.
 *
 * The allowed values are derived from `tailwind.config.ts` at test time, so
 * adding a step to the theme cannot leave this list behind.
 */
const theme = config.theme as Record<string, Record<string, unknown>>;
const keysOf = (scale: string) => new Set(Object.keys(theme[scale] ?? {}));

/**
 * `text-` is overloaded: it takes a size, a colour and an alignment. Only
 * size-SHAPED tokens are checked, so `text-ink-muted` and `text-center` pass
 * through untouched and a genuinely misspelt size still fails.
 */
const SIZE_SHAPED = /^(?:[0-9]*xs|sm|base|lg|[0-9]*xl)$/;

const FAMILIES: { prefix: string; scale: string; only?: RegExp }[] = [
  { prefix: 'text', scale: 'fontSize', only: SIZE_SHAPED },
  { prefix: 'shadow', scale: 'boxShadow' },
  { prefix: 'duration', scale: 'transitionDuration' },
  { prefix: 'ease', scale: 'transitionTimingFunction' },
  { prefix: 'z', scale: 'zIndex' },
  { prefix: 'leading', scale: 'lineHeight' },
];

describe('named theme scales are not invented at the call site', () => {
  const offenders: string[] = [];

  for (const { prefix, scale, only } of FAMILIES) {
    const valid = keysOf(scale);
    // Arbitrary values (`text-[2rem]`) and slash opacity are the escape hatch
    // and are deliberately not matched.
    const pattern = new RegExp(
      String.raw`(?<![\w-])(?:[a-z-]+:)?${prefix}-([a-z0-9]+)(?![\w./\[-])`,
      'g',
    );

    for (const file of walk(join(process.cwd(), 'src'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
        for (const m of line.matchAll(pattern)) {
          const token = m[1] as string;
          if (only && !only.test(token)) continue;
          if (!valid.has(token)) {
            offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}  ${m[0]}  (${scale})`);
          }
        }
      });
    }
  }

  it('finds no utility outside its scale', () => {
    expect(
      offenders,
      `these compile to nothing — use a real step or an arbitrary value:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
