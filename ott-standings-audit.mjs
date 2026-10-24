import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const source = readFileSync(new URL('./oan-tu-ti-ai-arena-main/competition/store.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('export async function standings(');
const end = source.indexOf('\nasync function advance(', begin);
if (begin < 0 || end < 0) throw new Error('Could not locate standings implementation');
// Evaluate only this inspected project function in the same realm as fixtures,
// avoiding cross-context callback overhead unrelated to production behavior.
const standings = new Function('return (' + source.slice(begin, end).replace(/^export /, '') + ')')();
const results = [];
for (const [count, groupCount] of [[100, 32], [4000, 128]]) {
  const entries = Array.from({ length: count }, (_, i) => ({ team: `t${i}`, name: `Team ${i}`, group_no: i % groupCount + 1, seed: i + 1 }));
  const groups = Array.from({ length: groupCount }, (_, g) => entries.filter(x => x.group_no === g + 1));
  const series = [], games = [];
  for (const group of groups) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
    series.push({ a: group[a].team, b: group[b].team, status: 'done', winner: null });
    games.push({ p1: group[a].team, p2: group[b].team, winner: null }, { p1: group[b].team, p2: group[a].team, winner: null });
  }
  const db = { prepare(sql) { return { async all() {
    if (sql.startsWith('SELECT x.*')) return entries;
    if (sql.startsWith('SELECT * FROM series')) return series;
    if (sql.startsWith('SELECT g.p1')) return games;
    throw new Error('Unexpected query');
  } }; } };
  const start = performance.now();
  const rows = await standings(db, 'synthetic');
  results.push({ accounts: count, groupCount, series: series.length, games: games.length, returnedRows: rows.length, jsComputationMs: Math.round(performance.now() - start), tiedCohortSeriesChecks: count * series.length });
}
const report = { scope: 'Exact standings function extracted from current source; synthetic completed draws; in-memory query stubs. Measures JavaScript computation only, excluding DB, HTTP, authentication and real bot execution. One run per size; not a production load test.', measuredAt: new Date().toISOString(), results };
writeFileSync(new URL('./ott-standings-audit.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
