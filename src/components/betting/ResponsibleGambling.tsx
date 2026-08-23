/**
 * Responsible-gambling posture.
 *
 * Designed in from the start rather than bolted on, and deliberately placed
 * ABOVE the numbers rather than in a footer. A disclaimer under 400 rows of
 * odds is decoration; one the reader passes through on the way to the prices is
 * a message.
 *
 * The framing that matters most is the "+EV is not profit" point. It is the
 * specific misunderstanding this kind of product creates: a positive expected
 * value is a statement about the average of many identical bets under a model
 * assumed correct, not a prediction about the next one, and certainly not an
 * income. Everything else here is standard, but that sentence is the one doing
 * the real work.
 *
 * Help lines are jurisdiction-specific and deliberately listed for several
 * regions rather than guessed from an IP address — a wrong local number is
 * worse than a short list of correct ones.
 */
export function ResponsibleGamblingBanner() {
  return (
    <aside
      aria-labelledby="rg-heading"
      className="rounded-lg border border-border bg-surface-2 px-4 py-4"
    >
      <h2 id="rg-heading" className="text-sm font-semibold">
        Read this before you read the numbers
      </h2>

      <div className="mt-2 grid gap-x-6 gap-y-2 text-sm text-ink-secondary md:grid-cols-2">
        <p>
          <strong className="text-ink">A positive expected value is not profit.</strong>{' '}
          It is the average outcome of the same bet repeated many times,{' '}
          <em>assuming the model is right</em>. It says nothing about any single
          result, it does not compound into an income, and a run of losses is
          entirely consistent with it.
        </p>
        <p>
          <strong className="text-ink">The model is not better than the market.</strong>{' '}
          Major-league betting markets are among the most efficient consumer
          markets that exist. They price team news, injuries, motivation and money
          flow. This model prices none of those. Where it disagrees sharply, the
          model is the more likely to be wrong.
        </p>
        <p>
          <strong className="text-ink">This is analysis, not advice.</strong> Nothing
          here is a recommendation to place a bet. Staking figures describe a
          mathematical fraction of a hypothetical bankroll, not a suggestion that
          you should stake anything at all.
        </p>
        <p>
          <strong className="text-ink">Only ever risk money you can lose.</strong>{' '}
          Gambling is not a way to make money, recover losses, or solve a financial
          problem. Betting is 18+ (or the legal age where you live) and is
          restricted or illegal in some jurisdictions — that is your responsibility
          to check.
        </p>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:text-ink-secondary">
          Support and help lines
        </summary>
        <ul className="mt-2 grid gap-1 text-xs text-ink-secondary sm:grid-cols-2">
          <li>
            <span className="text-ink-muted">UK</span> — GamCare, 0808 8020 133 ·{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://www.begambleaware.org" rel="noopener noreferrer" target="_blank">
              BeGambleAware
            </a>
          </li>
          <li>
            <span className="text-ink-muted">Ireland</span> — Problem Gambling Ireland,
            089 241 5401
          </li>
          <li>
            <span className="text-ink-muted">US</span> — 1-800-GAMBLER ·{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://www.ncpgambling.org" rel="noopener noreferrer" target="_blank">
              NCPG
            </a>
          </li>
          <li>
            <span className="text-ink-muted">Canada</span> — ConnexOntario, 1-866-531-2600
          </li>
          <li>
            <span className="text-ink-muted">Australia</span> — Gambling Help Online, 1800 858 858
          </li>
          <li>
            <span className="text-ink-muted">Elsewhere</span> —{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://www.gamblersanonymous.org" rel="noopener noreferrer" target="_blank">
              Gamblers Anonymous
            </a>
          </li>
        </ul>
      </details>
    </aside>
  );
}
