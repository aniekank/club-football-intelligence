import { z } from 'zod';
import type { DatasetSnapshot } from './types';

/**
 * Runtime conformance for `DatasetSnapshot`.
 *
 * TypeScript checks the adapter's SOURCE; this checks the adapter's OUTPUT.
 * That distinction matters because every adapter here maps an untyped upstream
 * JSON blob, where a field the provider silently renames or starts returning as
 * a string type-checks perfectly and then poisons the whole app at runtime.
 *
 * The rules encoded below are the ones the parent product learned by shipping
 * the bugs:
 *
 *   • Optional numeric metrics are `number | null`, NEVER `number | undefined`
 *     collapsed to 0. `xG: 0` is a real, meaningful value (a team that created
 *     nothing); `xG: null` means the source cannot tell us. A schema that lets
 *     those collapse is how you get a league of teams all averaging 0.00 xG.
 *   • Probabilities are range-checked. A "probability" of 1.4 or −0.02 has
 *     escaped a normalisation step somewhere upstream and must fail loudly here
 *     rather than render as a 140% title chance.
 *   • Scores are nullable integers. A scheduled fixture has `null`, not 0.
 */

const iso = z.string().min(4);
const probability = z.number().min(0).max(1);
const nonNegative = z.number().min(0);

const positionSchema = z.enum(['GK', 'DF', 'MF', 'FW']);

const zoneSchema = z.object({
  kind: z.string(),
  fromRank: z.number().int().positive(),
  toRank: z.number().int().positive(),
  label: z.string(),
  shortLabel: z.string(),
});

export const competitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  format: z.enum(['league', 'knockout', 'group-knockout', 'league-phase-knockout']),
  tier: z.enum(['domestic-league', 'domestic-cup', 'continental', 'super-cup']),
  country: z.string(),
  countryCode: z.string(),
  accentKey: z.string(),
  // Always starts with points — a chain that does not is a construction error.
  tiebreakers: z.array(z.string()).min(1).refine((t) => t[0] === 'points', {
    message: 'tiebreaker chain must begin with "points"',
  }),
  headToHeadChain: z.array(z.string()).optional(),
  zones: z.array(zoneSchema).refine(
    (zones) => zones.every((z0) => z0.fromRank <= z0.toRank),
    { message: 'zone fromRank must not exceed toRank' },
  ),
  pointsForWin: z.number().int(),
  pointsForDraw: z.number().int(),
});

export const seasonSchema = z.object({
  id: z.string().min(1),
  competitionId: z.string().min(1),
  label: z.string().min(1),
  startYear: z.number().int(),
  startDate: iso,
  endDate: iso,
  numTeams: z.number().int().nonnegative(),
  totalMatchweeks: z.number().int().positive().nullable(),
  currentMatchweek: z.number().int().nonnegative().nullable(),
  isCurrent: z.boolean(),
  championTeamId: z.string().nullable(),
});

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(1),
  country: z.string(),
  countryCode: z.string(),
  crestUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  venue: z.string().nullable(),
  manager: z
    .object({
      name: z.string(),
      appointedAt: iso.nullable(),
      nationality: z.string().optional(),
    })
    .nullable(),
  elo: z.number(),
  attackRating: z.number(),
  defenseRating: z.number(),
});

export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().optional(),
  teamId: z.string().min(1),
  affiliations: z.array(
    z.object({
      teamId: z.string().min(1),
      from: iso,
      to: iso.nullable(),
      onLoan: z.boolean(),
    }),
  ),
  shirtNumber: z.number().int().nullable(),
  position: positionSchema,
  detailedPosition: z.string(),
  age: z.number().int().nullable(),
  birthDate: iso.nullable(),
  nationality: z.string().nullable(),
  photoUrl: z.string().nullable(),
  heightCm: z.number().nullable(),
  foot: z.enum(['left', 'right', 'both']).nullable(),
  marketValueEur: z.number().nullable(),
});

export const matchSchema = z.object({
  id: z.string().min(1),
  competitionId: z.string().min(1),
  seasonId: z.string().min(1),
  matchweek: z.number().int().nullable(),
  roundLabel: z.string(),
  kickoff: iso,
  status: z.enum(['SCHEDULED', 'LIVE', 'HALFTIME', 'FINISHED', 'POSTPONED', 'CANCELLED']),
  minute: z.number().int().nonnegative(),
  livePhase: z.enum(['ET', 'PEN', 'BREAK']).optional(),
  venueKind: z.enum(['home-away', 'neutral']),
  venue: z.string().nullable(),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  homeScore: z.number().int().nonnegative().nullable(),
  awayScore: z.number().int().nonnegative().nullable(),
  homeScoreHT: z.number().int().nonnegative().nullable(),
  awayScoreHT: z.number().int().nonnegative().nullable(),
  penalties: z.object({ home: z.number().int(), away: z.number().int() }).nullable(),
  aggregateMatchId: z.string().optional(),
  teamStats: z.record(z.string(), z.object({ teamId: z.string() }).passthrough()),
  events: z.array(z.object({ id: z.string(), matchId: z.string() }).passthrough()),
  shots: z.array(
    z
      .object({
        id: z.string(),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        xG: probability,
      })
      .passthrough(),
  ),
  lineups: z.record(z.string(), z.array(z.unknown())).optional(),
  formations: z.object({ home: z.string().nullable(), away: z.string().nullable() }).optional(),
  referee: z.string().nullable().optional(),
  attendance: z.number().nullable().optional(),
  momentum: z.array(z.object({ minute: z.number(), value: z.number() })).optional(),
})
  // A finished match with a missing score is the single most damaging shape a
  // provider can hand us: it silently drops from every table and every
  // aggregate, and the league quietly stops adding up.
  .refine(
    (m) => m.status !== 'FINISHED' || (m.homeScore !== null && m.awayScore !== null),
    { message: 'a FINISHED match must carry both scores' },
  );

const splitSchema = z.object({
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  points: z.number().int(),
});

export const standingRowSchema = z
  .object({
    seasonId: z.string(),
    competitionId: z.string(),
    teamId: z.string().min(1),
    groupId: z.string().nullable(),
    rank: z.number().int().positive(),
    played: z.number().int().nonnegative(),
    won: z.number().int().nonnegative(),
    drawn: z.number().int().nonnegative(),
    lost: z.number().int().nonnegative(),
    goalsFor: z.number().int().nonnegative(),
    goalsAgainst: z.number().int().nonnegative(),
    goalDifference: z.number().int(),
    points: z.number().int(),
    homeRecord: splitSchema,
    awayRecord: splitSchema,
    form: z.array(z.enum(['W', 'D', 'L'])),
    xGFor: nonNegative.nullable(),
    xGAgainst: nonNegative.nullable(),
    expectedPoints: z.number().nullable(),
    disciplinaryPoints: z.number().nonnegative(),
    zone: z.string().nullable(),
    titleProbability: probability.nullable(),
    top4Probability: probability.nullable(),
    relegationProbability: probability.nullable(),
    tiebreakerNote: z.string().nullable(),
  })
  // Internal arithmetic must agree with itself, or the table is lying about
  // something more basic than any tiebreaker.
  .refine((r) => r.won + r.drawn + r.lost === r.played, {
    message: 'W + D + L must equal played',
  })
  .refine((r) => r.goalsFor - r.goalsAgainst === r.goalDifference, {
    message: 'goalDifference must equal goalsFor - goalsAgainst',
  })
  .refine((r) => r.homeRecord.played + r.awayRecord.played === r.played, {
    message: 'home + away appearances must equal played',
  });

export const capabilitiesSchema = z.object({
  hasXG: z.boolean(),
  hasShotLocations: z.boolean(),
  hasLineups: z.boolean(),
  hasPlayerStats: z.boolean(),
  hasMomentum: z.boolean(),
  hasFormations: z.boolean(),
  hasManagers: z.boolean(),
  hasMarketValues: z.boolean(),
  hasOdds: z.boolean(),
  modeledMetrics: z.array(z.string()),
});

export const snapshotSchema = z
  .object({
    competition: competitionSchema,
    season: seasonSchema,
    relatedCompetitions: z.array(competitionSchema),
    memberships: z.array(
      z.object({
        teamId: z.string().min(1),
        seasonId: z.string(),
        competitionId: z.string(),
        groupId: z.string().nullable(),
        entryStage: z.string().nullable(),
      }),
    ),
    teams: z.array(teamSchema),
    players: z.array(playerSchema),
    playerStats: z.array(z.object({ playerId: z.string() }).passthrough()),
    matches: z.array(matchSchema),
    standings: z.array(standingRowSchema),
    generatedAt: iso,
    meta: z.object({
      source: z.string(),
      sourceLabel: z.string(),
      capabilities: capabilitiesSchema,
      fetchedAt: iso,
      degraded: z.boolean(),
      degradedReason: z.string().optional(),
    }),
  })
  // Referential integrity. A match pointing at a team that isn't in the snapshot
  // renders as a blank row with no name and no crest — the failure mode that
  // makes a page look broken without throwing anything.
  .superRefine((snap, ctx) => {
    const teamIds = new Set(snap.teams.map((t) => t.id));
    for (const m of snap.matches) {
      for (const side of [m.homeTeamId, m.awayTeamId]) {
        if (!teamIds.has(side)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `match ${m.id} references unknown team "${side}"`,
          });
        }
      }
    }
    for (const row of snap.standings) {
      if (!teamIds.has(row.teamId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `standings row references unknown team "${row.teamId}"`,
        });
      }
    }
    // Ranks must be a clean 1..n with no gaps or repeats, per group.
    const byGroup = new Map<string, number[]>();
    for (const row of snap.standings) {
      const key = row.groupId ?? '_';
      byGroup.set(key, [...(byGroup.get(key) ?? []), row.rank]);
    }
    for (const [group, ranks] of byGroup) {
      const sorted = [...ranks].sort((a, b) => a - b);
      const expected = sorted.map((_, i) => i + 1);
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `standings ranks in group "${group}" are not a contiguous 1..n sequence`,
        });
      }
    }
    // Capability honesty: claiming xG while no match carries any is exactly the
    // mismatch that produced the parent product's "shows 0" bug class.
    if (snap.meta.capabilities.hasXG && snap.matches.length > 0) {
      const anyXG = snap.matches.some((m) =>
        Object.values(m.teamStats).some(
          (s) => (s as { xG?: number | null }).xG !== null && (s as { xG?: number | null }).xG !== undefined,
        ),
      );
      if (!anyXG) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'meta.capabilities.hasXG is true but no match carries an xG value',
        });
      }
    }
  });

export interface ConformanceResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate an adapter's output. Called by every adapter's test, and once at
 * boot in development so a bad feed surfaces at startup rather than on the
 * page that happens to read the broken field.
 */
export function checkSnapshot(snapshot: unknown): ConformanceResult {
  const result = snapshotSchema.safeParse(snapshot);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`),
  };
}

/** Throwing variant for tests and the development boot path. */
export function assertSnapshot(snapshot: unknown): asserts snapshot is DatasetSnapshot {
  const { ok, errors } = checkSnapshot(snapshot);
  if (!ok) {
    throw new Error(
      `DatasetSnapshot failed conformance (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n  ` +
        errors.slice(0, 20).join('\n  '),
    );
  }
}
