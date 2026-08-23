import { loadCompetition } from '../src/data/providers/fotmob';
import { rateTeams } from '../src/analytics/ratings';
import { simulateSeason } from '../src/analytics/season';

const id = process.argv[2] ?? 'epl';
const snap = await loadCompetition(id, { maxDetailRequests: 20 });
const { teams, leagueAvgGoals } = rateTeams(snap);

const t0 = Date.now();
const { forecasts, runs, remainingFixtures } = simulateSeason(snap, teams, {
  goalModel: { leagueAvgGoals },
});
const ms = Date.now() - t0;

console.log(`\n${snap.competition.name} ${snap.season.label}`);
console.log(`league avg goals/team/game: ${leagueAvgGoals.toFixed(2)}`);
console.log(`${runs} runs over ${remainingFixtures} remaining fixtures in ${ms}ms\n`);

const byTitle = [...forecasts].sort((a, b) => b.winTitle - a.winTitle);
console.log('TEAM                  ATK   DEF   ELO   TITLE%  TOP4%   EUR%   REL%   PTS(p10-p50-p90)');
for (const f of byTitle.slice(0, 10)) {
  const t = teams.find(x => x.id === f.teamId)!;
  const p = f.projectedPoints;
  console.log(
    `${t.name.slice(0, 20).padEnd(20)} ${t.attackRating.toFixed(0).padStart(4)} ${t.defenseRating.toFixed(0).padStart(5)} ` +
    `${String(t.elo).padStart(5)}  ${(f.winTitle * 100).toFixed(1).padStart(5)}  ${(f.top4 * 100).toFixed(1).padStart(5)}  ` +
    `${(f.europeanQualification * 100).toFixed(1).padStart(5)}  ${(f.relegation * 100).toFixed(1).padStart(5)}   ` +
    `${String(p.p10).padStart(3)}-${String(p.p50).padStart(3)}-${String(p.p90).padStart(3)}`,
  );
}
const sums = {
  title: forecasts.reduce((s, f) => s + f.winTitle, 0),
  top4: forecasts.reduce((s, f) => s + f.top4, 0),
  rel: forecasts.reduce((s, f) => s + f.relegation, 0),
};
console.log(`\nsanity — title sums to ${sums.title.toFixed(4)}, top4 to ${sums.top4.toFixed(2)}, relegation to ${sums.rel.toFixed(2)}`);
