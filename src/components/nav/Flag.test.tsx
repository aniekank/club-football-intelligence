import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Flag, FLAG_FOR, type FlagKind } from './Flag';
import { COMPETITIONS } from '@/domain/competitions';

const markup = (kind: FlagKind) => renderToStaticMarkup(<Flag kind={kind} />);

describe('flag marks', () => {
  it('gives every competition a mark', () => {
    for (const c of COMPETITIONS) {
      expect(FLAG_FOR[c.id], `${c.id} has no flag`).toBeDefined();
    }
  });

  /**
   * The one that actually matters.
   *
   * Italy and Mexico are both green-white-red vertical tricolours. Rendered at
   * 32px inside a circle and stripped of Mexico's coat of arms they are the
   * SAME IMAGE — two entries in one rail that a reader cannot tell apart, which
   * would make the control unusable for exactly the people it is for.
   */
  it('renders Italy and Mexico distinguishably', () => {
    const ita = markup('ITA');
    const mex = markup('MEX');
    expect(ita).not.toEqual(mex);
    // Mexico carries a centre emblem; Italy must not.
    expect(mex).toContain('<circle');
    expect(ita).not.toContain('<circle');
    // And the greens differ, so the two are not identical even at a glance.
    const green = (s: string) => s.match(/#0[0-9a-f]{5}/i)?.[0];
    expect(green(ita)).not.toEqual(green(mex));
  });

  it('draws England, not the United Kingdom', () => {
    // A red cross on white — no blue saltire anywhere.
    const eng = markup('ENG');
    expect(eng).toContain('#ce1124');
    expect(eng).not.toContain('#012169');
  });

  it('produces distinct markup for every mark it defines', () => {
    const kinds = [...new Set(Object.values(FLAG_FOR))];
    const seen = new Map<string, FlagKind>();
    for (const k of kinds) {
      const m = markup(k);
      const clash = seen.get(m);
      expect(clash, `${k} renders identically to ${clash}`).toBeUndefined();
      seen.set(m, k);
    }
  });
});
