import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * The primitive layer. Every one of these consumes design tokens through the
 * Tailwind mapping and none introduces a raw value — that is what keeps the
 * product coherent as surfaces multiply.
 */

// ── Surface ─────────────────────────────────────────────────────────────────

export function Card({
  className, children, as: As = 'div', interactive = false, ...rest
}: HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'article';
  /**
   * Raises the card on hover. Only for cards that are themselves a link or a
   * button — lifting something that cannot be clicked promises an affordance
   * that is not there.
   */
  interactive?: boolean;
}) {
  return (
    <As
      className={cn(
        'lit-edge rounded-lg border border-border-subtle bg-surface-1',
        'shadow-sm',
        interactive && [
          'transition-[transform,box-shadow,border-color] duration-normal ease-standard',
          'hover:-translate-y-px hover:border-border-default hover:shadow-md',
        ],
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title, eyebrow, action, description, className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-4 pt-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="text-xl leading-snug">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ── Type ────────────────────────────────────────────────────────────────────

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}

/**
 * Every figure in the product goes through this. Mono, tabular, slashed zero —
 * it is what makes dense numeric columns scan like a terminal rather than a
 * spreadsheet, and it guarantees digits never shift width as scores tick.
 */
export function Figure({
  children, className, tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'secondary' | 'muted' | 'positive' | 'negative';
}) {
  return (
    <span
      className={cn(
        'figure',
        tone === 'secondary' && 'text-ink-secondary',
        tone === 'muted' && 'text-ink-muted',
        tone === 'positive' && 'text-status-good',
        tone === 'negative' && 'text-status-critical',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * The live indicator. Brand lime is reserved for exactly this kind of "now"
 * signal and is deliberately excluded from the data-series ramp, so a chart
 * series can never be mistaken for a live state.
 */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-brand" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
    </span>
  );
}

export function LiveBadge({ minute, phase }: { minute: number; phase?: string }) {
  const label = phase === 'HT' ? 'HT' : phase ? phase : `${minute}'`;
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-brand-faint px-2 py-1 text-2xs font-semibold uppercase tracking-caps text-brand">
      <LiveDot />
      <span className="figure">{label}</span>
      <span className="sr-only">Live, {label}</span>
    </span>
  );
}

export type BadgeTone = 'neutral' | 'brand' | 'good' | 'warning' | 'serious' | 'critical' | 'info';

export function Badge({
  children, tone = 'neutral', className, title,
}: { children: ReactNode; tone?: BadgeTone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-px text-2xs font-semibold uppercase tracking-caps',
        tone === 'neutral' && 'bg-surface-2 text-ink-secondary',
        tone === 'brand' && 'bg-brand-faint text-brand',
        tone === 'good' && 'bg-status-good-faint text-status-good',
        tone === 'warning' && 'bg-status-warning-faint text-status-warning',
        tone === 'serious' && 'bg-status-serious-faint text-status-serious',
        tone === 'critical' && 'bg-status-critical-faint text-status-critical',
        tone === 'info' && 'bg-surface-2 text-series-1',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Marks a value the model produced rather than measured.
 *
 * Non-negotiable in this product: the parent shipped modelled numbers that
 * looked measured, and a reader has no way to tell unless you say so.
 */
export function EstimateMark() {
  return (
    <abbr
      title="Estimated — modelled from available data, not directly measured"
      className="ml-1 cursor-help text-2xs font-medium uppercase tracking-caps text-ink-muted no-underline"
    >
      est.
    </abbr>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

/**
 * The W/D/L run, most recent LAST so it reads left-to-right in time order.
 * Letters carry the meaning; colour only reinforces it, so this stays legible
 * in monochrome and to a colourblind reader.
 */
export function FormRun({ form, className }: { form: ('W' | 'D' | 'L')[]; className?: string }) {
  if (!form.length) {
    return <span className="text-sm text-ink-muted">—</span>;
  }
  return (
    <span className={cn('inline-flex gap-px', className)}>
      {form.map((r, i) => (
        <span
          key={`${r}-${i}`}
          // Decorative: the sr-only summary below is the accessible name, so a
          // screen reader hears "W, D, L" once rather than twice.
          aria-hidden="true"
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-xs text-2xs font-bold',
            r === 'W' && 'bg-status-good-faint text-status-good',
            r === 'D' && 'bg-surface-2 text-ink-secondary',
            r === 'L' && 'bg-status-critical-faint text-status-critical',
          )}
        >
          {r}
        </span>
      ))}
      <span className="sr-only">
        Recent form, oldest first: {form.join(', ')}
      </span>
    </span>
  );
}

// ── Crest ───────────────────────────────────────────────────────────────────

/**
 * A club crest.
 *
 * A plain <img>, not next/image: the Image Optimizer is deliberately disabled
 * (GHSA-9g9p-9gw9-jx7f, patched only in Next 16 — see next.config.mjs), and
 * these are small static PNGs where it earns almost nothing anyway. Dimensions
 * are always set so the row never reflows, and a missing crest falls back to
 * the club's three-letter code rather than a broken-image glyph — crests are
 * licensed assets that may simply not resolve.
 */
export function Crest({
  url, code, name, size = 20, className,
}: {
  url: string | null;
  code: string;
  name: string;
  size?: number;
  className?: string;
}) {
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xs bg-surface-2 text-2xs font-bold text-ink-muted',
          className,
        )}
        style={{ width: size, height: size }}
      >
        {code.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Crest plus name, the unit that appears in every list and table. */
export function TeamLabel({
  name, code, crestUrl, size = 20, className, nameClassName, truncate = true,
}: {
  name: string;
  code: string;
  crestUrl: string | null;
  size?: number;
  className?: string;
  nameClassName?: string;
  truncate?: boolean;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {/*
        The crest lifts slightly when its row is hovered. It is the row's
        identity, so it is the right element to acknowledge the pointer — and
        scaling a 20px badge costs no layout, because the transform does not
        participate in flow. Under reduced motion the global guard collapses the
        duration and it simply arrives.
      */}
      <Crest
        url={crestUrl}
        code={code}
        name={name}
        size={size}
        className="transition-transform duration-normal ease-spring group-hover:scale-110"
      />
      <span className={cn(truncate && 'truncate', nameClassName)}>{name}</span>
    </span>
  );
}

// ── Loading ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

export function EmptyState({
  title, description, icon,
}: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink-secondary">{title}</p>
      {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

/**
 * A single headline number. Per the dataviz guidance, when the data's job is to
 * deliver one figure, the right form is not a chart — it is this.
 */
export function StatTile({
  label, value, sub, tone = 'default', estimate, className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'positive' | 'negative';
  estimate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-border-subtle bg-surface-1 px-3 py-3', className)}>
      <p className="eyebrow">
        {label}
        {estimate ? <EstimateMark /> : null}
      </p>
      <p
        className={cn(
          'figure mt-1 text-2xl font-semibold leading-tight',
          tone === 'positive' && 'text-status-good',
          tone === 'negative' && 'text-status-critical',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-px text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}
