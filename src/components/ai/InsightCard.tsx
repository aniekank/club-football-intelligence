import Link from 'next/link';
import { Figure, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Insight } from '@/domain/types';

const TONE: Record<Insight['kind'], 'brand' | 'good' | 'warning' | 'critical' | 'info' | 'neutral'> = {
  prediction: 'info',
  milestone: 'brand',
  overperformer: 'good',
  underperformer: 'warning',
  form: 'neutral',
  breakout: 'good',
  wall: 'critical',
  tactical: 'neutral',
};

/**
 * One story, with its arithmetic attached.
 *
 * The metrics row is not decoration — it is the evidence for the sentence above
 * it. A narrative product that states a claim without showing the numbers is
 * asking to be believed; showing them lets the reader disagree.
 */
export function InsightCard({ insight, href }: { insight: Insight; href?: string }) {
  const body = (
    <article
      className={cn(
        'flex h-full flex-col gap-2 rounded-md border border-border-subtle bg-surface-1 p-4',
        'transition-colors duration-fast ease-standard',
        href && 'hover:border-border hover:bg-surface-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{insight.title}</h3>
        <Badge tone={TONE[insight.kind]}>{insight.kind.replace(/-/g, ' ')}</Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-secondary">{insight.body}</p>
      {insight.metrics.length ? (
        <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-2">
          {insight.metrics.map((m) => (
            <div key={m.label}>
              <dt className="eyebrow">{m.label}</dt>
              <dd><Figure className="text-sm font-semibold">{m.value}</Figure></dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
  if (!href) return body;
  return <Link href={href} className="block h-full rounded-md focus-visible:shadow-focus">{body}</Link>;
}
