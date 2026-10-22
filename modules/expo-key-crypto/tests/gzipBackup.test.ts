import { parseRowEnvelope } from '@/src/services/crypto/protocol/envelopeJson';
import { enrolledKeyHierarchy, closeNativeHost } from './nativeTestContext';
import { createBackupZip, parseBackupZip } from '@/src/services/sync/backupFile';
import { canonicalRowBytes, decodeCanonicalRow } from '@/src/services/sync/shortKeys';
import { decodeUtf8 } from '@/src/services/crypto/protocol/tlv';
import { computeMerkleRoot } from '@/src/services/crypto/protocol/merkle';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { verifyRowManifest } from '@/src/services/sync/manifestVerify';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
afterEach(closeNativeHost);

it('round-trips a signed gzip backup through the archive and native engine', async () => {
  const ctx = await enrolledKeyHierarchy('public-synthetic-workplace');
  const content = {
    name: 'PUBLIC SYNTHETIC TEST ONLY',
    icon: 'wallet',
    defaultCurrencyCode: 'USD',
    safeToSpendDays: 60,
    currencyPrecisions: { USD: 2 },
  };
  const envelopes = await ctx.hierarchy.encryptRows(ctx.identity, ctx.workplaceId, [
    {
      table: 'workplace',
      rowId: ctx.workplaceId,
      updatedAt: 1797000000000,
      deleted: false,
      schemaVersion: 35,
      compression: 'gzip',
      plaintext: decodeUtf8(canonicalRowBytes('workplace', content)),
    },
  ]);
  expect(envelopes[0]).toMatchObject({ formatVersion: 1, enc: 'shortkey1', compression: 'gzip' });
  const workplaceKeys = await ctx.hierarchy.exportWorkplaceKeys(ctx.identity, ctx.workplaceId);
  const userRecoveryPackage = await ctx.hierarchy.exportUserRecoveryPackage(
    ctx.identity.userId,
    ctx.identity.registeredDeviceId,
  );
  const fields = {
    formatVersion: 1 as const,
    workplaceId: ctx.workplaceId,
    keyId: workplaceKeys.keyId,
    id: 'public-synthetic-manifest',
    seq: 0,
    prevHash: new Uint8Array(32),
    authorUserId: ctx.identity.userId,
    authorDeviceId: ctx.identity.registeredDeviceId,
    rowCount: envelopes.length,
    root: await computeMerkleRoot(envelopes.map(parseRowEnvelope), envelopes.length),
    createdAt: 1797000000000,
  };
  const manifest = {
    ...fields,
    prevHash: keyHex(fields.prevHash),
    root: keyHex(fields.root),
    signature: await ctx.hierarchy.signRowManifest(ctx.identity, fields),
  };
  const backup = parseBackupZip(
    createBackupZip({ envelopes, manifest }, workplaceKeys, userRecoveryPackage),
  );
  await expect(
    verifyRowManifest(
      backup.manifest,
      {
        workplaceId: ctx.workplaceId,
        keyId: workplaceKeys.keyId,
        authorUserId: ctx.identity.userId,
      },
      userRecoveryPackage.publicIdentity,
      ctx.identity.userKeyFingerprint,
    ),
  ).resolves.toMatchObject({
    signature: manifest.signature,
  });
  const [row] = await ctx.hierarchy.decryptRows(ctx.identity, ctx.workplaceId, backup.envelopes);
  if (!row.ok) throw new Error(row.error);
  expect(row.compression).toBe('gzip');
  expect(
    decodeCanonicalRow('workplace', row.schemaVersion, new TextEncoder().encode(row.plaintext)),
  ).toEqual(content);
});
