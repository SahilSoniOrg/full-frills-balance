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

test('allows production callers to use the journal persistence boundary', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/services/journal/JournalPersistenceService.ts'),
    "import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';\njournalPersistenceRepository.put(input, workplaceId);\n",
  );
  assert.deepEqual(collectJournalWriteBoundaryFindings(root), []);
});

test('rejects imports from removed journal write modules', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/services/unsafe.ts'),
    [
      "import { ledgerCreateService } from '@/src/services/ledger/ledgerCreateService';",
      "import { ledgerUpdateService } from '@/src/services/ledger/ledgerUpdateService';",
      "import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';",
      "import { journalWriteRepository as testWriter } from '@/src/data/repositories/journal/journalWriteModule';",
    ].join('\n'),
  );

  const findings = collectJournalWriteBoundaryFindings(root);
  assert.equal(findings.length, 4);
  assert.ok(findings.every(finding => finding.message.includes('imports removed journal write module')));
});

test('rejects restoring a removed journal writer file', t => {
  const root = fixtureRoot(t);
  const removedWriter = path.join(root, 'src/data/repositories/journal/journalWriteRepository.ts');
  fs.mkdirSync(path.dirname(removedWriter), { recursive: true });
  fs.writeFileSync(removedWriter, 'export {};\n');

  assert.deepEqual(collectJournalWriteBoundaryFindings(root), [
    {
      file: 'src/data/repositories/journal/journalWriteRepository.ts',
      line: 1,
      message: 'Removed journal write layer file has been restored',
    },
  ]);
});
