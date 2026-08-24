'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/cn';

/**
 * URL-driven controls.
 *
 * Every control writes its state into the query string and navigates. That
 * costs a round trip a client-side filter would not, and buys three things
 * worth more than the latency:
 *
 *   • Every view is a shareable link. "Look at this" is a URL, not a
 *     description of which dropdowns to set.
 *   • The back button does what it should.
 *   • It works with JavaScript disabled — the <select> elements degrade to a
 *     plain form, and the whole page is server-rendered anyway.
 *
 * It also keeps the app internally consistent: search, ask, competition and
 * season already live in the URL, so filters behaving differently would be the
 * odd one out.
 */

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        // A null means "back to default", and dropping the key entirely keeps
        // the URL readable rather than accumulating &sort=default&dir=asc.
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

export function ParamSelect({
  name, value, options, label, className, defaultValue,
}: {
  name: string;
  value: string;
  options: SelectOption[];
  label: string;
  className?: string;
  /** When the chosen value equals this, the param is dropped from the URL. */
  defaultValue?: string;
}) {
  const setParam = useSetParam();

  const groups = options.reduce<Map<string, SelectOption[]>>((acc, o) => {
    const g = o.group ?? '';
    acc.set(g, [...(acc.get(g) ?? []), o]);
    return acc;
  }, new Map());
  const hasGroups = groups.size > 1 || !groups.has('');

  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => setParam({ [name]: e.target.value === defaultValue ? null : e.target.value })}
        className={cn(
          'h-9 min-w-0 rounded-sm border border-border-subtle bg-surface-1 px-2 text-sm',
          'transition-colors duration-fast ease-standard hover:border-border focus-visible:shadow-focus',
        )}
      >
        {hasGroups
          ? [...groups].map(([group, opts]) => (
              <optgroup key={group} label={group || 'Other'}>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))
          : options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
      </select>
    </label>
  );
}

/** A row of mutually exclusive chips — for short option sets where a dropdown
 *  would hide the choices. */
export function ParamToggle({
  name, value, options, label, defaultValue,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  defaultValue?: string;
}) {
  const setParam = useSetParam();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <div className="flex h-9 items-center gap-px rounded-sm border border-border-subtle p-px" role="group" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => setParam({ [name]: o.value === defaultValue ? null : o.value })}
              className={cn(
                'h-full whitespace-nowrap rounded-xs px-3 text-xs font-medium transition-colors duration-fast ease-standard',
                active ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink-secondary',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Numeric threshold, e.g. a minutes floor. */
export function ParamNumber({
  name, value, label, min = 0, max = 5000, step = 90, suffix, defaultValue,
}: {
  name: string;
  value: number;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  defaultValue?: number;
}) {
  const setParam = useSetParam();
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">
        {label}
        {suffix ? <span className="ml-1 normal-case tracking-normal text-ink-muted">{suffix}</span> : null}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          setParam({ [name]: Number.isFinite(v) && v !== defaultValue ? String(v) : null });
        }}
        className="figure h-9 w-[6rem] rounded-sm border border-border-subtle bg-surface-1 px-2 text-sm transition-colors duration-fast ease-standard hover:border-border focus-visible:shadow-focus"
      />
    </label>
  );
}

/** Clears every control back to defaults. Present only when something is set. */
export function ResetFilters({ params }: { params: string[] }) {
  const search = useSearchParams();
  const setParam = useSetParam();
  const active = params.filter((p) => search.get(p));
  if (!active.length) return null;
  return (
    <button
      type="button"
      onClick={() => setParam(Object.fromEntries(params.map((p) => [p, null])))}
      className="h-9 self-end rounded-sm px-3 text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-ink"
    >
      Reset ({active.length})
    </button>
  );
}

/** The control strip that sits above a chart or table. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-x flex flex-wrap items-end gap-3 border-b border-border-subtle px-4 pb-4">
      {children}
    </div>
  );
}
