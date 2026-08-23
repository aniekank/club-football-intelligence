'use client';
import { useEffect, useState } from 'react';

/**
 * Development-only overflow reporter.
 *
 * Exists because "does this page scroll sideways on mobile?" cannot be answered
 * from a screenshot — a clipped capture and a scrolling body look identical —
 * and headless Chrome does not reliably paint scrollbars. Measuring inside the
 * page is the only honest check.
 *
 * DELIBERATELY NOT WIRED INTO THE LAYOUT. A NODE_ENV guard stops it rendering in
 * production but does not stop webpack bundling it, and shipping dev tooling to
 * readers is not free. To use it, add `<OverflowProbe />` to the body in
 * src/app/layout.tsx, run `npm run dev`, and read the green strip at the foot of
 * the page — `overflow: false` is the passing state. Remove it afterwards.
 * See TEST-PLAN.md section 8.
 */
export function OverflowProbe() {
  const [out, setOut] = useState('measuring…');
  useEffect(() => {
    const id = setTimeout(() => {
      const de = document.documentElement;
      const offenders = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > de.clientWidth + 1;
        })
        .slice(0, 10)
        .map((el) => `${el.tagName}.${String((el as HTMLElement).className).slice(0, 55)}`);
      setOut(
        JSON.stringify({
          client: de.clientWidth,
          scroll: de.scrollWidth,
          overflow: de.scrollWidth > de.clientWidth,
          offenders,
        }),
      );
    }, 600);
    return () => clearTimeout(id);
  }, []);
  return (
    <pre
      id="overflow-probe"
      style={{
        position: 'fixed', inset: 'auto 0 0 0', zIndex: 9999,
        background: '#000', color: '#0f0', fontSize: 10, margin: 0,
        whiteSpace: 'pre-wrap',
      }}
    >
      {out}
    </pre>
  );
}
