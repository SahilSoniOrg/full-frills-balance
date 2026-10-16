import { createHash } from 'node:crypto';
import { parseRowEnvelope } from '@/src/services/crypto/protocol/envelopeJson';
import { parseRowManifest } from '@/src/services/crypto/protocol/rowEnvelope';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enrolledKeyHierarchy, memoryKeyHierarchy, closeNativeHost } from './nativeTestContext';
import { createBackupZip, parseBackupZip } from '@/src/services/sync/backupFile';
import { canonicalRowBytes, decodeCanonicalRow } from '@/src/services/sync/shortKeys';
import { decodeUtf8 } from '@/src/services/crypto/protocol/tlv';
import { computeMerkleRoot } from '@/src/services/crypto/protocol/merkle';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { verifyRowManifest } from '@/src/services/sync/manifestVerify';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
afterEach(closeNativeHost);
const directory = join(__dirname, 'fixtures');
const content = {
  name: 'PUBLIC SYNTHETIC TEST ONLY',
  icon: 'wallet',
  defaultCurrencyCode: 'USD',
  safeToSpendDays: 60,
  currencyPrecisions: { USD: 2 },
};

// This opt-in capture runs against the saved PRE-refactor host, before core edits.
// Normal tests only read the committed archive; they never regenerate expectations.
const capture = process.env.FFB_CAPTURE_COMPATIBILITY === '1' ? it : it.skip;
capture('captures public test-only pre-refactor archive and credential', async () => {
  const ctx = await enrolledKeyHierarchy('public-synthetic-workplace');
  const plaintext = decodeUtf8(canonicalRowBytes('workplace', content));
  const envelopes = await ctx.hierarchy.encryptRows(ctx.identity, ctx.workplaceId, [
    {
      table: 'workplace',
      rowId: ctx.workplaceId,
      updatedAt: 1797000000000,
      deleted: false,
      schemaVersion: 35,
      dictId: 'workplace/v1',
      plaintext,
    },
  ]);
  const fields = {
    formatVersion: 1 as const,
    workplaceId: ctx.workplaceId,
    keyId: (await ctx.hierarchy.exportWorkplaceKeys(ctx.identity, ctx.workplaceId)).keyId,
    id: 'public-synthetic-manifest',
    seq: 0,
    prevHash: new Uint8Array(32),
    authorUserId: ctx.identity.userId,
    authorDeviceId: ctx.identity.registeredDeviceId,
    rowCount: envelopes.length,
    root: await computeMerkleRoot(envelopes.map(parseRowEnvelope), envelopes.length),
    createdAt: 1797000000000,
  };
  const signature = await ctx.hierarchy.signRowManifest(ctx.identity, fields);
  const archive = createBackupZip(
    {
      envelopes,
      manifest: {
        ...fields,
        prevHash: keyHex(fields.prevHash),
        root: keyHex(fields.root),
        signature,
      },
    },
    await ctx.hierarchy.exportWorkplaceKeys(ctx.identity, ctx.workplaceId),
    await ctx.hierarchy.exportUserRecoveryPackage(
      ctx.identity.userId,
      ctx.identity.registeredDeviceId,
    ),
  );
  writeFileSync(join(directory, 'public-pre-refactor-backup.zip'), archive);
  const credential = await ctx.host.execute('test.exportCredential', ctx.userCredential);
  writeFileSync(
    join(directory, 'public-pre-refactor-recovery.json'),
    JSON.stringify(credential, null, 2) + '\n',
  );
});

it('verifies and recovers the fixed pre-refactor archive, then round-trips fresh output', async () => {
  const archive = readFileSync(join(directory, 'public-pre-refactor-backup.zip'));
  const recovery = readFileSync(join(directory, 'public-pre-refactor-recovery.json'));
  expect(createHash('sha256').update(archive).digest('hex')).toBe(
    '3472737b158cb7396a6b6b4a15108a6497822c7296fb79f62daccde4312174a2',
  );
  expect(createHash('sha256').update(recovery).digest('hex')).toBe(
    '83a5d43e81b16b19c8bd87ed649636b328b7ff08b64b168d0154fc2dd0fee45d',
  );
  const backup = parseBackupZip(new Uint8Array(archive));
  const ctx = memoryKeyHierarchy();
  const credential = (await ctx.host.execute('test.importCredential', {
    credential: JSON.parse(
      readFileSync(join(directory, 'public-pre-refactor-recovery.json'), 'utf8'),
    ),
  })) as RecoveryCredential;
  const identity = await ctx.hierarchy.recoverUserDevice(
    credential,
    backup.userRecoveryPackage,
    'new-independent-device',
  );
  const scope = {
    workplaceId: backup.workplaceKeys.workplaceId,
    keyId: backup.workplaceKeys.keyId,
    authorUserId: identity.userId,
  };
  const verified = await verifyRowManifest(
    backup.manifest,
    scope,
    backup.userRecoveryPackage.publicIdentity,
    identity.userKeyFingerprint,
  );
  expect(
    keyHex(
      await computeMerkleRoot(backup.envelopes.map(parseRowEnvelope), backup.envelopes.length),
    ),
  ).toBe(backup.manifest.root);
  expect(verified.signature).toBe(backup.manifest.signature);
  const rows = await ctx.hierarchy.decryptRows(
    identity,
    scope.workplaceId,
    backup.envelopes,
    backup.workplaceKeys,
  );
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row.ok) throw new Error(row.error);
  expect(
    decodeCanonicalRow('workplace', row.schemaVersion, new TextEncoder().encode(row.plaintext)),
  ).toEqual(content);
  await ctx.hierarchy.installWorkplaceKeys(identity, backup.workplaceKeys);
  const fresh = await ctx.hierarchy.encryptRows(identity, scope.workplaceId, [
    {
      table: row.table,
      rowId: row.rowId,
      schemaVersion: row.schemaVersion,
      dictId: row.dictId,
      plaintext: row.plaintext,
      updatedAt: 1797000000000,
      deleted: false,
    },
  ]);
  expect(await ctx.hierarchy.decryptRows(identity, scope.workplaceId, fresh)).toEqual(rows);
  // Allows the saved pre-refactor host to independently decrypt refactored output.
  const fields = {
    ...verified.fields,
    id: 'new-public-synthetic-output',
    authorDeviceId: identity.registeredDeviceId,
    root: await computeMerkleRoot(fresh.map(parseRowEnvelope), fresh.length),
  };
  const manifest = {
    ...fields,
    formatVersion: 1,
    prevHash: keyHex(fields.prevHash),
    root: keyHex(fields.root),
    signature: await ctx.hierarchy.signRowManifest(identity, fields),
  };
  if (process.env.FFB_COMPATIBILITY_OUTPUT)
    writeFileSync(
      process.env.FFB_COMPATIBILITY_OUTPUT,
      JSON.stringify({ envelopes: fresh, manifest }),
    );
  if (process.env.FFB_COMPATIBILITY_INPUT) {
    const incoming = JSON.parse(readFileSync(process.env.FFB_COMPATIBILITY_INPUT, 'utf8'));
    expect(
      await ctx.hierarchy.decryptRows(identity, scope.workplaceId, incoming.envelopes),
    ).toEqual(rows);
    const parsed = parseRowManifest(incoming.manifest, scope);
    expect(await ctx.hierarchy.signRowManifest(identity, parsed.fields)).toBe(
      incoming.manifest.signature,
    );
  }
});
