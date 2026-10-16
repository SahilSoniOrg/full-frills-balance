import { unzipSync, zipSync } from 'fflate';
import { assertUniqueBackupEntryNames, createBackupZip, parseBackupZip } from '../backupFile';
import type { UserRecoveryPackage, WorkplaceKeys } from '@/src/services/backup/keyHierarchyRecords';
import type { BuiltBackupCommit } from '@/src/services/sync/buildCommit';
import type { RowEnvelopeJson, RowManifestJson } from '@/src/services/sync/rowEnvelope';

const ZERO_KEY = '0'.repeat(64);
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const WORKPLACE_ID = 'workplace-1';
const USER_ID = 'user-1';
const RECIPIENT_KEY_ID = `sha256:${'b'.repeat(64)}`;

function keyEnvelope(purpose: 'user-recovery' | 'user-workplace-dek') {
  return {
    format: 'full-frills-key-envelope' as const,
    formatVersion: 1 as const,
    suite: 'HPKE-X25519-HKDF-SHA256-AES256GCM' as const,
    context: {
      purpose,
      userId: USER_ID,
      recipientKeyId: RECIPIENT_KEY_ID,
      workplaceId: WORKPLACE_ID,
      keyId: FINGERPRINT,
    },
    encapsulatedKey: ZERO_KEY,
    ciphertext: '00',
  };
}

const userRecovery: UserRecoveryPackage = {
  format: 'full-frills-user-recovery',
  formatVersion: 1,
  userId: USER_ID,
  publicIdentity: {
    format: 'full-frills-user-identity',
    formatVersion: 1,
    userId: USER_ID,
    encryptionAlgorithm: 'X25519',
    encryptionPublicKey: ZERO_KEY,
    signingAlgorithm: 'Ed25519',
    signingPublicKey: ZERO_KEY,
  },
  userKeyFingerprint: FINGERPRINT,
  recoveryPublicKey: ZERO_KEY,
  recoveryEnvelope: keyEnvelope('user-recovery'),
};

const workplaceKeys: WorkplaceKeys = {
  format: 'full-frills-workplace-keys',
  formatVersion: 1,
  userId: USER_ID,
  workplaceId: WORKPLACE_ID,
  userKeyFingerprint: FINGERPRINT,
  keyId: FINGERPRINT,
  memberEnvelope: keyEnvelope('user-workplace-dek'),
  recoveryPublicKey: ZERO_KEY,
  recoveryEnvelope: keyEnvelope('user-recovery'),
  recoveryConfirmed: true,
};

const manifest: RowManifestJson = {
  formatVersion: 1,
  workplaceId: WORKPLACE_ID,
  keyId: FINGERPRINT,
  id: 'manifest-1',
  seq: 0,
  prevHash: '0'.repeat(64),
  authorUserId: USER_ID,
  authorDeviceId: 'device-1',
  rowCount: 1,
  root: '1'.repeat(64),
  createdAt: 1_800_000_000_000,
  signature: '2'.repeat(128),
};

const envelope: RowEnvelopeJson = {
  format: 'full-frills-encrypted-row',
  formatVersion: 1,
  enc: 'shortkey1+zstd',
  workplaceId: WORKPLACE_ID,
  table: 'workplace',
  rowId: WORKPLACE_ID,
  updatedAt: 1_800_000_000_000,
  deleted: false,
  keyId: FINGERPRINT,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

const commit: BuiltBackupCommit = { manifest, envelopes: [envelope] };

function centralRecords(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const records: { name: string; central: number; local: number; nameLength: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const local = view.getUint32(cursor + 42, true);
    records.push({ name, central: cursor, local, nameLength });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { view, records };
}

function renameEntry(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const result = bytes.slice();
  const { records } = centralRecords(result);
  const record = records.find(item => item.name === from);
  if (!record || from.length !== to.length) throw new Error('test rename precondition failed');
  const encoded = new TextEncoder().encode(to);
  result.set(encoded, record.central + 46);
  result.set(encoded, record.local + 30);
  return result;
}

describe('encrypted backup ZIP', () => {
  test('round trips exactly four ciphertext/public-material entries and excludes credentials', () => {
    const archive = createBackupZip(commit, workplaceKeys, userRecovery);
    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual([
      'envelopes.ndjson',
      'manifest.json',
      'user-recovery.json',
      'workplace-keys.json',
    ]);
    expect(new TextDecoder().decode(files['envelopes.ndjson'])).toBe(
      `${JSON.stringify(envelope)}\n`,
    );
    const archiveText = Object.values(files)
      .map(bytes => new TextDecoder().decode(bytes))
      .join('\n');
    expect(archiveText).not.toContain('full-frills-recovery-handle');
    expect(Object.keys(files).some(name => /credential/i.test(name))).toBe(false);

    const parsed = parseBackupZip(archive);
    expect(parsed.manifest).toEqual(manifest);
    expect(parsed.envelopes).toEqual([envelope]);
    expect(parsed.workplaceKeys).toEqual(workplaceKeys);
    expect(parsed.userRecoveryPackage).toEqual(userRecovery);
    // A shape-valid signature is preserved; this helper does not assert cryptographic validity.
    expect(parsed.manifest.signature).toBe('2'.repeat(128));
  });

  test('rejects duplicate paths, traversal names, encrypted entries, and unexpected entries', () => {
    const archive = createBackupZip(commit, workplaceKeys, userRecovery);
    expect(() => assertUniqueBackupEntryNames(['manifest.json', 'manifest.json'])).toThrow(
      /duplicate ZIP entry/i,
    );
    expect(() => parseBackupZip(renameEntry(archive, 'manifest.json', '../evilxxxxxx'))).toThrow(
      /unsafe ZIP path/i,
    );
    const encrypted = archive.slice();
    const { view, records } = centralRecords(encrypted);
    const entry = records[0];
    view.setUint16(entry.central + 8, view.getUint16(entry.central + 8, true) | 1, true);
    view.setUint16(entry.local + 6, view.getUint16(entry.local + 6, true) | 1, true);
    expect(() => parseBackupZip(encrypted)).toThrow(/encrypted ZIP/i);
    const extra = zipSync({
      ...unzipSync(archive),
      'extra.json': new TextEncoder().encode('{}'),
    });
    expect(() => parseBackupZip(extra)).toThrow(/entry count/i);
  });

  test('rejects central-directory size bombs before decompression', () => {
    const archive = createBackupZip(commit, workplaceKeys, userRecovery);
    const bomb = archive.slice();
    const { view, records } = centralRecords(bomb);
    const entry = records.find(item => item.name === 'envelopes.ndjson')!;
    view.setUint32(entry.central + 24, 48 * 1024 * 1024 + 1, true);
    expect(() => parseBackupZip(bomb)).toThrow(/entry size limit/i);
  });

  test('rejects malformed NDJSON and row/manifest scope mismatches', () => {
    const archive = createBackupZip(commit, workplaceKeys, userRecovery);
    const badLines = zipSync({
      ...unzipSync(archive),
      'envelopes.ndjson': new TextEncoder().encode('{"unexpected":true}\n'),
    });
    expect(() => parseBackupZip(badLines)).toThrow();

    const mismatched = { ...envelope, workplaceId: 'other-workplace', rowId: 'other-workplace' };
    const wrongScope = zipSync({
      ...unzipSync(archive),
      'envelopes.ndjson': new TextEncoder().encode(`${JSON.stringify(mismatched)}\n`),
    });
    expect(() => parseBackupZip(wrongScope)).toThrow(/scope mismatch/i);
  });

  test('rejects non-genesis manifests, invalid signature shape, and missing terminal NDJSON newline', () => {
    const badManifest = { ...manifest, seq: 1 };
    const badChain = zipSync({
      ...unzipSync(createBackupZip(commit, workplaceKeys, userRecovery)),
      'manifest.json': new TextEncoder().encode(JSON.stringify(badManifest)),
    });
    expect(() => parseBackupZip(badChain)).toThrow(/genesis/i);

    const badSignature = zipSync({
      ...unzipSync(createBackupZip(commit, workplaceKeys, userRecovery)),
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({ ...manifest, signature: 'not-a-signature' }),
      ),
    });
    expect(() => parseBackupZip(badSignature)).toThrow(/signature/i);

    const noNewline = zipSync({
      ...unzipSync(createBackupZip(commit, workplaceKeys, userRecovery)),
      'envelopes.ndjson': new TextEncoder().encode(JSON.stringify(envelope)),
    });
    expect(() => parseBackupZip(noNewline)).toThrow(/newline/i);
  });
});
