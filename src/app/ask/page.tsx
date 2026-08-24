import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, Figure, Badge, EmptyState } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { ask } from '@/ai/ask';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask' };

const SUGGESTIONS = [
  'Who has the most goals?',
  'Show me the table',
  'Who leads on xG per 90?',
  'Who is going down?',
];

export default function AskPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; q?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const query = (searchParams.q ?? '').trim();
  const seasonParam = searchParams.season ?? '';

  const result =
    snapshot && query
      ? ask(
          {
            snapshot,
            forecasts: forecast?.forecasts ?? [],
            competitionId: competition.id,
            seasonParam,
          },
          query,
        )
      : null;

  const base = `/ask?competition=${competition.id}${seasonParam ? `&season=${seasonParam}` : ''}`;

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <header>
          <p className="eyebrow">{competition.name} · {snapshot?.season.label ?? ''}</p>
          <h1 className="mt-1 text-3xl">Ask</h1>
          <p className="mt-2 max-w-prose text-ink-secondary">
            Questions answered from the loaded data only. Every answer shows the rows
            it came from, because a number you cannot check is a number you should
            not trust.
          </p>
        </header>

        {/* A GET form: the query lives in the URL, so an answer is shareable and
            the back button behaves. No client JavaScript required. */}
        <form action="/ask" method="get" className="flex gap-2">
          <input type="hidden" name="competition" value={competition.id} />
          {seasonParam ? <input type="hidden" name="season" value={seasonParam} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Who has the most goals?"
            aria-label="Ask a question about this competition"
            autoComplete="off"
            className={cn(
              'min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-4 py-3 text-base',
              'placeholder:text-ink-muted focus-visible:shadow-focus',
            )}
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-brand-ink transition-colors duration-fast ease-standard hover:bg-brand-hover"
          >
            Ask
          </button>
        </form>

        {!query ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Link
                key={s}
                href={`${base}&q=${encodeURIComponent(s)}`}
                className="rounded-pill border border-border-subtle px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-fast ease-standard hover:border-border hover:bg-surface-2 hover:text-ink"
              >
                {s}
              </Link>
            ))}
          </div>
        ) : !snapshot ? (
          <EmptyState title="Loading data" />
        ) : result ? (
          <>
            <Card>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg leading-relaxed">{result.answer}</p>
                  <Badge tone={result.understood ? 'brand' : 'warning'}>
                    {result.understood ? result.intent.replace(/-/g, ' ') : 'not understood'}
                  </Badge>
                </div>

                {result.rows.length ? (
                  <div className="scroll-x mt-4">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Evidence for the answer above</caption>
                      <thead>
                        <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
                          {result.columns.map((c, i) => (
                            <th
                              key={c + i}
                              scope="col"
                              className={cn('px-2 py-2 font-semibold', i === 0 ? 'text-left' : 'text-right')}
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i} className="border-b border-border-subtle/60">
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                className={cn('px-2 py-2', j === 0 ? 'text-left' : 'text-right')}
                              >
                                {typeof cell === 'number' || /^[\d.+-]+$/.test(String(cell)) ? (
                                  <Figure>{cell}</Figure>
                                ) : (
                                  cell
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {result.href ? (
                  <Link
                    href={result.href}
                    className="mt-4 inline-block text-sm font-medium text-ink-secondary underline-offset-2 hover:text-ink hover:underline"
                  >
                    See the full picture →
                  </Link>
                ) : null}
              </div>
            </Card>

            {result.followUps.length ? (
              <div>
                <p className="eyebrow mb-2">Next</p>
                <div className="flex flex-wrap gap-2">
                  {result.followUps.map((f) => (
                    <Link
                      key={f}
                      href={`${base}&q=${encodeURIComponent(f)}`}
                      className="rounded-pill border border-border-subtle px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-fast ease-standard hover:border-border hover:bg-surface-2 hover:text-ink"
                    >
                      {f}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
