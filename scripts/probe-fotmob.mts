/**
 * Live probe: load a competition through the real adapter and assert the output
 * conforms. This is a BEHAVIOUR check, not an HTTP 200 check — it inspects
 * content, because the parent product's expensive lesson was that a feed can
 * return 200 all day while the field you depend on is empty.
 */
import { loadCompetition } from '../src/data/providers/fotmob';
import { checkSnapshot } from '../src/domain/schema';

const id = process.argv[2] ?? 'epl';
const snap = await loadCompetition(id, { detailWindowDays: 21, maxDetailRequests: 12 });

const { ok, errors } = checkSnapshot(snap);
console.log(`\n=== ${snap.competition.name} — ${snap.season.label} ===`);
console.log(`conformance: ${ok ? 'PASS' : 'FAIL'}`);
if (!ok) for (const e of errors.slice(0, 15)) console.log('   !', e);

console.log(`teams        ${snap.teams.length}`);
console.log(`matches      ${snap.matches.length} (finished ${snap.matches.filter(m => m.status === 'FINISHED').length})`);
console.log(`standings    ${snap.standings.length}`);
const withShots = snap.matches.filter(m => m.shots.length > 0);
console.log(`shot data    ${withShots.length} matches, ${withShots.reduce((n, m) => n + m.shots.length, 0)} shots`);
console.log(`capabilities ${JSON.stringify(snap.meta.capabilities)}`);
if (snap.meta.degraded) console.log(`degraded     ${snap.meta.degradedReason}`);

console.log('\n  # TEAM                 PL  W  D  L   GF  GA   GD  PTS   xG    xGA   xPTS  ZONE');
for (const r of snap.standings.slice(0, 8)) {
  const t = snap.teams.find(x => x.id === r.teamId);
  const f = (v: number | null, w = 5) => (v === null ? '   — ' : v.toFixed(1).padStart(w));
  console.log(
    `${String(r.rank).padStart(3)} ${(t?.name ?? r.teamId).slice(0, 20).padEnd(20)} ` +
    `${String(r.played).padStart(2)} ${String(r.won).padStart(2)} ${String(r.drawn).padStart(2)} ${String(r.lost).padStart(2)} ` +
    `${String(r.goalsFor).padStart(4)} ${String(r.goalsAgainst).padStart(3)} ${String(r.goalDifference).padStart(4)} ` +
    `${String(r.points).padStart(4)} ${f(r.xGFor)} ${f(r.xGAgainst)} ${f(r.expectedPoints)}  ${r.zone ?? ''}`,
  );
}

const sample = withShots[0];
if (sample) {
  const h = snap.teams.find(t => t.id === sample.homeTeamId)?.name;
  const a = snap.teams.find(t => t.id === sample.awayTeamId)?.name;
  console.log(`\nsample match: ${h} ${sample.homeScore}-${sample.awayScore} ${a}`);
  const hs = sample.teamStats[sample.homeTeamId];
  console.log(`  home xG ${hs?.xG}  poss ${hs?.possession}%  shots ${hs?.shots}  tilt ${hs?.fieldTilt}  ppda ${hs?.ppda}`);
  console.log(`  shots: ${sample.shots.length}, momentum points: ${sample.momentum?.length ?? 0}`);
  const s0 = sample.shots[0];
  if (s0) console.log(`  first shot: min ${s0.minute} xG ${s0.xG.toFixed(3)} at (${s0.x.toFixed(1)}, ${s0.y.toFixed(1)}) ${s0.bodyPart}/${s0.situation}/${s0.outcome}`);
}
process.exit(ok ? 0 : 1);
