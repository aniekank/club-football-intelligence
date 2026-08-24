import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, EmptyState, Badge } from '@/components/ui';
import { Scatter, type ScatterPoint } from '@/components/charts/Scatter';
import { ParamSelect, ParamToggle, ParamNumber, ResetFilters, FilterBar } from '@/components/controls';
import { resolveActive } from '@/server/active';
import {
  availableTeamMetrics, availablePlayerMetrics, findTeamMetric, findPlayerMetric,
  teamRows, playerRows, grouped, minutesDefault,
} from '@/lib/metrics';
import type { Position } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Explore' };

const POSITIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'GK', label: 'GK' },
  { value: 'DF', label: 'DF' },
  { value: 'MF', label: 'MF' },
  { value: 'FW', label: 'FW' },
];

export default function ExplorePage({
  searchParams,
}: {
  searchParams: {
    competition?: string; season?: string;
    scope?: string; x?: string; y?: string; pos?: string; mins?: string;
  };
}) {
  const { competition, snapshot, available, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const seasonParam = searchParams.season ?? '';
  const suffix = seasonParam
    ? `?competition=${competition.id}&season=${seasonParam}`
    : `?competition=${competition.id}`;

  const scope = searchParams.scope === 'players' ? 'players' : 'clubs';
  const hasPlayers = Boolean(snapshot?.meta.capabilities.hasPlayerStats);

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
          <h1 className="mt-1 text-3xl">Explore</h1>
          <p className="mt-2 text-ink-secondary">
            Any metric against any other. The dashed lines mark the median of each
            axis, so the four quadrants have plain meanings — outliers are the point.
          </p>
        </header>

        {!snapshot ? (
          <EmptyState title="Loading data" />
        ) : (
          <Card>
            <CardHeader
              eyebrow="Scatter"
              title={scope === 'clubs' ? 'Clubs' : 'Players'}
              action={
                <Badge tone="neutral">
                  {snapshot.season.isCurrent ? 'Live' : snapshot.season.label}
                </Badge>
              }
            />
            <div className="mt-4">
              {scope === 'players' && !hasPlayers ? (
                <EmptyState
                  title="No player data in this edition"
                  description="The active source does not supply per-player statistics here."
                />
              ) : scope === 'clubs' ? (
                <ClubScatter snapshot={snapshot} searchParams={searchParams} suffix={suffix} />
              ) : (
                <PlayerScatter snapshot={snapshot} searchParams={searchParams} suffix={suffix} />
              )}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function ClubScatter({
  snapshot, searchParams, suffix,
}: {
  snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']>;
  searchParams: { scope?: string; x?: string; y?: string };
  suffix: string;
}) {
  const metrics = availableTeamMetrics(snapshot);
  // Defaults chosen to be immediately interesting rather than merely valid:
  // chances created against chances conceded is the shape of a season.
  const xKey = pick(searchParams.x, metrics, 'xGForPerGame', 'goalsForPerGame');
  const yKey = pick(searchParams.y, metrics, 'xGAgainstPerGame', 'goalsAgainstPerGame');
  const xm = findTeamMetric(xKey)!;
  const ym = findTeamMetric(yKey)!;

  const rows = teamRows(snapshot);
  const points: ScatterPoint[] = rows
    .map((r): ScatterPoint | null => {
      const x = xm.get(r);
      const y = ym.get(r);
      if (x === null || y === null) return null;
      return {
        id: r.team.id,
        label: r.team.name,
        short: r.team.code,
        x, y,
        href: `/teams/${r.team.id}${suffix}`,
        detail: [
          ['Position', String(r.standing.rank)],
          ['Points', String(r.standing.points)],
        ] as [string, string][],
      };
    })
    .filter((p): p is ScatterPoint => p !== null);

  const options = grouped(metrics).flatMap(([group, ms]) =>
    ms.map((m) => ({ value: m.key, label: m.label, group })),
  );

  return (
    <>
      <FilterBar>
        <ScopeToggle value="clubs" />
        <ParamSelect name="x" value={xKey} options={options} label="X axis" className="w-56" />
        <ParamSelect name="y" value={yKey} options={options} label="Y axis" className="w-56" />
        <ResetFilters params={['x', 'y', 'scope', 'pos', 'mins']} />
      </FilterBar>
      <div className="mx-auto max-w-4xl p-4">
        <Scatter
          points={points}
          labelMode="all"
          x={{ label: xm.label, short: xm.short, higherIsBetter: xm.higherIsBetter, format: xm.format }}
          y={{ label: ym.label, short: ym.short, higherIsBetter: ym.higherIsBetter, format: ym.format }}
        />
      </div>
    </>
  );
}

function PlayerScatter({
  snapshot, searchParams, suffix,
}: {
  snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']>;
  searchParams: { x?: string; y?: string; pos?: string; mins?: string };
  suffix: string;
}) {
  const metrics = availablePlayerMetrics(snapshot);
  const xKey = pick(searchParams.x, metrics, 'xGPer90', 'goalsPer90');
  const yKey = pick(searchParams.y, metrics, 'xAPer90', 'assistsPer90');
  const xm = findPlayerMetric(xKey)!;
  const ym = findPlayerMetric(yKey)!;

  const floor = minutesDefault(snapshot);
  const mins = Number(searchParams.mins ?? floor);
  const pos = (searchParams.pos ?? 'all') as Position | 'all';

  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  const points: ScatterPoint[] = playerRows(snapshot)
    .map((r): ScatterPoint | null => {
      const player = playerById.get(r.playerId);
      if (!player) return null;
      if (pos !== 'all' && player.position !== pos) return null;
      if (r.stats.minutes < mins) return null;
      const x = xm.get(r);
      const y = ym.get(r);
      if (x === null || y === null) return null;
      return {
        id: player.id,
        label: player.name,
        // Surname only on the chart; the full name lives in the tooltip.
        short: player.name.split(' ').slice(-1)[0] ?? player.name,
        x, y,
        href: `/players/${player.id}${suffix}`,
        detail: [
          ['Club', teamById.get(player.teamId)?.shortName ?? '—'],
          ['Minutes', String(r.stats.minutes)],
        ] as [string, string][],
      };
    })
    .filter((p): p is ScatterPoint => p !== null);

  const options = grouped(metrics).flatMap(([group, ms]) =>
    ms.map((m) => ({ value: m.key, label: m.label, group })),
  );

  return (
    <>
      <FilterBar>
        <ScopeToggle value="players" />
        <ParamSelect name="x" value={xKey} options={options} label="X axis" className="w-56" />
        <ParamSelect name="y" value={yKey} options={options} label="Y axis" className="w-56" />
        <ParamToggle
          name="pos"
          value={pos}
          options={POSITIONS}
          label="Position"
          defaultValue="all"
        />
        <ParamNumber
          name="mins"
          value={mins}
          label="Min minutes"
          step={90}
          max={4000}
          defaultValue={floor}
        />
        <ResetFilters params={['x', 'y', 'pos', 'mins']} />
      </FilterBar>
      <div className="mx-auto max-w-4xl p-4">
        <Scatter
          points={points}
          labelMode="extremes"
          x={{ label: xm.label, short: xm.short, higherIsBetter: xm.higherIsBetter, format: xm.format }}
          y={{ label: ym.label, short: ym.short, higherIsBetter: ym.higherIsBetter, format: ym.format }}
        />
      </div>
    </>
  );
}

function ScopeToggle({ value }: { value: string }) {
  return (
    <ParamToggle
      name="scope"
      value={value}
      label="Compare"
      defaultValue="clubs"
      options={[
        { value: 'clubs', label: 'Clubs' },
        { value: 'players', label: 'Players' },
      ]}
    />
  );
}

/** Resolve a requested metric key, falling back through preferences. */
function pick<T>(
  requested: string | undefined,
  metrics: { key: string }[],
  ...fallbacks: string[]
): string {
  const has = (k: string) => metrics.some((m) => m.key === k);
  if (requested && has(requested)) return requested;
  for (const f of fallbacks) if (has(f)) return f;
  return metrics[0]?.key ?? '';
}
