// Independent Node-stdlib oracle. Deliberately does not import production codec code.
import {
  createHash,
  createHmac,
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../modules/expo-key-crypto/tests/fixtures/row-vectors.json',
);
const tables = [
  'accounts',
  'journals',
  'transactions',
  'audit_logs',
  'budgets',
  'budget_scopes',
  'account_metadata',
  'planned_payments',
  'journal_metadata',
  'transaction_auto_post_rules',
  'transaction_inbox_records',
  'workplace',
];
const hash = b => createHash('sha256').update(b).digest();
const concat = (...xs) => Buffer.concat(xs.map(x => Buffer.from(x)));
function uv(n) {
  let x = BigInt(n),
    a = [];
  do {
    let b = Number(x & 127n);
    x >>= 7n;
    if (x) b |= 128;
    a.push(b);
  } while (x);
  return Buffer.from(a);
}
function tlv(version, fields) {
  return concat(
    Buffer.from([version]),
    ...fields.flatMap(([t, v]) => [Buffer.from([t]), uv(v.length), v]),
  );
}
function utf(s) {
  return Buffer.from(s, 'utf8');
}
function int64(n) {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(BigInt(n));
  return b;
}
function header(table, rowId, salt, updatedAt = 1700000000123, deleted = false) {
  return tlv(1, [
    [1, utf('full-frills-encrypted-row')],
    [2, uv(1)],
    [3, utf('shortkey1')],
    [4, utf('fixture-workplace')],
    [5, utf(table)],
    [6, utf(rowId)],
    [7, int64(updatedAt)],
    [8, Buffer.from([deleted ? 1 : 0])],
    [9, utf(keyId)],
    [10, salt],
    [11, utf('gzip')],
  ]);
}
function info(table) {
  return tlv(2, [
    [1, utf('FFB-ROW/1')],
    [2, utf(table)],
  ]);
}
function inner(body) {
  return tlv(4, [
    [1, uv(1)],
    [2, body],
  ]);
}
function merkle(leaves) {
  if (!leaves.length) return hash(Buffer.alloc(0));
  const hs = leaves.map(x => hash(concat(Buffer.from([0]), x)));
  const tree = a => {
    if (a.length === 1) return a[0];
    let k = 1;
    while (k * 2 < a.length) k *= 2;
    return hash(concat(Buffer.from([1]), tree(a.slice(0, k)), tree(a.slice(k))));
  };
  return tree(hs);
}
function hex(b) {
  return Buffer.from(b).toString('hex');
}
function b64(b) {
  return Buffer.from(b).toString('base64');
}
const dek = Buffer.from([...Array(32)].map((_, i) => i));
const keyId = `sha256:${hex(hash(dek))}`;
const vectors = [];
for (let i = 0; i < tables.length; i++) {
  const table = tables[i];
  let rowId = i === 0 ? 'row-empty-body' : 'row-α-' + String(i).padStart(3, '0');
  if (table === 'workplace') rowId = 'fixture-workplace';
  const salt = Buffer.from([...Array(16)].map((_, j) => (i * 17 + j * 13) & 255));
  const aad = header(table, rowId, salt, 1700000000123 + i, i === 11 ? false : i === 3);
  const inf = info(table);
  const plaintext = i === 0 ? '' : JSON.stringify({ text: `fixture:${table}:हिन्दी:${i}` });
  const body = i === 3 ? Buffer.alloc(0) : gzipSync(Buffer.from(plaintext));
  const plain = inner(body);
  const key = Buffer.from(
    createHmac('sha256', createHmac('sha256', salt).update(dek).digest())
      .update(concat(inf, Buffer.from([1])))
      .digest(),
  );
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.alloc(12));
  cipher.setAAD(aad);
  const ciphertext = concat(cipher.update(plain), cipher.final(), cipher.getAuthTag());
  vectors.push({
    table,
    compression: 'gzip',
    plaintext: i === 3 ? '' : plaintext,
    rowId,
    updatedAt: 1700000000123 + i,
    deleted: i === 3,
    workplaceId: 'fixture-workplace',
    keyId,
    salt: b64(salt),
    aadHex: hex(aad),
    infoHex: hex(inf),
    innerTlvHex: hex(plain),
    codecBody: { kind: 'gzip', hex: hex(body) },
    derivedKeyHex: hex(key),
    ciphertextBase64: b64(ciphertext),
  });
}
const manifestFields = {
  domain: 'FFB-MANIFEST/1',
  formatVersion: 1,
  workplaceId: 'fixture-workplace',
  keyId,
  id: 'fixture-manifest-0001',
  seq: 0,
  prevHash: Buffer.alloc(32),
  authorUserId: 'fixture-user',
  authorDeviceId: 'fixture-device',
  rowCount: 12,
  root: merkle(
    [...vectors]
      .sort(
        (a, b) =>
          Buffer.compare(utf(a.table), utf(b.table)) || Buffer.compare(utf(a.rowId), utf(b.rowId)),
      )
      .map(v => concat(Buffer.from(v.aadHex, 'hex'), Buffer.from(v.ciphertextBase64, 'base64'))),
  ),
  createdAt: 1700000000999,
};
const manifest = tlv(3, [
  [1, utf(manifestFields.domain)],
  [2, uv(manifestFields.formatVersion)],
  [3, utf(manifestFields.workplaceId)],
  [4, utf(manifestFields.keyId)],
  [5, utf(manifestFields.id)],
  [6, uv(manifestFields.seq)],
  [7, manifestFields.prevHash],
  [8, utf(manifestFields.authorUserId)],
  [9, utf(manifestFields.authorDeviceId)],
  [10, uv(manifestFields.rowCount)],
  [11, manifestFields.root],
  [12, int64(manifestFields.createdAt)],
]);
const seed = Buffer.from([...Array(32)].map((_, i) => (0xa5 + i * 7) & 255));
const privateKey = createPrivateKey({
  key: concat(Buffer.from('302e020100300506032b657004220420', 'hex'), seed),
  format: 'der',
  type: 'pkcs8',
});
const signature = sign(null, manifest, privateKey);
const treeCases = {};
for (const n of [0, 1, 2, 3, 5, 8]) {
  const leaves = Array.from({ length: n }, (_, i) => Buffer.from(`RFC6962 fixture leaf ${i}`));
  treeCases[n] = { leavesHex: leaves.map(hex), rootHex: hex(merkle(leaves)) };
}
const edgeSalt = Buffer.from([...Array(16)].map((_, i) => i));
const maxId = 'x'.repeat(128);
const edgeCases = {
  emptyStringBodyHex: hex(inner(gzipSync(Buffer.alloc(0)))),
  maxIdentifierUtf8Bytes: Buffer.byteLength(maxId),
  maxIdentifierHeaderHex: hex(header('accounts', maxId, edgeSalt)),
  unicodeIdentifier: 'लेखा-α',
  unicodeIdentifierUtf8Bytes: Buffer.byteLength('लेखा-α'),
};
const result = {
  format: 'ffb-row-vectors-v1',
  generator: 'scripts/sync/generate-row-vectors.mjs (independent Node stdlib oracle)',
  notes:
    'Synthetic fixtures only. Row headers authenticate the explicit gzip selector; codecBody contains standard gzip members.',
  fixedInputs: {
    dekHex: hex(dek),
    ed25519SeedHex: hex(seed),
    saltRule: 'salt[i] = (rowIndex*17 + i*13) mod 256',
  },
  edgeCases,
  compressionCases: {
    exactLimitGzipHex: hex(gzipSync(Buffer.alloc(64 * 1024, 120))),
    oversizedGzipHex: hex(gzipSync(Buffer.alloc(64 * 1024 + 1, 120))),
  },
  uvarintBoundaries: [127, 128, 16383, 16384].map(value => ({
    value,
    hex: hex(uv(value)),
  })),
  tables: vectors,
  merkleCases: treeCases,
  manifest: {
    ...Object.fromEntries(
      Object.entries(manifestFields).map(([k, v]) => [k, Buffer.isBuffer(v) ? hex(v) : v]),
    ),
    signedBytesHex: hex(manifest),
    hashHex: hex(hash(manifest)),
    signatureHex: hex(signature),
    publicKeyHex: createPublicKey(privateKey)
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('hex'),
  },
};
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
