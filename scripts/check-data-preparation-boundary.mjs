import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPreparationViolations } from './lib/data-preparation-boundary.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = dataPreparationViolations(root);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('Data preparation boundary OK, including transitive mobile/web imports.');
