import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeFeatureBoundaries } from '../check-feature-boundaries.mjs';

function analyzeFixture(files, allowlist = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'feature-boundary-'));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = path.join(rootDir, relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, source);
    }

    const allowlistPath = path.join(rootDir, 'scripts/cross-feature-boundary-allowlist.json');
    mkdirSync(path.dirname(allowlistPath), { recursive: true });
    writeFileSync(allowlistPath, JSON.stringify(allowlist));

    return analyzeFeatureBoundaries({ rootDir, allowlistPath });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('rejects production-neutral imports into feature implementations', () => {
  const result = analyzeFixture({
    'src/components/AccountSummary.tsx':
      "import { AccountPickerModal } from '@/src/features/accounts';",
  });

  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /src\/components\/AccountSummary\.tsx/);
  assert.match(result.violations[0], /@\/src\/features\/accounts/);
});

test('accepts production-neutral imports into other neutral modules', () => {
  const result = analyzeFixture({
    'src/components/AccountSummary.tsx':
      "import { useThing } from '@/src/hooks/useThing';",
  });

  assert.deepEqual(result.violations, []);
});

test('accepts a feature import into its own implementation', () => {
  const result = analyzeFixture({
    'src/features/accounts/components/AccountScreen.tsx':
      "import { helper } from '@/src/features/accounts/helpers/helper';",
  });

  assert.deepEqual(result.violations, []);
});

test('accepts an approved cross-feature public barrel import', () => {
  const result = analyzeFixture(
    {
      'src/features/accounts/components/AccountScreen.tsx':
        "import { JournalThing } from '@/src/features/journal';",
    },
    { accounts: ['journal'] },
  );

  assert.deepEqual(result.violations, []);
  assert.deepEqual([...result.actualEdges], ['accounts->journal']);
});

test('rejects deep cross-feature imports', () => {
  const result = analyzeFixture(
    {
      'src/features/accounts/components/AccountScreen.tsx':
        "import { JournalThing } from '@/src/features/journal/components/JournalThing';",
    },
    { accounts: ['journal'] },
  );

  assert.ok(result.violations.some(violation => violation.includes('deep cross-feature import')));
});

test('rejects unapproved cross-feature public barrel imports', () => {
  const result = analyzeFixture(
    {
      'src/features/accounts/components/AccountScreen.tsx':
        "import { JournalThing } from '@/src/features/journal';",
    },
    { accounts: [] },
  );

  assert.ok(result.violations.some(violation => violation.includes('accounts->journal')));
});

test('rejects stale allowlist entries', () => {
  const result = analyzeFixture({}, { accounts: ['journal'] });

  assert.deepEqual(result.violations, [
    'stale allowlist entry accounts->journal; remove it so the dependency cannot return',
  ]);
});

test('excludes neutral test fixtures from production dependency checks', () => {
  const result = analyzeFixture({
    'src/components/__tests__/AccountSummary.test.tsx':
      "import { AccountPickerModal } from '@/src/features/accounts';",
  });

  assert.deepEqual(result.violations, []);
});
