'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * The route error boundary.
 *
 * Without this a thrown error anywhere in a route tree replaces the whole page
 * with Next's development overlay or, in production, a blank screen. This
 * product renders a lot of derived numbers from a live feed, so "one panel
 * threw" is a real possibility and should cost the reader that panel's page,
 * not the site.
 *
 * `reset()` genuinely helps here rather than being decoration: most failures
 * in this app are a transient upstream fetch, and re-rendering the segment is
 * often all that is needed.
 */
export default function RouteError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server digests are the only handle on a production stack trace, so it
    // goes to the console rather than being swallowed.
    console.error('[route error]', error.digest ?? '', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col justify-center px-4 py-10">
      <div className="max-w-prose">
        <Wordmark />
        <p className="figure mt-8 text-2xs uppercase tracking-caps text-ink-muted">
          Something failed
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight">
          This page didn&rsquo;t load
        </h1>
        <p className="mt-3 text-ink-secondary">
          The rest of the site is unaffected. Most failures here are a
          momentary problem reaching the data feed, so trying again usually
          works.
        </p>
        {error.digest ? (
          <p className="figure mt-2 text-2xs text-ink-muted">
            Reference {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-sm bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors duration-fast ease-standard hover:bg-brand-hover"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-sm border border-border-subtle px-4 py-2 text-sm font-semibold transition-colors duration-fast ease-standard hover:border-border"
          >
            Back to today
          </Link>
        </div>
      </div>
    </main>
  );
}
