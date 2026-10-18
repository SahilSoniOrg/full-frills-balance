import { webcrypto } from 'node:crypto';
import { enrolledKeyHierarchy, closeNativeHost } from './nativeTestContext';
import { parseLocalUser, userScope } from '@/src/services/backup/keyHierarchyRecords';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});
afterEach(closeNativeHost);

async function setup() {
  const context = await enrolledKeyHierarchy('row-crypto-workplace');
  const userRecord = parseLocalUser(
    await context.state.read(
      userScope(context.identity.userId, context.identity.registeredDeviceId),
    ),
  );
  const user = await context.crypto.openKey({ kind: 'user', user: userRecord });
  const keys = await context.hierarchy.exportWorkplaceKeys(context.identity, context.workplaceId);
  const key = await context.crypto.openKey({ kind: 'workplace', user, keys });
  return { context, key, user, keys, workplaceId: context.workplaceId };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  table: 'transactions',
  rowId: 'row-1',
  updatedAt: 1_797_000_000_000,
  deleted: false,
  schemaVersion: 35,
  compression: 'gzip' as const,
  plaintext: '{"a":1,"note":"नमस्ते"}',
  ...overrides,
});

it('round-trips UTF-8 rows through native compression, HKDF, and AES-GCM', async () => {
  const { context, key, workplaceId } = await setup();
  const encrypted = (await context.host.execute('encryptRows', {
    key,
    workplaceId,
    keyId: key.keyId,
    rows: [row()],
  })) as { envelopes: Record<string, unknown>[] };
  expect(encrypted.envelopes).toHaveLength(1);
  expect(encrypted.envelopes[0].salt).toEqual(expect.any(String));
  expect(encrypted.envelopes[0]).toMatchObject({
    formatVersion: 1,
    enc: 'shortkey1',
    compression: 'gzip',
  });
  const decrypted = (await context.host.execute('decryptRows', {
    key,
    workplaceId,
    envelopes: encrypted.envelopes,
  })) as { rows: Record<string, unknown>[] };
  expect(decrypted.rows).toEqual([
    {
      ok: true,
      rowId: 'row-1',
      table: 'transactions',
      schemaVersion: 35,
      compression: 'gzip' as const,
      plaintext: '{"a":1,"note":"नमस्ते"}',
    },
  ]);
});

it('authenticates header, salt, ciphertext, and Workplace scope per row', async () => {
  const { context, key, workplaceId } = await setup();
  const { envelopes } = (await context.host.execute('encryptRows', {
    key,
    workplaceId,
    keyId: key.keyId,
    rows: [row()],
  })) as { envelopes: Record<string, any>[] };
  const source = envelopes[0];
  const variants = [
    { ...source, rowId: 'changed-row' },
    { ...source, salt: `${source.salt.slice(0, -4)}AAAA` },
    { ...source, ciphertext: `${source.ciphertext.slice(0, -4)}AAAA` },
    { ...source, workplaceId: 'other-workplace' },
    { ...source, table: 'journals' },
  ];
  for (const envelope of variants) {
    const result = (await context.host.execute('decryptRows', {
      key,
      workplaceId,
      envelopes: [envelope],
    })) as { rows: { ok: boolean; error?: string }[] };
    expect(result.rows[0]).toMatchObject({ ok: false, error: 'FFB_ROW_INTEGRITY' });
  }
});

it('rejects unsupported compression before interpreting an encrypted body', async () => {
  const { context, key, workplaceId } = await setup();
  const { envelopes } = (await context.host.execute('encryptRows', {
    key,
    workplaceId,
    keyId: key.keyId,
    rows: [row()],
  })) as { envelopes: Record<string, unknown>[] };
  expect(
    await context.host.execute('decryptRows', {
      key,
      workplaceId,
      envelopes: [{ ...envelopes[0], compression: 'unsupported-codec' }],
    }),
  ).toMatchObject({ rows: [{ ok: false, error: 'FFB_ROW_UNSUPPORTED_COMPRESSION' }] });
});

it('rejects duplicate rows, unsupported compression, and row or batch caps', async () => {
  const { context, key, workplaceId } = await setup();
  const encrypt = (rows: unknown[]) =>
    context.host.execute('encryptRows', {
      key,
      workplaceId,
      keyId: key.keyId,
      rows,
    });
  await expect(encrypt([row({ compression: 'unsupported-codec' })])).rejects.toMatchObject({
    code: 'FFB_ROW_UNSUPPORTED_COMPRESSION',
  });
  await expect(encrypt([row({ compression: 'unknown' })])).rejects.toMatchObject({
    code: 'FFB_ROW_UNSUPPORTED_COMPRESSION',
  });
  await expect(encrypt([row({ plaintext: 'x'.repeat(64 * 1024 + 1) })])).rejects.toMatchObject({
    code: 'FFB_ROW_TOO_LARGE',
  });
  await expect(
    encrypt(
      Array.from({ length: 65 }, (_, i) =>
        row({
          rowId: `aggregate-${i}`,
          plaintext: 'x'.repeat(64 * 1024),
        }),
      ),
    ),
  ).rejects.toMatchObject({ code: 'FFB_ROW_TOO_LARGE' });
  await expect(
    encrypt(Array.from({ length: 501 }, (_, i) => row({ rowId: `row-${i}` }))),
  ).rejects.toThrow();
  await expect(encrypt([row(), row()])).rejects.toThrow();
  await expect(
    context.host.execute('decryptRows', {
      key,
      workplaceId,
      envelopes: [{ ciphertext: 'A'.repeat(4 * Math.ceil((68 * 1024) / 3) + 4) }],
    }),
  ).rejects.toMatchObject({ code: 'FFB_ROW_TOO_LARGE' });
});

it('returns the decrypted prefix when expanded plaintext fills the batch', async () => {
  const { context, key, workplaceId } = await setup();
  const encrypt = async (from: number, count: number) =>
    (
      (await context.host.execute('encryptRows', {
        key,
        workplaceId,
        keyId: key.keyId,
        rows: Array.from({ length: count }, (_, i) =>
          row({ rowId: `full-${from + i}`, plaintext: 'x'.repeat(64 * 1024) }),
        ),
      })) as { envelopes: Record<string, unknown>[] }
    ).envelopes;
  const envelopes = [...(await encrypt(0, 64)), ...(await encrypt(64, 1))];
  const result = (await context.host.execute('decryptRows', {
    key,
    workplaceId,
    envelopes,
  })) as { rows: { ok: boolean; rowId: string }[] };
  expect(result.rows).toHaveLength(64);
  expect(result.rows.every(value => value.ok)).toBe(true);
  expect(result.rows.at(-1)?.rowId).toBe('full-63');
});

it('signs only canonically re-encoded manifests bound to the confirmed User and Device', async () => {
  const { context, user, workplaceId, keys } = await setup();
  const fields = {
    formatVersion: 1,
    workplaceId,
    keyId: keys.keyId,
    id: 'manifest-1',
    seq: 0,
    prevHash: '00'.repeat(32),
    authorUserId: context.identity.userId,
    authorDeviceId: context.identity.registeredDeviceId,
    rowCount: 0,
    root: '11'.repeat(32),
    createdAt: 1_797_000_000_000,
  };
  const signed = (await context.host.execute('signRowManifest', {
    key: user,
    fields,
  })) as { signature: string };
  expect(signed.signature).toMatch(/^[0-9a-f]{128}$/);
  await expect(
    context.host.execute('signRowManifest', {
      key: user,
      fields: { ...fields, authorUserId: 'another-user' },
    }),
  ).rejects.toMatchObject({ code: 'FFB_KEY_INVALID_FILE' });
});

it('encrypts tombstones with empty bodies and returns no plaintext after decryption', async () => {
  const { context, key, workplaceId } = await setup();
  const { envelopes } = (await context.host.execute('encryptRows', {
    key,
    workplaceId,
    keyId: key.keyId,
    rows: [row({ deleted: true, plaintext: '' })],
  })) as { envelopes: Record<string, unknown>[] };
  const result = (await context.host.execute('decryptRows', {
    key,
    workplaceId,
    envelopes,
  })) as { rows: Record<string, unknown>[] };
  expect(result.rows[0]).toMatchObject({
    ok: true,
    rowId: 'row-1',
    table: 'transactions',
    schemaVersion: 35,
    compression: 'gzip' as const,
    plaintext: '',
  });
});

it('round-trips nonfinancial records without application-specific compression assets', async () => {
  const { context, workplaceId } = await setup();
  const request = row({
    table: 'weather.observation',
    compression: 'gzip' as const,
    plaintext: '{"temperature":21}',
  });
  const envelopes = await context.hierarchy.encryptRows(context.identity, workplaceId, [request]);
  expect(await context.hierarchy.decryptRows(context.identity, workplaceId, envelopes)).toEqual([
    {
      ok: true,
      table: request.table,
      rowId: request.rowId,
      schemaVersion: 35,
      compression: request.compression,
      plaintext: request.plaintext,
    },
  ]);
  for (const table of ['', 'x'.repeat(129), '\ud800'])
    await expect(
      context.hierarchy.encryptRows(context.identity, workplaceId, [row({ table })]),
    ).rejects.toThrow();
});

it('encrypts and decrypts record types through the 128 UTF-8 byte boundary', async () => {
  const { context, key, workplaceId } = await setup();
  const tables = [
    'x'.repeat(64),
    'x'.repeat(65),
    'x'.repeat(127),
    'x'.repeat(128),
    'é'.repeat(32) + 'a',
    'é'.repeat(63) + 'a',
    'é'.repeat(64),
    '😀'.repeat(32),
  ];
  const rows = tables.map((table, i) =>
    row({
      table,
      rowId: `boundary-${i}`,
      compression: 'gzip' as const,
    }),
  );
  // The hierarchy exercises the TypeScript bridge as well as real native crypto.
  const envelopes = await context.hierarchy.encryptRows(context.identity, workplaceId, rows);
  expect(envelopes.map(envelope => envelope.table)).toEqual(tables);
  expect(await context.hierarchy.decryptRows(context.identity, workplaceId, envelopes)).toEqual(
    rows.map(value => ({
      ok: true,
      table: value.table,
      rowId: value.rowId,
      schemaVersion: value.schemaVersion,
      compression: value.compression,
      plaintext: value.plaintext,
    })),
  );
  const longest = envelopes.at(-1)!;
  // A malformed envelope must retain its bounded type in the per-record error.
  expect(
    await context.host.execute('decryptRows', {
      key,
      workplaceId,
      envelopes: [{ ...longest, formatVersion: 99 }],
    }),
  ).toEqual({
    rows: [{ ok: false, table: longest.table, rowId: longest.rowId, error: 'FFB_ROW_INTEGRITY' }],
  });
  for (const table of ['x'.repeat(129), 'é'.repeat(64) + 'a', '😀'.repeat(32) + 'a']) {
    expect(new TextEncoder().encode(table).length).toBe(129);
    // Bypass the TS guard so native preflight rejection is independently tested.
    await expect(
      context.host.execute('encryptRows', {
        key,
        workplaceId,
        keyId: key.keyId,
        rows: [row({ table, compression: 'gzip' as const })],
      }),
    ).rejects.toMatchObject({ code: 'FFB_KEY_INVALID_FILE' });
    await expect(
      context.host.execute('decryptRows', {
        key,
        workplaceId,
        envelopes: [{ ...longest, table }],
      }),
    ).rejects.toMatchObject({ code: 'FFB_KEY_INVALID_FILE' });
  }
});
