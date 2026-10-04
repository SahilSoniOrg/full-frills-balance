import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectPrimitiveUsage, formatReport } from '../check-design-system-primitives.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-system-primitives-'));
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  return root;
}

test('reports raw View and Text imports in production UI only', t => {
  const root = fixture({
    'src/features/accounts/view.tsx': `
      import { Text, View as NativeView } from 'react-native';
      export const view = () => <NativeView><Text /></NativeView>;
    `,
    'src/components/shared/label.tsx': `
      import { TextInput } from 'react-native';
      export const label = TextInput;
    `,
    'src/features/accounts/__tests__/view.test.tsx':
      "import { Text, View } from 'react-native';\nexport const ignored = [Text, View];\n",
    'src/design-system/Stack.tsx':
      "import { View } from 'react-native';\nexport const ignored = View;\n",
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const report = collectPrimitiveUsage(root);

  assert.equal(report.filesScanned, 2);
  assert.deepEqual(report.counts, {
    View: { files: 1, imports: 1 },
    Text: { files: 1, imports: 1 },
  });
  assert.deepEqual(report.files, [
    { file: 'src/features/accounts/view.tsx', primitives: ['Text', 'View'] },
  ]);
  assert.match(formatReport(report), /report-only/);
});

test('returns an empty report when no configured source roots exist', t => {
  const root = fixture({});
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(collectPrimitiveUsage(root), {
    files: [],
    filesScanned: 0,
    counts: {
      View: { files: 0, imports: 0 },
      Text: { files: 0, imports: 0 },
    },
  });
});
