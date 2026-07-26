#!/usr/bin/env node
/**
 * Ensures the broad JournalRepository migration façade stays deleted.
 *
 * The all-purpose gateway was removed (plan commit 21). Journal persistence is
 * now accessed by intent through modules under src/data/repositories/journal/:
 *   - journalTimelineModule  (list / by-id / observation / enrichment reads)
 *   - journalWriteModule     (create / update / delete / reversal)
 *   - journalPlannedModule   (planned-payment scheduling lookups)
 *   - journalSmsModule       (SMS-dedup lookups)
 *   - journalMetadataModule  (metadata lookup / patch)
 *
 * This check fails if the façade file returns or if any module imports it,
 * preventing the gateway pattern from reappearing under the same name.
 *
 * Usage:
 *   node scripts/check-journal-repository-facade.mjs
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FACADE_PATH = path.join(ROOT, 'src/data/repositories/JournalRepository.ts');

if (fs.existsSync(FACADE_PATH)) {
  console.error(
    'JournalRepository façade check FAILED: src/data/repositories/JournalRepository.ts has reappeared.\n' +
      'Add persistence capabilities to an intent module under src/data/repositories/journal/ instead.',
  );
  process.exit(1);
}

let matches = '';
try {
  matches = execSync(
    "git grep -n \"repositories/JournalRepository'\" -- 'src/**/*.ts' 'src/**/*.tsx'",
    { cwd: ROOT, encoding: 'utf8' },
  );
} catch {
  // git grep exits non-zero when there are no matches — that is the success case.
  matches = '';
}

const offending = matches
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean);

if (offending.length > 0) {
  console.error(
    'JournalRepository façade check FAILED: found imports of the deleted façade:\n  ' +
      offending.join('\n  ') +
      '\nImport from a journal intent module under src/data/repositories/journal/ instead.',
  );
  process.exit(1);
}

console.log('JournalRepository façade OK: façade deleted; callers use journal intent modules.');
process.exit(0);
