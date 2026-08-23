import { loadCompetition } from '../src/data/providers/fotmob';
import { fetchOdds, findOddsFor, normaliseTeamName, oddsBudget } from '../src/data/providers/oddsApi';
import { rateTeams } from '../src/analytics/ratings';
import { predictMatch } from '../src/analytics/poisson';
import { devig, computeEdge, isValue, edgeStrength } from '../src/analytics/betting';

const id = process.argv[2] ?? 'epl';
const snap = await loadCompetition(id, { maxDetailRequests: 6 });
const { teams, leagueAvgGoals } = rateTeams(snap);
const byId = new Map(teams.map(t => [t.id, t]));

const events = await fetchOdds(id, { force: true });
console.log(`\nodds events: ${events?.length ?? 0}   credits used this run: ${oddsBudget().used}`);
if (!events?.length) process.exit(1);

const upcoming = snap.matches
  .filter(m => m.status === 'SCHEDULED')
  .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  .slice(0, 25);

let joined = 0;
const missed: string[] = [];
console.log('\nFIXTURE                               MODEL H/D/A          MARKET H/D/A        BEST EDGE');
for (const m of upcoming) {
  const home = byId.get(m.homeTeamId); const away = byId.get(m.awayTeamId);
  if (!home || !away) continue;
  const ev = findOddsFor(events, home.name, away.name, m.kickoff);
  if (!ev) { missed.push(`${home.name} v ${away.name}`); continue; }
  joined++;

  const h2h = ev.quotes.find(q => q.market === 'h2h');
  if (!h2h) continue;
  const model = predictMatch(home, away, { leagueAvgGoals, venueKind: m.venueKind });
  const order = [ev.homeTeam, 'Draw', ev.awayTeam];
  const prices = order.map(l => h2h.outcomes.find(o => o.label === l)?.price ?? 0);
  if (prices.some(p => !p)) continue;
  const fair = devig(prices);
  const modelP = [model.homeWin, model.draw, model.awayWin];

  const edges = modelP.map((p, i) => computeEdge({
    modelProbability: p, price: prices[i]!, marketProbability: fair[i]!,
  }));
  const best = edges.reduce((a, b) => (b.expectedValue > a.expectedValue ? b : a));
  const bi = edges.indexOf(best);
  const flag = isValue(best) ? `${['1','X','2'][bi]} @${best.price.toFixed(2)} EV${(best.expectedValue*100).toFixed(1)}% ${edgeStrength(best)}` : '—';

  console.log(
    `${(home.shortName + ' v ' + away.shortName).slice(0,36).padEnd(37)} ` +
    `${modelP.map(p => (p*100).toFixed(0).padStart(3)).join('/')}   ` +
    `${fair.map(p => (p*100).toFixed(0).padStart(3)).join('/')}    ${flag}`
  );
}
console.log(`\njoined ${joined}/${upcoming.length} upcoming fixtures`);
if (missed.length) {
  console.log('MISSED JOINS (these silently vanish from Betting Edge):');
  for (const x of missed.slice(0, 12)) console.log('   -', x, '->', normaliseTeamName(x.split(' v ')[0]!));
  console.log('  odds-side names:', events.slice(0,6).map(e => e.homeTeam).join(' | '));
}
