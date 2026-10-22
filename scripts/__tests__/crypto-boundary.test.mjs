import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cryptoImportViolations, nativeCryptoProfileViolations } from '../lib/crypto-boundary.mjs';

test('crypto rejects financial, repository and UI imports including type-only and relative references', () => {
  for (const source of [
    "import type { RowTable } from '../../sync/rowTables';",
    "export type { RowTable } from '@/src/services/sync/rowTables';",
    "type R = import('@/src/data/models/Account').default;",
    "const r = require('@/src/data/repositories/account');",
    "import('@/src/screens/Home');",
    "import View from '@/app/index';",
    "import Repository = require('@/src/data/repositories/account');",
    "import type { X } from '@/src/services/preferences';",
  ])
    assert.equal(cryptoImportViolations(source, 'src/services/crypto/protocol/check.ts').length, 1);
  assert.deepEqual(
    cryptoImportViolations(
      "import { cryptoProvider } from '@/src/services/backup/cryptoProvider';",
      'src/services/crypto/protocol/check.ts',
    ),
    [],
  );
});
test('protected hierarchy cannot import the app profile; workflows can', () => {
  const source = "import type { RowTable } from '../sync/rowTables';";
  assert.equal(
    cryptoImportViolations(source, 'src/services/backup/localKeyHierarchy.ts').length,
    1,
  );
  assert.deepEqual(cryptoImportViolations(source, 'src/services/sync/buildCommit.ts'), []);
});
test('native financial lists are forbidden in handwritten core', () => {
  const source = 'constexpr auto TABLES = {"accounts"};';
  assert.equal(
    nativeCryptoProfileViolations(source, 'modules/expo-key-crypto/cpp/RowCodec.cpp', ['accounts'])
      .length,
    1,
  );
  assert.deepEqual(
    nativeCryptoProfileViolations(
      'requireRowCompression(compression);',
      'modules/expo-key-crypto/cpp/RowCrypto.cpp',
      ['accounts'],
    ),
    [],
  );
});
