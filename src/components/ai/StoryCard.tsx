import Link from 'next/link';
import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import { insightHref } from '@/lib/entityLink';
import { KIND_LABEL } from '@/ai/themes';
import type { Insight } from '@/domain/types';

/**
 * One story, with its arithmetic attached.
 *
 * The metrics row is not decoration and is not optional-by-habit: every claim
 * this engine makes is assembled from numbers the snapshot already contains,
 * and showing them under the sentence is what separates a deterministic
 * narrative from a generated one. A reader who doubts "Bahia are living on
 * luck" can check the goals-against-xGA gap in the same card.
 *
 * Shared by the lobby's rotating spotlight and the storylines page so the two
 * cannot present the same story differently.
 */
export function StoryCard({
  insight, suffix, featured = false,
}: {
  insight: Insight;
  suffix: string;
  featured?: boolean;
}) {
  const href = insightHref(insight.entityType, insight.entityId, suffix);

  const body = (
    <>
      <p className="eyebrow">{KIND_LABEL[insight.kind]}</p>
      <h3 className={cn('mt-1 font-display leading-tight', featured ? 'text-2xl' : 'text-lg')}>
        {insight.title}
      </h3>
      <p className="mt-1 max-w-prose text-sm text-ink-secondary">{insight.body}</p>
      {insight.metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-2">
          {insight.metrics.map((m) => (
            <span key={m.label} className="inline-flex items-baseline gap-[0.375rem]">
              <span className="eyebrow">{m.label}</span>
              <Figure className="text-sm font-semibold">{m.value}</Figure>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  const className = cn(
    'lit-edge block h-full rounded-lg border border-border-subtle bg-surface-1 p-4',
    href && 'transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md',
  );

  return href ? (
    <Link href={href} className={className}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
