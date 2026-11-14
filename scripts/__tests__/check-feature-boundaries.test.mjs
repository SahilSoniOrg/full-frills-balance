import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Linter } from 'eslint';
import { analyzeFeatureBoundaries } from '../check-feature-boundaries.mjs';
import domainPolicy from '../lib/domain-boundary-policy.cjs';

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

test('editor package restrictions distinguish local domain paths from Node builtins', () => {
  const linter = new Linter();
  const config = {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: domainPolicy.DOMAIN_FORBIDDEN_PACKAGE_REGEX }],
        },
      ],
    },
  };
  assert.deepEqual(linter.verify("import '@/src/domain/money/money';", config), []);
  assert.deepEqual(linter.verify("import '@/src/constants/currency-definitions';", config), []);
  assert.equal(linter.verify("import 'domain';", config).length, 1);
  assert.equal(linter.verify("import 'react-native';", config).length, 1);
});

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
    'src/components/AccountSummary.tsx': "import { useThing } from '@/src/hooks/useThing';",
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

test('rejects relative cross-feature imports', () => {
  const result = analyzeFixture(
    {
      'src/features/accounts/components/AccountScreen.tsx':
        "import { JournalThing } from '../../journal';",
    },
    { accounts: ['journal'] },
  );

  assert.ok(result.violations.some(violation => violation.includes('accounts->journal')));
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

// Domain policy applies to resolved ownership, independent of the spelling of an import.
test('rejects relative domain imports into persistence', () => {
  const result = analyzeFixture({
    'src/domain/rule.ts': "import { load } from '../data/repository'; export const value = load();",
    'src/data/repository.ts': 'export const load = () => 1;',
  });
  assert.ok(result.violations.some(message => message.includes('src/data/repository.ts')));
});

test('rejects a forbidden directory barrel without a trailing import path', () => {
  const result = analyzeFixture({
    'src/domain/rule.ts': "export { load } from '@/src/services';",
    'src/services/index.ts': 'export const load = () => 1;',
  });
  assert.ok(result.violations.some(message => message.includes('src/services/index.ts')));
});

test('follows configured aliases to their resolved ownership', () => {
  const result = analyzeFixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '#storage/*': ['./src/data/*'] } },
    }),
    'src/domain/rule.ts': "export { load } from '#storage/repository';",
    'src/data/repository.ts': 'export const load = () => 1;',
  });
  assert.ok(result.violations.some(message => message.includes('src/data/repository.ts')));
});

test('reports the complete dependency chain through a neutral re-export', () => {
  const result = analyzeFixture({
    'src/domain/rule.ts': "import { load } from '../utils/bridge'; export const value = load();",
    'src/utils/bridge.ts': "export { load } from '../data/repository';",
    'src/data/repository.ts': 'export const load = () => 1;',
  });
  assert.ok(
    result.violations.some(message =>
      message.includes('src/domain/rule.ts -> src/utils/bridge.ts -> src/data/repository.ts'),
    ),
  );
});

for (const suffix of ['native', 'ios', 'android', 'web']) {
  test(`inspects the ${suffix} adapter behind a neutral import`, () => {
    const result = analyzeFixture({
      'src/domain/rule.ts': "import { value } from '../utils/bridge'; export const result = value;",
      'src/utils/bridge.ts': 'export const value = 1;',
      [`src/utils/bridge.${suffix}.ts`]: "import 'expo-file-system'; export const value = 1;",
    });
    assert.ok(
      result.violations.some(message =>
        message.includes(`bridge.${suffix}.ts -> expo-file-system`),
      ),
    );
  });
}

for (const expression of ["require('../data/repository')", "import('../data/repository')"]) {
  test(`rejects domain runtime loading through ${expression}`, () => {
    const result = analyzeFixture({
      'src/domain/rule.ts': `export const load = () => ${expression};`,
      'src/data/repository.ts': 'export const value = 1;',
    });
    assert.ok(result.violations.some(message => message.includes('src/data/repository.ts')));
  });
}

test('rejects a module loader whose dependency cannot be resolved statically', () => {
  const result = analyzeFixture({
    'src/domain/rule.ts': 'export const load = (specifier: string) => import(specifier);',
  });
  assert.ok(result.violations.some(message => message.includes('cannot be resolved statically')));
});

test('forbids direct type coupling to persistence while permitting neutral DTO types', () => {
  const result = analyzeFixture({
    'src/domain/valid.ts':
      "import type { Dto } from '../types/contracts'; export const use = (dto: Dto) => dto.id;",
    'src/types/contracts.ts':
      "import { renderer } from '../components/renderer'; export interface Dto { id: string; view?: ReturnType<typeof renderer>; }",
    'src/components/renderer.ts': 'export const renderer = () => null;',
    'src/domain/invalid.ts': "export type { StoredDto } from '../data/repository';",
    'src/data/repository.ts': 'export interface StoredDto { id: string; }',
  });
  assert.ok(result.violations.some(message => message.includes('src/domain/invalid.ts')));
  assert.ok(result.violations.every(message => !message.includes('src/domain/valid.ts')));
});

test('ignores import-like text and domain test fixtures', () => {
  const result = analyzeFixture({
    'src/domain/rule.ts': `// import 'react-native';\nexport const text = "import('expo-file-system')";`,
    'src/domain/__tests__/rule.test.ts': "import 'react-native';",
  });
  assert.deepEqual(result.violations, []);
});

test('applies domain ownership restrictions to JavaScript entry points too', () => {
  const result = analyzeFixture({
    'src/domain/rule.js': "export { load } from '../data/repository';",
    'src/data/repository.ts': 'export const load = () => 1;',
  });
  assert.ok(result.violations.some(message => message.includes('src/domain/rule.js')));
});

test('rejects implicit JSX platform imports injected by the compiler', () => {
  const result = analyzeFixture({
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
    'src/domain/rule.tsx': 'export const render = () => <div />;',
  });
  assert.ok(result.violations.some(message => message.includes('react/jsx-runtime')));
});
