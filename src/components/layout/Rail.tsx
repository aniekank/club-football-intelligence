'use client';

import { useEffect, useState } from 'react';
import { Figure } from '@/components/ui';

/**
 * The collapsible rail — the doors, folded away when they are not wanted.
 *
 * ── Why it is a preference and not a route ─────────────────────────────────
 * Most disclosure in this product is native `<details>`, which is the right
 * mechanism for a section of a page: it works without JavaScript, it is
 * keyboard-operable and announced for free, and find-in-page opens it. This is
 * a different thing. A reader who collapses a sidebar means "keep it collapsed"
 * — a `<details>` springs back open on the next navigation, and a control that
 * forgets its own setting reads as broken rather than as fresh.
 *
 * So the state lives where the theme lives: an attribute on <html>, written by
 * a pre-paint script from localStorage. Same pattern, same reason — restoring
 * it after hydration would collapse the sidebar in front of the reader on every
 * page load, which is worse than not offering the control.
 *
 * ── What collapsing costs, and why it is acceptable here ───────────────────
 * With JavaScript off the button does nothing and the rail stays open. That is
 * the correct failure: everything remains reachable, and the only thing lost is
 * a layout preference. The rule this product holds to is that CONTENT state
 * belongs in the URL — which competition, which season, which view — and none
 * of that is what this is.
 *
 * ── The collapsed state still says what it is ──────────────────────────────
 * A 3rem strip with nothing in it is a mystery box. Collapsed, the spine keeps
 * the label — rotated, so it fits the width it has — and the count, so the
 * reader can see there are four places behind it without opening it first.
 * That is the same rule the disclosure hints follow.
 */
export function Rail({
  label, count, children,
}: {
  label: string;
  /** How many things are behind it, shown on the collapsed spine. */
  count: number;
  children: React.ReactNode;
}) {
  // Mirrors the attribute the pre-paint script already applied, so the button's
  // accessible name is right rather than assumed. Nothing VISUAL depends on
  // this — the CSS keys off <html> directly — so there is no flash to fix.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.getAttribute('data-rail') === 'closed');
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    const root = document.documentElement;
    try {
      if (next) {
        root.setAttribute('data-rail', 'closed');
        window.localStorage.setItem('cfi-rail', 'closed');
      } else {
        root.removeAttribute('data-rail');
        window.localStorage.removeItem('cfi-rail');
      }
    } catch {
      // Private browsing can refuse storage. The attribute still applies for
      // this view; only the memory of it is lost.
    }
  }

  return (
    <aside className="rail shrink-0">
      {/*
        The whole head is the control, label included.

        A 24px chevron beside inert text is a target you have to aim at, and
        collapsed it would be a lone icon floating above a rotated caption with
        no indication the two belong together. Putting the label inside the
        button makes the spine one object: it is obvious what it is, obvious
        that it opens, and large enough to hit without looking.

        The accessible name is the section — "Where to next" — and the STATE is
        `aria-expanded`, which is the disclosure pattern a screen reader already
        knows. An aria-label of "Collapse the sidebar" would replace the name
        with an instruction and lose what is being collapsed.
      */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="rail-body"
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        className={[
          'rail-head mb-3 flex w-full items-center gap-2 rounded-md border border-border-subtle',
          'px-2 py-2 text-left transition-colors duration-fast ease-standard',
          'hover:border-border hover:bg-surface-2',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 shrink-0 place-items-center text-ink-muted"
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" className="rail-chevron">
            <path
              d="M4.5 2.5 L8 6 L4.5 9.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span className="rail-label eyebrow flex items-center gap-2">
          {label}
          <Figure tone="muted">{count}</Figure>
        </span>
      </button>

      <div id="rail-body" className="rail-body space-y-3">
        {children}
      </div>
    </aside>
  );
}

/**
 * Restores the collapsed rail BEFORE first paint.
 *
 * Same job as `themeScript` and for the same reason: applied after hydration,
 * the reader watches a 22rem column shut itself on every navigation.
 */
export const railScript = `(function(){try{` +
  // ?rail=closed pins the state for one view and persists it, so a headless
  // browser can screenshot the collapsed layout without reaching into storage.
  `var q=new URLSearchParams(location.search).get('rail');` +
  `if(q==='closed'||q==='open'){localStorage.setItem('cfi-rail',q);}` +
  `if(localStorage.getItem('cfi-rail')==='closed'){` +
  `document.documentElement.setAttribute('data-rail','closed');}` +
  `}catch(e){}})();`;
