#!/usr/bin/env node
/**
 * Ensures the broad JournalRepository migration façade stays deleted.
 *
 * The all-purpose gateway was removed (plan commit 21). Journal persistence is
 * now accessed by intent through modules under src/data/repositories/journal/:
 *   - journalQueryRepository            (scoped list / by-id / date-range reads)
 *   - JournalObserveQueries             (reactive read models)
 *   - JournalEnrichmentQueries           (timeline / suggestion enrichment)
 *   - JournalPersistenceRepository      (journal writes and lifecycle commands)
 *   - JournalPlannedQueries             (planned-payment scheduling lookups)
 *   - SmsJournalQueries                 (SMS-dedup lookups)
 *   - journalMetadataRepository         (metadata lookup / patch)
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
const LEGACY_QUERY_MODULES = [
  'src/data/repositories/journal/journalListQueryRepository.ts',
  'src/data/repositories/journal/journalTimelineModule.ts',
];

const legacyModules = LEGACY_QUERY_MODULES.filter(relativePath =>
  fs.existsSync(path.join(ROOT, relativePath)),
);
if (legacyModules.length > 0) {
  console.error(
    'Journal query compatibility modules FAILED: remove obsolete aliases and import the owning module directly.\n  ' +
      legacyModules.join('\n  '),
  );
  process.exit(1);
}

if (fs.existsSync(FACADE_PATH)) {
  console.error(
    'JournalRepository façade check FAILED: src/data/repositories/JournalRepository.ts has reappeared.\n' +
      'Add persistence capabilities to an intent module under src/data/repositories/journal/ instead.',
  );
  process.exit(1);
}

const PLANNED_PAYMENT_FACADE = path.join(ROOT, 'src/services/PlannedPaymentService.ts');
if (fs.existsSync(PLANNED_PAYMENT_FACADE)) {
  console.error(
    'PlannedPaymentService façade check FAILED: src/services/PlannedPaymentService.ts has reappeared.\n' +
      'Import planned-payment modules under src/services/planned-payment/ instead.',
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

console.log(
  'Journal repository boundaries OK: broad and compatibility façades deleted; callers use owning modules. PlannedPaymentService façade deleted.',
);
process.exit(0);
