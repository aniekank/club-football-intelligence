'use client';

import { useEffect, useState } from 'react';

/**
 * Renders a timestamp in the VIEWER's timezone.
 *
 * Server-rendering a kickoff time formats it in the SERVER's timezone, which is
 * wherever the host happens to be — a London fixture at 11:30 UTC rendered
 * 07:30 on a US-East box. For a football product the kickoff time is one of the
 * few facts a reader will act on, so getting it silently wrong is worse than
 * most bugs of this size.
 *
 * The server emits UTC with an explicit marker, and the browser swaps in local
 * time on mount. That keeps SSR output deterministic (no hydration mismatch, no
 * flash of a wrong number that looks plausible) and means a reader with
 * JavaScript disabled still sees a correct, if less convenient, time.
 */
export function LocalTime({
  iso, mode = 'time', className,
}: {
  iso: string;
  mode?: 'time' | 'date' | 'datetime';
  className?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions =
      mode === 'time'
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : mode === 'date'
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', hour12: false,
          };
    setLocal(new Intl.DateTimeFormat(undefined, opts).format(d));
  }, [iso, mode]);

  // Server + first paint: UTC, explicitly labelled so it is never mistaken for
  // local time.
  const utc = utcFallback(iso, mode);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {local ?? utc}
    </time>
  );
}

function utcFallback(iso: string, mode: 'time' | 'date' | 'datetime'): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    mode === 'time'
      ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }
      : mode === 'date'
      ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
      : {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
        };
  const formatted = new Intl.DateTimeFormat('en-GB', opts).format(d);
  return mode === 'date' ? formatted : `${formatted} UTC`;
}
