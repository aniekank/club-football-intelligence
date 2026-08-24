import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, EmptyState, Badge, Figure, Crest, StatTile } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { summariseForTeam } from '@/data/providers/fotmobTransfers';
import { eur } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Transfer, TransferKind } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Transfers' };

const KIND_TONE: Record<TransferKind, 'brand' | 'info' | 'neutral' | 'warning'> = {
  permanent: 'brand',
  loan: 'info',
  free: 'neutral',
  undisclosed: 'warning',
};

const KIND_LABEL: Record<TransferKind, string> = {
  permanent: 'fee',
  loan: 'loan',
  free: 'free',
  undisclosed: 'undisclosed',
};

export default function TransfersPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; kind?: string; club?: string };
}) {
  const { competition, snapshot, available, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const seasonParam = searchParams.season ?? '';
  const suffix = seasonParam
    ? `?competition=${competition.id}&season=${seasonParam}`
    : `?competition=${competition.id}`;

  const all = snapshot?.transfers ?? [];
  const kind = searchParams.kind ?? 'all';
  const club = searchParams.club ?? '';
  const filtered = all.filter((t) => {
    if (kind !== 'all' && t.kind !== kind) return false;
    if (club && t.fromTeamId !== club && t.toTeamId !== club) return false;
    return true;
  });

  const teamById = new Map((snapshot?.teams ?? []).map((t) => [t.id, t]));

  // Disclosed fees only — the caveat is stated wherever the number appears.
  const disclosed = filtered.filter((t) => t.feeEur !== null);
  const totalFees = disclosed.reduce((n, t) => n + (t.feeEur ?? 0), 0);
  const undisclosed = filtered.filter((t) => t.kind === 'undisclosed').length;

  // Net spend per club, biggest spenders first.
  const clubs = (snapshot?.teams ?? [])
    .map((team) => ({ team, summary: summariseForTeam(all, team.id) }))
    .filter((c) => c.summary.arrivals + c.summary.departures > 0)
    .sort((a, b) => a.summary.netEur - b.summary.netEur);

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-5 px-4 py-6">
        <header className="max-w-prose">
          <p className="eyebrow">{competition.name} · {snapshot?.season.label ?? ''}</p>
          <h1 className="mt-1 text-3xl">Transfers</h1>
          <p className="mt-2 text-ink-secondary">
            Completed moves involving clubs in this competition. Fees are shown only
            where they were published — a loan, a free and an undisclosed deal are
            three different things and none of them is zero.
          </p>
        </header>

        {!snapshot ? (
          <EmptyState title="Loading" />
        ) : !all.length ? (
          <Card>
            <EmptyState
              title="No transfer data for this edition"
              description="The active source does not supply transfers here — historical editions carry none."
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Moves" value={String(filtered.length)} />
              <StatTile
                label="Disclosed fees"
                value={eur(totalFees)}
                sub={`across ${disclosed.length} deals`}
              />
              <StatTile
                label="Undisclosed"
                value={String(undisclosed)}
                sub="fee not published"
              />
              <StatTile
                label="Loans"
                value={String(filtered.filter((t) => t.kind === 'loan').length)}
              />
            </div>

            <Card>
              <CardHeader
                eyebrow="Filter"
                title="Every move"
                action={
                  <div className="flex flex-wrap gap-1">
                    {(['all', 'permanent', 'loan', 'free', 'undisclosed'] as const).map((k) => (
                      <Link
                        key={k}
                        href={`/transfers${suffix}${k === 'all' ? '' : `&kind=${k}`}${club ? `&club=${club}` : ''}`}
                        className={cn(
                          'rounded-sm px-2 py-1 text-2xs font-semibold uppercase tracking-caps transition-colors duration-fast ease-standard',
                          kind === k ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {k}
                      </Link>
                    ))}
                  </div>
                }
              />
              <div className="scroll-x mt-3">
                <table className="w-full min-w-[46rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
                      <th scope="col" className="px-4 py-2 text-left font-semibold">Player</th>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">Pos</th>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">From</th>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">To</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">Fee</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">Value</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 120).map((t) => (
                      <Row key={t.id} t={t} suffix={suffix} teamById={teamById} />
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 ? (
                <EmptyState title="No moves match this filter" />
              ) : null}
            </Card>

            {clubs.length ? (
              <Card>
                <CardHeader
                  eyebrow="Net spend"
                  title="Who is buying"
                  description="Disclosed fees only. Clubs with undisclosed deals will be understated."
                />
                <div className="scroll-x mt-3">
                  <table className="w-full min-w-[34rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
                        <th scope="col" className="px-4 py-2 text-left font-semibold">Club</th>
                        <th scope="col" className="px-2 py-2 text-right font-semibold">In</th>
                        <th scope="col" className="px-2 py-2 text-right font-semibold">Out</th>
                        <th scope="col" className="px-2 py-2 text-right font-semibold">Spent</th>
                        <th scope="col" className="px-2 py-2 text-right font-semibold">Received</th>
                        <th scope="col" className="px-4 py-2 text-right font-semibold">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clubs.slice(0, 15).map(({ team, summary }) => (
                        <tr key={team.id} className="border-b border-border-subtle/60 hover:bg-surface-2">
                          <td className="px-4 py-2">
                            <Link
                              href={`/teams/${team.id}${suffix}`}
                              className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
                            >
                              <Crest url={team.crestUrl} code={team.code} name={team.name} size={16} />
                              {team.shortName}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-right"><Figure tone="secondary">{summary.arrivals}</Figure></td>
                          <td className="px-2 py-2 text-right"><Figure tone="secondary">{summary.departures}</Figure></td>
                          <td className="px-2 py-2 text-right"><Figure>{eur(summary.spendEur || null)}</Figure></td>
                          <td className="px-2 py-2 text-right"><Figure>{eur(summary.receivedEur || null)}</Figure></td>
                          <td className="px-4 py-2 text-right">
                            <Figure tone={summary.netEur < 0 ? 'negative' : summary.netEur > 0 ? 'positive' : 'muted'}>
                              {summary.netEur === 0 ? '—' : (summary.netEur > 0 ? '+' : '−') + eur(Math.abs(summary.netEur)).slice(1)}
                            </Figure>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({
  t, suffix, teamById,
}: {
  t: Transfer;
  suffix: string;
  teamById: Map<string, { id: string; code: string; name: string; shortName: string; crestUrl: string | null }>;
}) {
  const club = (id: string | null, name: string) => {
    const team = id ? teamById.get(id) : undefined;
    if (!team) {
      // A club outside this competition is named but not linked — the page it
      // would point at does not exist here.
      return <span className="text-ink-muted">{name}</span>;
    }
    return (
      <Link href={`/teams/${team.id}${suffix}`} className="inline-flex items-center gap-2 underline-offset-2 hover:underline">
        <Crest url={team.crestUrl} code={team.code} name={team.name} size={14} />
        {team.shortName}
      </Link>
    );
  };

  return (
    <tr className="border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2">
      <td className="px-4 py-2 font-medium">
        <Link href={`/players/${t.playerId}${suffix}`} className="underline-offset-2 hover:underline">
          {t.playerName}
        </Link>
      </td>
      <td className="px-2 py-2 text-2xs uppercase tracking-caps text-ink-muted">{t.position ?? '—'}</td>
      <td className="px-2 py-2">{club(t.fromTeamId, t.fromTeamName)}</td>
      <td className="px-2 py-2">{club(t.toTeamId, t.toTeamName)}</td>
      <td className="px-2 py-2 text-right">
        {t.feeEur !== null ? (
          <Figure className="font-semibold">{eur(t.feeEur)}</Figure>
        ) : (
          <Badge tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Badge>
        )}
      </td>
      <td className="px-2 py-2 text-right"><Figure tone="muted">{eur(t.marketValueEur)}</Figure></td>
      <td className="px-4 py-2 text-right text-2xs text-ink-muted">{formatDate(t.date)}</td>
    </tr>
  );
}
