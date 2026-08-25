import Link from 'next/link';
import { Card, CardHeader, Figure, Crest, TeamLabel, FormRun } from '@/components/ui';
import { entitySuffix } from '@/lib/entityLink';
import { FORM_MATCHES, WINDOW_DAYS, type TeamForm, type PlayerForm } from '@/analytics/form';

/**
 * Who is making waves, anywhere on earth.
 *
 * ── Why this is one module and not two leaderboards ────────────────────────
 * "Form" is a club answer and a player answer to the same question, and they
 * are read together: a side winning everything usually has somebody scoring
 * everything, and when they do not, that is the interesting part. Side by side
 * the reader can see which it is.
 *
 * ── The number next to the club is not the form ────────────────────────────
 * Five wins in one league is not five wins in another, and the honest options
 * are to adjust for it or to show it. Adjusting means dividing results by a
 * model whose ratings were built from those very results, which quietly cancels
 * the thing being measured. So the strength of the opposition faced sits beside
 * the run, on the shared cross-league scale, and the reader weighs it. A
 * perfect week against weak sides is visible as exactly that.
 */
export function TopForm({
  teams, players,
}: {
  teams: TeamForm[];
  players: PlayerForm[];
}) {
  if (!teams.length && !players.length) return null;

  return (
    <Card>
      <CardHeader
        eyebrow="Across every competition"
        title="Top form"
        description={`Clubs over their last ${FORM_MATCHES} matches in any competition; players over the last ${WINDOW_DAYS} days.`}
      />

      <div className="grid gap-6 p-4 md:grid-cols-2">
        <section>
          <h3 className="eyebrow mb-3">Clubs</h3>
          <ul className="space-y-2">
            {teams.map((t, i) => (
              <li
                key={`${t.competitionId}-${t.team.id}`}
                style={{ ['--reveal-i' as string]: Math.min(i, 8) }}
                className="animate-fade-up stagger"
              >
                <ClubRow form={t} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="eyebrow mb-3">Players</h3>
          <ul className="space-y-2">
            {players.map((p, i) => (
              <li
                key={p.playerId}
                style={{ ['--reveal-i' as string]: Math.min(i, 8) }}
                className="animate-fade-up stagger"
              >
                <PlayerRow form={p} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="border-t border-border-subtle px-4 py-3 text-2xs leading-relaxed text-ink-muted">
        Clubs are ranked on points won, then goal difference; the rating beside
        each is the average strength of the sides they faced, on the scale that
        places every league against every other. Players are counted from match
        events rather than season totals, so the list is the last fortnight and
        not the season — and it is the same fortnight everywhere, which is what
        makes a Riyadh goal and a Rotterdam goal comparable at all.
      </p>
    </Card>
  );
}

function ClubRow({ form }: { form: TeamForm }) {
  const suffix = entitySuffix(form.competitionId);
  return (
    <Link
      href={`/teams/${form.team.id}${suffix}`}
      style={{ ['--comp-active' as string]: `var(--comp-${form.accentKey})` }}
      className="group relative flex items-center gap-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-[2px] rounded-pill bg-[var(--comp-active)]"
      />
      <span className="min-w-0 flex-1">
        <TeamLabel
          name={form.team.shortName}
          code={form.team.code}
          crestUrl={form.team.crestUrl}
          size={20}
          nameClassName="text-sm"
        />
        <span className="mt-[0.125rem] block truncate text-2xs text-ink-muted">
          {form.competitionName}
          {/* A run drawn from a league and two cups is a different kind of
              week from five league games, and saying so costs three words. */}
          {form.competitions > 1 ? (
            <> · <Figure>{form.competitions}</Figure> competitions</>
          ) : null}
          {form.opposition !== null ? (
            <> · faced <Figure>{form.opposition}</Figure></>
          ) : null}
        </span>
      </span>

      <FormRun form={form.results} className="shrink-0" />

      <span className="shrink-0 text-right">
        <Figure className="block text-base font-semibold leading-none">{form.points}</Figure>
        <span className="mt-[0.125rem] block text-2xs text-ink-muted">
          <Figure>{form.goalsFor}</Figure>–<Figure>{form.goalsAgainst}</Figure>
        </span>
      </span>
    </Link>
  );
}

function PlayerRow({ form }: { form: PlayerForm }) {
  const suffix = entitySuffix(form.competitionId);
  return (
    <Link
      href={`/players/${form.playerId}${suffix}`}
      className="group flex items-center gap-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md"
    >
      <Crest url={form.crestUrl} code={form.teamCode} name={form.teamName} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{form.name}</span>
        <span className="mt-[0.125rem] block truncate text-2xs text-ink-muted">
          {form.teamName}
          <span className="ml-2 uppercase tracking-caps">{form.position}</span>
          {form.nationality ? <span className="ml-2">{form.nationality}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-right text-2xs text-ink-muted">
        <span className="block text-sm text-ink">
          <Figure className="font-semibold">{form.goals}</Figure>G{' '}
          <Figure className="font-semibold">{form.assists}</Figure>A
        </span>
        <span className="mt-[0.125rem] block">
          in <Figure>{form.matches}</Figure>{' '}
          {form.matches === 1 ? 'match' : 'matches'}
        </span>
      </span>
    </Link>
  );
}
