import { unzipSync, zipSync } from 'fflate';
import {
  parseExportedUserRecoveryPackage,
  parseWorkplaceKeys,
  type UserRecoveryPackage,
  type WorkplaceKeys,
} from '@/src/services/backup/keyHierarchyRecords';
import type { BuiltBackupCommit } from '@/src/services/sync/buildCommit';
import { parseRowManifest } from '@/src/services/crypto/protocol/rowEnvelope';
import { validateCompleteEnvelopeState } from '@/src/services/sync/rowEnvelope';
import type { RowEnvelopeJson, RowManifestJson } from '@/src/services/crypto/protocol/rowEnvelope';

export const BACKUP_ENTRIES = [
  'manifest.json',
  'envelopes.ndjson',
  'workplace-keys.json',
  'user-recovery.json',
] as const;

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ENVELOPES_BYTES = 48 * 1024 * 1024;
const MAX_KEY_FILE_BYTES = 256 * 1024;
const MAX_ENTRY_COUNT = BACKUP_ENTRIES.length;
const MAX_ROW_COUNT = 100_000;
const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export type ParsedBackupFile = Readonly<{
  manifest: RowManifestJson;
  envelopes: readonly RowEnvelopeJson[];
  workplaceKeys: WorkplaceKeys;
  userRecoveryPackage: UserRecoveryPackage;
}>;

type ZipEntry = Readonly<{
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}>;

export function assertUniqueBackupEntryNames(names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) fail('duplicate ZIP entry');
    seen.add(name);
  }
}

function fail(message: string): never {
  throw new Error(`Invalid encrypted backup: ${message}`);
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) fail('truncated ZIP');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) fail('truncated ZIP');
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function safeName(name: string): void {
  if (
    !name ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').some(part => part === '.' || part === '..') ||
    name.includes('\0')
  )
    fail('unsafe ZIP path');
}

/**
 * Reads ZIP metadata without inflating data. All declared output sizes and local
 * record boundaries are checked before fflate is allowed to allocate entries.
 */
function preflightZip(bytes: Uint8Array): readonly ZipEntry[] {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES)
    fail('archive size limit');

  const min = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let at = bytes.length - 22; at >= min; at -= 1) {
    if (readU32(bytes, at) === END_OF_CENTRAL_DIRECTORY) {
      const commentLength = readU16(bytes, at + 20);
      if (at + 22 + commentLength === bytes.length) {
        eocd = at;
        break;
      }
    }
  }
  if (eocd < 0) fail('missing or trailing ZIP directory');
  if (readU16(bytes, eocd + 20) !== 0) fail('ZIP comments are unsupported');

  const disk = readU16(bytes, eocd + 4);
  const directoryDisk = readU16(bytes, eocd + 6);
  const entriesOnDisk = readU16(bytes, eocd + 8);
  const entryCount = readU16(bytes, eocd + 10);
  const directorySize = readU32(bytes, eocd + 12);
  const directoryOffset = readU32(bytes, eocd + 16);
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount)
    fail('multi-disk ZIP is unsupported');
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff)
    fail('ZIP64 is unsupported');
  if (entryCount !== MAX_ENTRY_COUNT) fail('unexpected ZIP entry count');
  if (directoryOffset + directorySize !== eocd) fail('invalid central-directory bounds');

  const entries: ZipEntry[] = [];
  const names: string[] = [];
  const localOffsets = new Set<number>();
  let cursor = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(bytes, cursor) !== CENTRAL_FILE) fail('invalid central-directory record');
    const flags = readU16(bytes, cursor + 8);
    const method = readU16(bytes, cursor + 10);
    const compressedSize = readU32(bytes, cursor + 20);
    const uncompressedSize = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const startDisk = readU16(bytes, cursor + 34);
    const localOffset = readU32(bytes, cursor + 42);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      startDisk === 0xffff
    )
      fail('ZIP64 is unsupported');
    if (startDisk !== 0) fail('multi-disk ZIP is unsupported');
    if ((flags & 1) !== 0) fail('encrypted ZIP entries are unsupported');
    if ((flags & ~(0x0008 | 0x0800 | (method === 8 ? 0x0006 : 0))) !== 0)
      fail('unsupported ZIP flags');
    if (method !== 0 && method !== 8) fail('unsupported ZIP compression method');

    const nameStart = cursor + 46;
    const recordEnd = nameStart + nameLength + extraLength + commentLength;
    if (!nameLength || recordEnd > eocd) fail('truncated central-directory record');
    const name = UTF8.decode(bytes.subarray(nameStart, nameStart + nameLength));
    safeName(name);
    names.push(name);
    if (name.endsWith('/')) fail('directory entries are unsupported');

    const entryLimit =
      name === 'manifest.json'
        ? MAX_MANIFEST_BYTES
        : name === 'envelopes.ndjson'
          ? MAX_ENVELOPES_BYTES
          : name === 'workplace-keys.json' || name === 'user-recovery.json'
            ? MAX_KEY_FILE_BYTES
            : 0;
    if (!entryLimit || uncompressedSize > entryLimit) fail('entry size limit or unknown entry');
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ARCHIVE_BYTES) fail('total uncompressed size limit');
    if (localOffsets.has(localOffset)) fail('overlapping ZIP local records');
    localOffsets.add(localOffset);

    if (readU32(bytes, localOffset) !== LOCAL_FILE) fail('invalid local ZIP record');
    const localFlags = readU16(bytes, localOffset + 6);
    const localMethod = readU16(bytes, localOffset + 8);
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const localExtraEnd = localExtraStart + localExtraLength;
    if (localExtraEnd > bytes.length) fail('truncated local ZIP extra field');
    for (let extraAt = localExtraStart; extraAt < localExtraEnd;) {
      if (extraAt + 4 > localExtraEnd) fail('malformed local ZIP extra field');
      const tag = readU16(bytes, extraAt);
      const length = readU16(bytes, extraAt + 2);
      if (extraAt + 4 + length > localExtraEnd) fail('malformed local ZIP extra field');
      if (tag === 0x0001) fail('ZIP64 is unsupported');
      extraAt += 4 + length;
    }
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method) fail('local/central ZIP metadata mismatch');
    if (dataStart > directoryOffset || dataEnd > directoryOffset) fail('invalid ZIP data bounds');
    if (localNameLength !== nameLength) fail('local ZIP name mismatch');
    const localName = UTF8.decode(bytes.subarray(localNameStart, localNameStart + localNameLength));
    if (localName !== name) fail('local ZIP name mismatch');

    // ZIP64 extra records are rejected even when the 32-bit sizes happen to fit.
    let extraAt = nameStart + nameLength;
    const extraEnd = extraAt + extraLength;
    while (extraAt < extraEnd) {
      if (extraAt + 4 > extraEnd) fail('malformed ZIP extra field');
      const tag = readU16(bytes, extraAt);
      const length = readU16(bytes, extraAt + 2);
      if (extraAt + 4 + length > extraEnd) fail('malformed ZIP extra field');
      if (tag === 0x0001) fail('ZIP64 is unsupported');
      extraAt += 4 + length;
    }

    entries.push({ name, method, flags, compressedSize, uncompressedSize, localOffset });
    cursor = recordEnd;
  }
  if (cursor !== eocd) fail('central-directory length mismatch');
  assertUniqueBackupEntryNames(names);
  const expected = new Set<string>(BACKUP_ENTRIES);
  if (names.length !== expected.size || names.some(name => !expected.has(name)))
    fail('unexpected ZIP entries');

  // Local records may not overlap each other or the central directory.
  const ordered = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const localNameLength = readU16(bytes, current.localOffset + 26);
    const localExtraLength = readU16(bytes, current.localOffset + 28);
    const end =
      current.localOffset + 30 + localNameLength + localExtraLength + current.compressedSize;
    const nextStart = ordered[index + 1]?.localOffset ?? directoryOffset;
    if (end > nextStart) fail('overlapping ZIP local records');
  }
  return entries;
}

function jsonBytes(value: unknown, limit: number, label: string): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.length > limit) fail(`${label} size limit`);
  return encoded;
}

function parseJson(bytes: Uint8Array, limit: number, label: string): unknown {
  if (bytes.length > limit) fail(`${label} size limit`);
  try {
    return JSON.parse(UTF8.decode(bytes));
  } catch {
    return fail(`invalid ${label} JSON/UTF-8`);
  }
}

function parseNdjson(bytes: Uint8Array, expectedCount: number): RowEnvelopeJson[] {
  if (bytes.length > MAX_ENVELOPES_BYTES) fail('envelopes size limit');
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return fail('invalid envelopes UTF-8');
  }
  if (!text.endsWith('\n')) fail('NDJSON must end with a newline');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== expectedCount || lines.some(line => !line || line.includes('\r')))
    fail('NDJSON line count or shape mismatch');
  return lines.map(line => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return fail('invalid NDJSON line JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      fail('invalid NDJSON line shape');
    return parsed as RowEnvelopeJson;
  });
}

function validateBackupParts(
  manifestValue: unknown,
  envelopeValues: readonly unknown[],
  workplaceValue: unknown,
  userValue: unknown,
): ParsedBackupFile {
  const workplaceKeys = parseWorkplaceKeys(workplaceValue);
  const userRecoveryPackage = parseExportedUserRecoveryPackage(userValue);
  if (!workplaceKeys.recoveryConfirmed) fail('Workplace recovery has not been confirmed');
  if (
    workplaceKeys.userId !== userRecoveryPackage.userId ||
    workplaceKeys.userKeyFingerprint !== userRecoveryPackage.userKeyFingerprint
  )
    fail('recovery material User scope mismatch');
  const parsedManifest = parseRowManifest(manifestValue, {
    workplaceId: workplaceKeys.workplaceId,
    keyId: workplaceKeys.keyId,
    authorUserId: userRecoveryPackage.userId,
  });
  const manifest = manifestValue as RowManifestJson;
  if (parsedManifest.fields.seq !== 0 || manifest.prevHash !== '0'.repeat(64))
    fail('offline backup must be a genesis manifest');
  if (
    parsedManifest.fields.rowCount > MAX_ROW_COUNT ||
    envelopeValues.length !== parsedManifest.fields.rowCount
  )
    fail('manifest row count mismatch or limit');
  validateCompleteEnvelopeState(
    envelopeValues,
    { workplaceId: manifest.workplaceId, keyId: manifest.keyId },
    manifest.rowCount,
  );
  if (envelopeValues.length > MAX_ROW_COUNT) fail('row count limit');
  return {
    manifest,
    envelopes: envelopeValues as readonly RowEnvelopeJson[],
    workplaceKeys,
    userRecoveryPackage,
  };
}

/** Produces a complete offline genesis backup. The recovery credential is never accepted or archived. */
export function createBackupZip(
  commit: BuiltBackupCommit,
  workplaceKeysValue: WorkplaceKeys,
  userRecoveryPackageValue: UserRecoveryPackage,
): Uint8Array {
  const validated = validateBackupParts(
    commit.manifest,
    commit.envelopes,
    workplaceKeysValue,
    userRecoveryPackageValue,
  );
  const ndjson = new TextEncoder().encode(
    `${validated.envelopes.map(envelope => JSON.stringify(envelope)).join('\n')}\n`,
  );
  if (ndjson.length > MAX_ENVELOPES_BYTES) fail('envelopes size limit');
  const archive = zipSync({
    'manifest.json': jsonBytes(validated.manifest, MAX_MANIFEST_BYTES, 'manifest'),
    'envelopes.ndjson': ndjson,
    'workplace-keys.json': jsonBytes(validated.workplaceKeys, MAX_KEY_FILE_BYTES, 'Workplace keys'),
    'user-recovery.json': jsonBytes(
      validated.userRecoveryPackage,
      MAX_KEY_FILE_BYTES,
      'User recovery',
    ),
  });
  if (archive.length > MAX_ARCHIVE_BYTES) fail('archive size limit');
  return archive;
}

/** Validates ZIP metadata before fflate inflates any entry. Signature verification is intentionally separate. */
export function parseBackupZip(zipBytes: Uint8Array): ParsedBackupFile {
  const metadata = preflightZip(zipBytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    return fail('ZIP decompression failed');
  }
  if (Object.keys(files).length !== metadata.length || metadata.some(entry => !files[entry.name]))
    fail('decompressed entry set mismatch');
  for (const entry of metadata) {
    if (files[entry.name].length !== entry.uncompressedSize) fail('decompressed size mismatch');
  }
  const manifest = parseJson(files['manifest.json'], MAX_MANIFEST_BYTES, 'manifest');
  const workplaceKeys = parseJson(
    files['workplace-keys.json'],
    MAX_KEY_FILE_BYTES,
    'Workplace keys',
  );
  const userRecovery = parseJson(files['user-recovery.json'], MAX_KEY_FILE_BYTES, 'User recovery');
  const manifestRecord = manifest as Partial<RowManifestJson>;
  if (
    !Number.isSafeInteger(manifestRecord.rowCount) ||
    (manifestRecord.rowCount ?? -1) < 0 ||
    manifestRecord.rowCount! > MAX_ROW_COUNT
  )
    fail('invalid manifest row count');
  const envelopes = parseNdjson(files['envelopes.ndjson'], manifestRecord.rowCount!);
  return validateBackupParts(manifest, envelopes, workplaceKeys, userRecovery);
}
