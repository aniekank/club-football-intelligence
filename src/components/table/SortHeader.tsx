'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * A sortable column head.
 *
 * Sort state lives in the URL like every other control, so a sorted table is a
 * link you can send someone. `aria-sort` is set on the header cell so a screen
 * reader announces the state, and the arrow is decorative.
 *
 * The first click sorts in the direction that puts the INTERESTING end first —
 * most points, fewest goals conceded — rather than always descending. Sorting
 * "goals conceded" and getting the worst defence first is a small thing that
 * makes a table feel like it was not thought about.
 */
export function SortHeader({
  columnKey, label, title, higherIsBetter = true, className, align = 'center',
}: {
  columnKey: string;
  label: string;
  title?: string;
  higherIsBetter?: boolean;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeKey = params.get('sort');
  const dir = params.get('dir');
  const isActive = activeKey === columnKey;
  const currentDir = isActive ? (dir === 'asc' ? 'asc' : 'desc') : null;

  const firstDir = higherIsBetter ? 'desc' : 'asc';
  const nextDir = !isActive ? firstDir : currentDir === firstDir ? (firstDir === 'desc' ? 'asc' : 'desc') : null;

  function go() {
    const next = new URLSearchParams(params.toString());
    if (nextDir === null) {
      // Third click clears back to the competition's own order, which for a
      // league table is the only ordering that is actually authoritative.
      next.delete('sort');
      next.delete('dir');
    } else {
      next.set('sort', columnKey);
      next.set('dir', nextDir);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <th
      scope="col"
      title={title}
      aria-sort={isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-1 py-2 font-semibold', `text-${align}`, className)}
    >
      <button
        type="button"
        onClick={go}
        className={cn(
          'inline-flex items-center gap-1 rounded-xs px-1 transition-colors duration-fast ease-standard',
          'hover:text-ink',
          isActive && 'text-ink',
        )}
      >
        {label}
        <span aria-hidden="true" className={cn('text-2xs', !isActive && 'opacity-0')}>
          {currentDir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );
}
