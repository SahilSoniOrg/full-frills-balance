import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  collectBrandedCastFindings,
  createProgramFromRoot,
} from '../check-redundant-branded-casts.mjs';
import { createTempFixtureRoot, writeFixtureTree } from './temp-fixture.mjs';

function fixture(t, files) {
  const root = createTempFixtureRoot(t, 'branded-casts-');
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: 'ES2022' },
      include: ['src/**/*.ts'],
    }),
  );
  writeFixtureTree(root, files);
  return root;
}

const BRANDS = `
export declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };
export type JournalId = Brand<string, 'JournalId'>;
export const asJournalId = (id: string): JournalId => id as JournalId;
`;

test('flags recasts of values that are already branded', t => {
  const root = fixture(t, {
    'src/types/domain.ts': BRANDS,
    'src/features/journal.ts': `
import { asJournalId, type JournalId } from '../types/domain';
const id: JournalId = asJournalId('j1');
export const again = id as JournalId;
`,
  });
  const { redundant, remaining } = collectBrandedCastFindings(
    createProgramFromRoot(root),
    root,
  );
  assert.equal(redundant.length, 1);
  assert.match(redundant[0].message, /id as JournalId/);
  assert.equal(remaining.length, 1);
  assert.match(remaining[0].file, /types\/domain/);
});

test('allows branding a raw string at the boundary', t => {
  const root = fixture(t, {
    'src/types/domain.ts': BRANDS,
    'src/features/route.ts': `
import { asJournalId } from '../types/domain';
export const parse = (raw: string) => asJournalId(raw);
`,
  });
  const { redundant } = collectBrandedCastFindings(createProgramFromRoot(root), root);
  assert.equal(redundant.length, 0);
});

test('ignores tests', t => {
  const root = fixture(t, {
    'src/types/domain.ts': BRANDS,
    'src/features/journal.test.ts': `
import { asJournalId, type JournalId } from '../types/domain';
const id: JournalId = asJournalId('j1');
export const again = id as JournalId;
`,
  });
  const { redundant } = collectBrandedCastFindings(createProgramFromRoot(root), root);
  assert.equal(redundant.length, 0);
});
