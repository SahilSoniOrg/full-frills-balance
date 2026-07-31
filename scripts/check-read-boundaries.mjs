#!/usr/bin/env node
/**
 * Keeps currency reads behind CurrencyReadService.
 * Currency initialization is the one intentional service-side repository exception;
 * all other service consumers should use the read boundary.
 */
import { execSync } from 'child_process';

const allowed = new Set([
  'src/services/currency-read-service.ts',
  'src/services/currency-init-service.ts',
]);

let matches = '';
try {
  matches = execSync(
    "git grep -n \"data/repositories/CurrencyRepository\" -- 'src/services/**/*.ts' 'src/services/**/*.tsx'",
    { encoding: 'utf8' },
  );
} catch {
  matches = '';
}

const offending = matches
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .filter(line => !allowed.has(line.split(':', 1)[0]));

if (offending.length > 0) {
  console.error(
    'Read-boundary check FAILED: currency repository imports must use currency-read-service:\n  ' +
      offending.join('\n  '),
  );
  process.exit(1);
}

console.log('Read-boundary check OK: currency reads use currency-read-service.');
