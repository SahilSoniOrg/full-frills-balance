import fs from 'node:fs';
import madge from 'madge';

const BASELINE_PATH = 'scripts/dependency-cycle-baseline.json';

const result = await madge('src', {
  fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  tsConfig: 'tsconfig.json',
  excludeRegExp: [/__tests__/, /\.test\.tsx?$/],
});
const actual = result.circular().map(cycle => cycle.map(file => `src/${file}`).join(' -> '));
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).cycles;
const additions = actual.filter(cycle => !baseline.includes(cycle));
const stale = baseline.filter(cycle => !actual.includes(cycle));

if (additions.length || stale.length) {
  if (additions.length) console.error(`New dependency cycles:\n  ${additions.join('\n  ')}`);
  if (stale.length) console.error(`Stale dependency-cycle baseline entries:\n  ${stale.join('\n  ')}`);
  process.exit(1);
}

console.log(`Dependency-cycle guard OK: ${actual.length} baseline cycle(s).`);
