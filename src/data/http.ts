/**
 * Polite HTTP for upstream feeds.
 *
 * The live source is an undocumented public API. That earns it careful
 * treatment rather than a tight loop: a real browser User-Agent, a hard
 * concurrency cap, exponential backoff that actually respects Retry-After, and
 * a request timeout so a hung socket can never wedge the boot path.
 *
 * The parent product's WC-073 lesson, restated: the failure mode of an
 * unthrottled fetcher is not a slow page, it is being blocked outright — and
 * then no amount of retrying helps.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Label used in error messages and logs. */
  label?: string;
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A 4xx other than 429 is a permanent answer — the resource is gone, or we are
 * blocked. Retrying it wastes the budget and, if we are being rate-limited by
 * reputation, actively makes things worse.
 */
function isRetryable(status: number | null): boolean {
  if (status === null) return true; // network/timeout
  if (status === 429) return true;
  return status >= 500;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 3, headers = {}, label = url } = opts;

  let lastError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 400ms, 1.2s, 3.6s — enough to ride out a blip without stalling boot.
      const backoff = 400 * Math.pow(3, attempt - 1);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-GB,en;q=0.9',
          ...headers,
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        // Honour Retry-After when the server bothers to tell us.
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after'));
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            await sleep(Math.min(retryAfter * 1000, 30_000));
          }
        }
        lastError = new UpstreamError(`${label} → HTTP ${res.status}`, res.status, url);
        if (!isRetryable(res.status)) throw lastError;
        continue;
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      lastError = new UpstreamError(`${label} → ${reason}`, null, url);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new UpstreamError(`${label} → exhausted retries`, null, url);
}

/**
 * Run tasks with a hard concurrency ceiling, preserving input order in the
 * result. Used for the per-match enrichment fan-out, which is the only place
 * that issues more than a handful of requests.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
