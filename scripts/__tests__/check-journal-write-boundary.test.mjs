import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectJournalWriteBoundaryFindings } from '../check-journal-write-boundary.mjs';

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-write-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/services/journal/bulk'), { recursive: true });
  return root;
}

test('allows the new persistence service and the description-only maintenance command', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/services/journal/JournalPersistenceService.ts'),
    "import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';\njournalPersistenceRepository.put(input, workplaceId);\n",
  );
  fs.writeFileSync(
    path.join(root, 'src/services/journal/bulk/bulkRename.ts'),
    "import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';\njournalWriteRepository.bulkUpdateDescriptions(workplaceId, journals, renames);\n",
  );

  assert.deepEqual(collectJournalWriteBoundaryFindings(root), []);
});

test('rejects legacy journal services and direct financial repository calls', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/services/unsafe.ts'),
    [
      "import { ledgerCreateService } from '@/src/services/ledger/ledgerCreateService';",
      "import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';",
      'ledgerCreateService.createJournal(data, workplaceId);',
      'journalWriteRepository.updateJournalWithTransactions(workplaceId, journalId, data);',
    ].join('\n'),
  );

  const findings = collectJournalWriteBoundaryFindings(root);
  assert.equal(findings.length, 3);
  assert.ok(findings.some(finding => finding.message.includes('imports legacy journal service')));
  assert.ok(findings.some(finding => finding.message.includes('legacy journal write repository')));
  assert.ok(findings.some(finding => finding.message.includes('updateJournalWithTransactions')));
});

test('rejects non-description writes through the maintenance exception', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/services/journal/bulk/bulkRename.ts'),
    "import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';\njournalWriteRepository.bulkSoftDeleteJournals(workplaceId, ids);\n",
  );

  const findings = collectJournalWriteBoundaryFindings(root);
  assert.equal(findings.length, 2);
  assert.ok(
    findings.some(finding => finding.message.includes('not allowed in this maintenance command')),
  );
});
