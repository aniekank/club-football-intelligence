import type { Insight, InsightKind } from '@/domain/types';

/**
 * The eleven insight kinds, gathered into the four things a reader is
 * actually asking about.
 *
 * ── Why regroup at all ─────────────────────────────────────────────────────
 * `kind` is an engine-side label — 'overperformer', 'wall', 'tactical' — and it
 * was being printed to the reader as an eyebrow, which is a data model leaking
 * through the glass. Eleven ungrouped categories is also not a structure: it
 * is a list with captions, and a page organised by it has eleven sections of
 * one or two items each.
 *
 * The four themes here are questions, not taxonomies. What is being decided;
 * who is running hot and who is living on luck; which games move the table;
 * and who decides them. A story belongs to exactly one.
 *
 * ── Exhaustive by construction ─────────────────────────────────────────────
 * `KIND_THEME` is a `Record<InsightKind, ThemeId>`, so adding a twelfth kind to
 * the union fails the typecheck here rather than silently producing stories
 * that belong to no theme and never reach a page. That is the whole reason it
 * is a Record and not a lookup with a fallback.
 */

export type ThemeId = 'races' | 'form' | 'fixtures' | 'people';

export const KIND_THEME: Record<InsightKind, ThemeId> = {
  prediction: 'races',
  milestone: 'races',
  wall: 'races',
  form: 'form',
  overperformer: 'form',
  underperformer: 'form',
  breakout: 'form',
  fixture: 'fixtures',
  player: 'people',
  coach: 'people',
  tactical: 'people',
};

/**
 * What each kind is CALLED, for a reader.
 *
 * The kind was being printed straight to the page, so a card announced itself
 * as "overperformer" — an engine's internal label doing a subheading's job.
 * Same exhaustive Record for the same reason.
 */
export const KIND_LABEL: Record<InsightKind, string> = {
  prediction: 'Projection',
  milestone: 'Settled',
  wall: 'Survival',
  form: 'Form',
  overperformer: 'Overperforming',
  underperformer: 'Underperforming',
  breakout: 'Breakout',
  fixture: 'Key fixture',
  player: 'Player',
  coach: 'Dugout',
  tactical: 'Tactics',
};

export interface Theme {
  id: ThemeId;
  label: string;
  /** What the section is for, in the reader's terms. */
  blurb: string;
}

/** Ordered as a reader would work down them: the season, then the week. */
export const THEMES: Theme[] = [
  {
    id: 'races',
    label: 'What is being decided',
    blurb: 'The title, the European places, and the fight at the bottom.',
  },
  {
    id: 'form',
    label: 'Running hot, and living on luck',
    blurb:
      'Runs worth naming, and the clubs whose results have drifted from their underlying numbers.',
  },
  {
    id: 'fixtures',
    label: 'Games that move the table',
    blurb: 'The fixtures the model expects to change something.',
  },
  {
    id: 'people',
    label: 'The people who decide it',
    blurb: 'Players in form, and the dugouts under pressure.',
  },
];

export interface ThemedStories {
  theme: Theme;
  insights: Insight[];
}

/**
 * Group stories by theme, keeping the engine's severity order inside each.
 *
 * Empty themes are dropped rather than rendered as an empty section: a heading
 * over nothing tells the reader the product is broken when in fact this
 * competition simply has no relegation fight worth writing about yet.
 */
export function groupByTheme(insights: Insight[]): ThemedStories[] {
  return THEMES.flatMap((theme) => {
    const matched = insights.filter((i) => KIND_THEME[i.kind] === theme.id);
    return matched.length ? [{ theme, insights: matched }] : [];
  });
}
